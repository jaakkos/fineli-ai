import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const url = process.env.DATABASE_URL || 'postgresql://fineli:fineli@localhost:5432/fineli';

// ---------------------------------------------------------------------------
// PostgreSQL connection pool
// ---------------------------------------------------------------------------

let _pool: Pool | null = null;
function getPool(): Pool {
  if (!_pool) {
    _pool = new Pool({ connectionString: url });
  }
  return _pool;
}

function getPgDb() {
  return drizzle({ client: getPool(), schema });
}

// ---------------------------------------------------------------------------
// Date normalization helpers
// ---------------------------------------------------------------------------

/**
 * PG timestamp format: "2024-01-15 12:00:00.000+00"
 * Drizzle with mode:'string' returns this instead of ISO "2024-01-15T12:00:00.000Z".
 * Matches "YYYY-MM-DD HH:MM:SS" (with optional fractional seconds and timezone).
 */
const PG_TS_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/;

/**
 * Normalize a row from PG: convert Date values and PG timestamp strings
 * to ISO strings so all app code receives consistent format.
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
      const d = new Date(val);
      if (!isNaN(d.getTime())) {
        out[key] = d.toISOString();
      }
    }
  }
  return out as T;
}

// ---------------------------------------------------------------------------
// Query helpers (async, normalize Date → ISO string)
// ---------------------------------------------------------------------------

async function selectOne<T>(q: Promise<T[]>): Promise<T | undefined> {
  const rows = await q;
  return rows[0] ? normalizeDates(rows[0]) : undefined;
}

async function selectAll<T>(q: Promise<T[]>): Promise<T[]> {
  const rows = await q;
  return rows.map(normalizeDates);
}

async function runQuery(q: Promise<unknown>): Promise<void> {
  await q;
}

// ---------------------------------------------------------------------------
// Unified async DB interface
// ---------------------------------------------------------------------------

export type UnifiedDb = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle PG instance; callers need dynamic access
  raw: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- schema module
  schema: any;
  selectOne: typeof selectOne;
  selectAll: typeof selectAll;
  run: typeof runQuery;
};

let _unified: UnifiedDb | null = null;

/**
 * Returns the unified async DB interface backed by PostgreSQL.
 */
export async function getDbUnified(): Promise<UnifiedDb> {
  if (_unified) return _unified;
  const raw = getPgDb();
  _unified = {
    raw,
    schema,
    selectOne,
    selectAll,
    run: runQuery,
  };
  return _unified;
}
