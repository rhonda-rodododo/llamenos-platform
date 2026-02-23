import type { Migration, MigrationStorage } from './types'
import { MIGRATION_VERSION_KEY } from './types'

/**
 * Run all pending migrations against a storage instance.
 * Safe to call multiple times — only runs migrations with version > current.
 *
 * On CF: single-writer guarantee prevents concurrent runs.
 * On PostgreSQL: caller should hold advisory lock.
 */
export async function runMigrations(
  storage: MigrationStorage,
  migrations: Migration[],
  namespace?: string,
): Promise<void> {
  if (migrations.length === 0) return

  const currentVersion = (await storage.get<number>(MIGRATION_VERSION_KEY)) ?? 0

  // Sort by version ascending (defensive — registry should already be sorted)
  const sorted = [...migrations].sort((a, b) => a.version - b.version)
  const pending = sorted.filter(m => m.version > currentVersion)

  if (pending.length === 0) return

  const label = namespace ? ` [${namespace}]` : ''
  for (const migration of pending) {
    console.log(`[migrations]${label} Running v${migration.version}: ${migration.name}`)
    await migration.run(storage)
    await storage.put(MIGRATION_VERSION_KEY, migration.version)
  }

  console.log(`[migrations]${label} Complete — now at v${pending[pending.length - 1].version}`)
}
