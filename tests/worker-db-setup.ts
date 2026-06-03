/**
 * Per-worker PostgreSQL schema setup for E2E test isolation.
 *
 * Creates isolated PostgreSQL schemas (test_worker_0, test_worker_1, ...)
 * so each Playwright worker operates on its own copy of the database tables.
 * This prevents parallel workers from interfering with each other's data.
 *
 * Usage:
 *   - Called from tests/global-setup.ts before tests begin
 *   - Schemas are dropped by tests/global-teardown.ts after all tests complete
 *
 * How it works:
 *   1. Connects to PostgreSQL using DATABASE_URL
 *   2. For each worker index (0..N-1), creates a schema test_worker_N
 *   3. Clones ALL tables from the public schema into each worker schema
 *      (using CREATE TABLE ... (LIKE public.table INCLUDING ALL))
 *   4. The backend reads X-Test-Worker-Index header and routes to worker-specific
 *      services with search_path set to the corresponding schema
 */

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://llamenos:ci-test-password@localhost:5432/llamenos'

/**
 * Execute raw SQL against the database using Bun's native SQL driver.
 */
async function execSQL(sql: string): Promise<void> {
  const { SQL } = await import('bun')
  const client = new SQL({ url: DATABASE_URL, max: 1, connectionTimeout: 30 })
  try {
    await client.unsafe(sql)
  } finally {
    await client.close()
  }
}

/**
 * Get all user-created table names from the public schema.
 */
async function getPublicTables(): Promise<string[]> {
  const { SQL } = await import('bun')
  const client = new SQL({ url: DATABASE_URL, max: 1, connectionTimeout: 30 })
  try {
    const rows = await client.unsafe(`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `)
    return rows.map((r: Record<string, unknown>) => r.tablename as string)
  } finally {
    await client.close()
  }
}

/**
 * Get all sequences from the public schema.
 */
async function getPublicSequences(): Promise<string[]> {
  const { SQL } = await import('bun')
  const client = new SQL({ url: DATABASE_URL, max: 1, connectionTimeout: 30 })
  try {
    const rows = await client.unsafe(`
      SELECT sequencename FROM pg_sequences
      WHERE schemaname = 'public'
      ORDER BY sequencename
    `)
    return rows.map((r: Record<string, unknown>) => r.sequencename as string)
  } finally {
    await client.close()
  }
}

/**
 * Create per-worker schemas with all tables cloned from public.
 * Tables are created using LIKE ... INCLUDING ALL which copies:
 * - Column definitions and defaults
 * - Constraints (NOT NULL, CHECK, UNIQUE, PRIMARY KEY)
 * - Indexes
 * - Comments
 *
 * Foreign key constraints reference tables within the same schema
 * because search_path resolves unqualified names to the current schema.
 */
export async function createWorkerSchemas(workerCount: number): Promise<void> {
  const { SQL } = await import('bun')
  const client = new SQL({ url: DATABASE_URL, max: 1, connectionTimeout: 30 })

  try {
    const tables = await getPublicTables()
    const sequences = await getPublicSequences()

    for (let i = 0; i < workerCount; i++) {
      const schemaName = `test_worker_${i}`

      // Drop and recreate schema for a clean slate
      await client.unsafe(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`)
      await client.unsafe(`CREATE SCHEMA ${schemaName}`)

      // Clone sequences first (tables with serial/identity columns depend on them)
      for (const seq of sequences) {
        await client.unsafe(
          `CREATE SEQUENCE IF NOT EXISTS ${schemaName}."${seq}"`
        )
      }

      // Clone tables with all constraints and indexes
      for (const table of tables) {
        // Skip drizzle migration tracking table — not needed per-worker
        if (table === '__drizzle_migrations' || table === 'drizzle_migrations') continue

        try {
          await client.unsafe(
            `CREATE TABLE ${schemaName}."${table}" (LIKE public."${table}" INCLUDING ALL)`
          )
        } catch (err) {
          // Table might already exist from a previous incomplete run
          const msg = err instanceof Error ? err.message : String(err)
          if (!msg.includes('already exists')) {
            console.warn(`[worker-db-setup] Failed to clone table ${table} into ${schemaName}: ${msg}`)
          }
        }
      }

      console.log(`[worker-db-setup] Created schema ${schemaName} with ${tables.length} tables`)
    }
  } finally {
    await client.close()
  }
}

/**
 * Drop all per-worker schemas.
 */
export async function dropWorkerSchemas(workerCount: number): Promise<void> {
  const { SQL } = await import('bun')
  const client = new SQL({ url: DATABASE_URL, max: 1, connectionTimeout: 30 })

  try {
    for (let i = 0; i < workerCount; i++) {
      const schemaName = `test_worker_${i}`
      await client.unsafe(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`)
      console.log(`[worker-db-setup] Dropped schema ${schemaName}`)
    }
  } finally {
    await client.close()
  }
}

/**
 * Initialize a worker schema with default data (roles, settings, admin user).
 * Calls the backend's test-reset and bootstrap endpoints scoped to the worker.
 */
export async function initWorkerSchema(
  workerIndex: number,
  backendUrl: string,
  testSecret: string,
  adminPubkey: string,
): Promise<void> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Test-Secret': testSecret,
    'X-Test-Worker-Index': String(workerIndex),
  }

  // Call test-reset to initialize the schema with default roles and settings
  const resetRes = await fetch(`${backendUrl}/api/test-reset`, {
    method: 'POST',
    headers,
  })
  if (!resetRes.ok && resetRes.status !== 403 && resetRes.status !== 404) {
    console.warn(`[worker-db-setup] test-reset for worker ${workerIndex}: ${resetRes.status}`)
  }
}
