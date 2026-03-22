/**
 * Drizzle ORM database connection.
 * Uses Bun's native SQL driver via drizzle-orm/bun-sql.
 */
import './pg-array-patch' // Must be first — patches PgArray before schema loads
import { drizzle, type BunSQLDatabase } from 'drizzle-orm/bun-sql'
import { SQL } from 'bun'
import * as schema from './schema'

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
 * Close the database connection.
 */
export async function closeDb(): Promise<void> {
  if (db) {
    // Access the underlying Bun SQL client to close it
    const bunDb = db as BunSQLDatabase<typeof schema> & { $client: SQL }
    await bunDb.$client.close()
    db = null
    console.log('[db] Connection closed')
  }
}

// Re-export schema for convenience
export { schema }
