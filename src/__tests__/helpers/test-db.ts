import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { sql } from 'drizzle-orm';
import * as schema from '@/lib/db/schema';

let _pool: Pool | null = null;

function getTestPool(): Pool {
  if (!_pool) {
    const url = process.env.DATABASE_URL || 'postgresql://fineli:fineli@localhost:5432/fineli';
    _pool = new Pool({ connectionString: url });
  }
  return _pool;
}

export function createTestDb() {
  const pool = getTestPool();
  const db = drizzle(pool, { schema });
  return { db, pool };
}

/**
 * Truncate all tables in the correct order (respecting FK constraints).
 * Call in beforeEach to get a clean DB for each test.
 */
export async function truncateAllTables(db: ReturnType<typeof createTestDb>['db']) {
  await db.execute(sql`TRUNCATE TABLE
    export_template_versions,
    conversation_state,
    conversation_messages,
    meal_items,
    meals,
    diary_days,
    auth_tokens,
    users
    CASCADE`);
}
