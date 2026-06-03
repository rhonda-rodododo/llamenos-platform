/**
 * Drizzle ORM database connection.
 * Uses Bun's native SQL driver via drizzle-orm/bun-sql.
 */
import './pg-array-patch' // Must be first — patches PgArray before schema loads
import { drizzle, type BunSQLDatabase } from 'drizzle-orm/bun-sql'
import { SQL } from 'bun'
import * as schema from './schema'
import { createLogger } from '../lib/logger'

const logger = createLogger('db')

export type Database = BunSQLDatabase<typeof schema>

let db: Database | null = null

/**
 * Create the Drizzle database instance.
 * Called once at server startup.
 */
export function createDatabase(databaseUrl: string): Database {
  if (db) return db

  const poolSize = parseInt(process.env.PG_POOL_SIZE || '10', 10)
  // PG_IDLE_TIMEOUT=0 disables idle timeouts (connections live for the pool lifetime).
  // Default is 0 so development and test runs don't crash when the pool goes quiet
  // between parallel test batches. Production deployments can set PG_IDLE_TIMEOUT
  // (e.g., 300) to reclaim connections during low-traffic windows.
  const idleTimeoutRaw = process.env.PG_IDLE_TIMEOUT
  const idleTimeout = idleTimeoutRaw !== undefined ? parseInt(idleTimeoutRaw, 10) : 0

  const client = new SQL({
    url: databaseUrl,
    max: poolSize,
    idleTimeout,
    connectionTimeout: 30,
  })

  db = drizzle({ client, schema })
  return db
}

/**
 * Get the active database instance.
 * Throws if not initialized.
 */
export function getDb(): Database {
  if (!db) throw new Error('Database not initialized — call createDatabase() first')
  return db
}

/**
 * Create an isolated Drizzle database instance (non-singleton).
 * Used for per-worker test isolation — each worker gets its own connection pool
 * with a search_path pointing to a worker-specific PostgreSQL schema.
 */
export function createIsolatedDatabase(databaseUrl: string, poolSize = 3): Database {
  const idleTimeoutRaw = process.env.PG_IDLE_TIMEOUT
  const idleTimeout = idleTimeoutRaw !== undefined ? parseInt(idleTimeoutRaw, 10) : 0

  const client = new SQL({
    url: databaseUrl,
    max: poolSize,
    idleTimeout,
    connectionTimeout: 30,
  })

  return drizzle({ client, schema })
}

/**
 * Close the database connection.
 */
export async function closeDb(): Promise<void> {
  if (db) {
    // Access the underlying Bun SQL client to close it
    const bunDb = db as BunSQLDatabase<typeof schema> & { $client: SQL }
    await bunDb.$client.close()
    db = null
    logger.info('Connection closed')
  }
}

/**
 * Close an isolated database instance returned by createIsolatedDatabase().
 */
export async function closeIsolatedDb(isolatedDb: Database): Promise<void> {
  const bunDb = isolatedDb as BunSQLDatabase<typeof schema> & { $client: SQL }
  await bunDb.$client.close()
}

// Re-export schema for convenience
export { schema }
