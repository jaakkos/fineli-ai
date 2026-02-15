import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';
import * as schemaPg from './schema.pg';
import path from 'path';
import fs from 'fs';

const url = process.env.DATABASE_URL || 'file:./data/fineli.db';
export const isPostgres = (): boolean =>
  url.startsWith('postgres://') || url.startsWith('postgresql://');

// ---------------------------------------------------------------------------
// SQLite (sync)
// ---------------------------------------------------------------------------

function getDbPath(): string {
  return url.replace(/^file:/, '');
}

function createSqliteDb() {
  const dbPath = getDbPath();
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  return drizzle(sqlite, { schema });
}

let _sqlite: ReturnType<typeof createSqliteDb> | null = null;
function getSqliteDb() {
  if (!_sqlite) _sqlite = createSqliteDb();
  return _sqlite;
}

// ---------------------------------------------------------------------------
// PostgreSQL (async)
// ---------------------------------------------------------------------------

let _pgPool: Pool | null = null;
function getPgPool(): Pool {
  if (!_pgPool) {
    if (!url || !isPostgres()) throw new Error('DATABASE_URL must be a postgres URL');
    _pgPool = new Pool({ connectionString: url });
  }
  return _pgPool;
}

function getPgDb() {
  return drizzlePg({ client: getPgPool(), schema: schemaPg });
}

// ---------------------------------------------------------------------------
// Unified async API for both backends
// ---------------------------------------------------------------------------

type SyncQueryWithGet<T> = { get: () => T | undefined };
type SyncQueryWithAll<T> = { all: () => T[] };
type SyncQueryWithRun = { run: () => void };

/**
 * PG timestamp format: "2024-01-15 12:00:00.000+00"
 * Drizzle with mode:'string' returns this instead of ISO "2024-01-15T12:00:00.000Z".
 * Matches "YYYY-MM-DD HH:MM:SS" (with optional fractional seconds and timezone).
 */
const PG_TS_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/;

/**
 * Normalize a row from PG: convert Date values and PG timestamp strings
 * to ISO strings so all app code receives consistent format regardless of backend.
 * SQLite already returns ISO text; this is a no-op for non-date values.
 */
function normalizeDates<T>(row: T): T {
  if (row == null || typeof row !== 'object' || row instanceof Date) {
    return row instanceof Date ? (row.toISOString() as unknown as T) : row;
  }
  const out = { ...row } as Record<string, unknown>;
  for (const key of Object.keys(out)) {
    const val = out[key];
    if (val instanceof Date) {
      out[key] = val.toISOString();
    } else if (typeof val === 'string' && PG_TS_RE.test(val)) {
      // Convert PG timestamp format → ISO 8601
      const d = new Date(val);
      if (!isNaN(d.getTime())) {
        out[key] = d.toISOString();
      }
    }
  }
  return out as T;
}

// -- SQLite helpers (sync, no normalization needed) -------------------------

async function sqliteSelectOne<T>(
  q: SyncQueryWithGet<T>
): Promise<T | undefined> {
  return Promise.resolve(q.get());
}

async function sqliteSelectAll<T>(q: SyncQueryWithAll<T>): Promise<T[]> {
  return Promise.resolve(q.all());
}

async function sqliteRun(q: SyncQueryWithRun): Promise<void> {
  return Promise.resolve(q.run());
}

// -- PG helpers (async, normalize Date → ISO string) ------------------------

async function pgSelectOne<T>(q: Promise<T[]>): Promise<T | undefined> {
  const rows = await q;
  return rows[0] ? normalizeDates(rows[0]) : undefined;
}

async function pgSelectAll<T>(q: Promise<T[]>): Promise<T[]> {
  const rows = await q;
  return rows.map(normalizeDates);
}

async function pgRun(q: Promise<unknown>): Promise<void> {
  await q;
}

// -- Generic wrappers that auto-detect sync/async --------------------------

async function selectOne<T>(
  q: SyncQueryWithGet<T> | Promise<T[]>
): Promise<T | undefined> {
  if (typeof (q as SyncQueryWithGet<T>).get === 'function') {
    return sqliteSelectOne(q as SyncQueryWithGet<T>);
  }
  return pgSelectOne(q as Promise<T[]>);
}

async function selectAll<T>(q: SyncQueryWithAll<T> | Promise<T[]>): Promise<T[]> {
  if (typeof (q as SyncQueryWithAll<T>).all === 'function') {
    return sqliteSelectAll(q as SyncQueryWithAll<T>);
  }
  return pgSelectAll(q as Promise<T[]>);
}

async function runQuery(q: SyncQueryWithRun | Promise<unknown>): Promise<void> {
  if (typeof (q as SyncQueryWithRun).run === 'function') {
    return sqliteRun(q as SyncQueryWithRun);
  }
  return pgRun(q as Promise<unknown>);
}

export type UnifiedDb = {
  raw: ReturnType<typeof getSqliteDb> | ReturnType<typeof getPgDb>;
  schema: typeof schema | typeof schemaPg;
  selectOne: typeof selectOne;
  selectAll: typeof selectAll;
  run: typeof runQuery;
};

let _unified: UnifiedDb | null = null;

/**
 * Returns a unified async DB interface. Use when DATABASE_URL may be either
 * SQLite (file:) or PostgreSQL (postgres://). Prefer getDb() for type-safe usage.
 */
export async function getDbUnified(): Promise<UnifiedDb> {
  if (_unified) return _unified;
  if (isPostgres()) {
    const raw = getPgDb();
    _unified = {
      raw,
      schema: schemaPg,
      selectOne,
      selectAll,
      run: runQuery,
    };
  } else {
    const raw = getSqliteDb();
    _unified = {
      raw,
      schema,
      selectOne,
      selectAll,
      run: runQuery,
    };
  }
  return _unified;
}

// ---------------------------------------------------------------------------
// Sync getDb for SQLite only. When DATABASE_URL is postgres, use getDbUnified() instead.
// ---------------------------------------------------------------------------

export function getDb(): ReturnType<typeof getSqliteDb> {
  if (isPostgres()) {
    throw new Error('Use getDbUnified() when DATABASE_URL is PostgreSQL');
  }
  return getSqliteDb();
}

export type AppDatabase = ReturnType<typeof getSqliteDb>;
