/**
 * Drizzle ORM database connection.
 * Uses Bun's native SQL driver via drizzle-orm/bun-sql.
 */
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
  const idleTimeout = parseInt(process.env.PG_IDLE_TIMEOUT || '60', 10)

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
