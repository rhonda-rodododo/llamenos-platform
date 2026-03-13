/**
 * Singleton PostgreSQL connection pool using postgres.js.
 * Reads DATABASE_URL from env, auto-creates tables on first connect.
 */
import postgres from 'postgres'

let pool: ReturnType<typeof postgres> | null = null

/**
 * Initialize the PostgreSQL connection pool.
 * Must be called before creating any PostgresStorage instances.
 */
export async function initPostgresPool(): Promise<ReturnType<typeof postgres>> {
  if (pool) return pool

  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is required')
  }

  const poolSize = parseInt(process.env.PG_POOL_SIZE || '10', 10)

  pool = postgres(databaseUrl, {
    max: poolSize,
    idle_timeout: 20,
    connect_timeout: 10,
  })

  // Auto-create tables. Wrapped in try/catch because concurrent
  // CREATE TABLE IF NOT EXISTS can race on pg_type creation (PostgreSQL
  // creates a composite type per table, and the IF NOT EXISTS check
  // doesn't cover the type insertion, leading to duplicate key errors).
  try {
    await pool`
      CREATE TABLE IF NOT EXISTS kv_store (
        namespace TEXT NOT NULL,
        key       TEXT NOT NULL,
        value     JSONB NOT NULL,
        PRIMARY KEY (namespace, key)
      )
    `
    await pool`
      CREATE TABLE IF NOT EXISTS alarms (
        namespace    TEXT NOT NULL PRIMARY KEY,
        scheduled_at BIGINT NOT NULL
      )
    `
    await pool`
      CREATE INDEX IF NOT EXISTS idx_alarms_scheduled ON alarms (scheduled_at)
    `
  } catch (err: unknown) {
    // Ignore duplicate type errors from concurrent table creation (code 23505 on pg_type)
    const pgErr = err as { code?: string; constraint_name?: string }
    if (pgErr.code === '23505' && pgErr.constraint_name === 'pg_type_typname_nsp_index') {
      // Tables already exist — safe to continue
    } else {
      throw err
    }
  }

  console.log(`[postgres] Pool initialized (max ${poolSize} connections)`)
  return pool
}

/**
 * Get the active pool instance.
 * Throws if pool hasn't been initialized.
 */
export function getPool(): ReturnType<typeof postgres> {
  if (!pool) {
    throw new Error('PostgreSQL pool not initialized — call initPostgresPool() first')
  }
  return pool
}

/**
 * Gracefully close the connection pool.
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end()
    pool = null
    console.log('[postgres] Pool closed')
  }
}
