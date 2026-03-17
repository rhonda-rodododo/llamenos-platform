/**
 * Run migrations for all existing namespaces at Node.js server startup.
 * Uses advisory locks to prevent concurrent migration across replicas.
 *
 * Production safety: Requires RUN_MIGRATIONS=true in production environments.
 * This prevents accidental migration runs during deploys — migrations must be
 * explicitly opt-in via environment variable or CLI tooling.
 */
import { getPool } from './postgres-pool'
import { PostgresStorage } from './postgres-storage'
import { runMigrations } from '../../../../packages/shared/migrations/runner'
import { migrations } from '../../../../packages/shared/migrations'

export async function runStartupMigrations(): Promise<void> {
  if (migrations.length === 0) {
    console.log('[migrations] No migrations registered — skipping')
    return
  }

  // Production safety guard: require explicit opt-in
  const env = process.env.ENVIRONMENT || 'production'
  const runMigrationsEnv = process.env.RUN_MIGRATIONS
  if (env === 'production' && runMigrationsEnv !== 'true') {
    console.log('[migrations] Production mode — set RUN_MIGRATIONS=true to run migrations at startup')
    return
  }

  const sql = getPool()

  // Find all existing namespaces
  const rows = await sql`SELECT DISTINCT namespace FROM kv_store`
  const namespaces = rows.map((r: any) => r.namespace as string)

  if (namespaces.length === 0) {
    console.log('[migrations] No existing namespaces — skipping')
    return
  }

  console.log(`[migrations] Checking ${namespaces.length} namespace(s)...`)

  for (const namespace of namespaces) {
    // Use advisory lock to serialize migration per namespace
    await sql.begin(async (tx: any) => {
      await tx`SELECT pg_advisory_xact_lock(hashtext(${`migrate:${namespace}`}))`

      // Create a temporary storage for this namespace
      const storage = new PostgresStorage(namespace)
      await runMigrations(storage, migrations, namespace)
    })
  }
}
