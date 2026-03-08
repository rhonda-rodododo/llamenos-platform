import type { Migration, MigrationStorage, MigrationRunOptions, MigrationHistoryEntry } from './types'
import { MIGRATION_VERSION_KEY, MIGRATION_HISTORY_KEY, MIGRATION_LAST_RUN_KEY } from './types'

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
  options?: MigrationRunOptions,
): Promise<void> {
  if (migrations.length === 0) return

  const currentVersion = (await storage.get<number>(MIGRATION_VERSION_KEY)) ?? 0

  // Sort by version ascending (defensive — registry should already be sorted)
  const sorted = [...migrations].sort((a, b) => a.version - b.version)
  const pending = sorted.filter(m => m.version > currentVersion)

  if (pending.length === 0) return

  const label = namespace ? ` [${namespace}]` : ''
  const dryRun = options?.dryRun ?? false
  const targetVersion = pending[pending.length - 1].version

  // Load existing history
  const history = dryRun
    ? []
    : (await storage.get<MigrationHistoryEntry[]>(MIGRATION_HISTORY_KEY)) ?? []

  let completedCount = 0
  for (const migration of pending) {
    if (dryRun) {
      console.log(`[migrations]${label} [DRY RUN] Would run v${migration.version}: ${migration.name}`)
    } else {
      console.log(`[migrations]${label} Running v${migration.version}: ${migration.name}`)
      await migration.run(storage)
      await storage.put(MIGRATION_VERSION_KEY, migration.version)

      // Record history
      history.push({
        version: migration.version,
        name: migration.name,
        status: 'applied',
        appliedAt: new Date().toISOString(),
      })
      await storage.put(MIGRATION_HISTORY_KEY, history)
      await storage.put(MIGRATION_LAST_RUN_KEY, new Date().toISOString())
    }

    completedCount++
    options?.onProgress?.({
      currentVersion: migration.version,
      targetVersion,
      migrationName: migration.name,
      totalPending: pending.length,
      completedCount,
    })
  }

  if (dryRun) {
    console.log(`[migrations]${label} [DRY RUN] ${pending.length} migration(s) would run (v${currentVersion} → v${targetVersion})`)
  } else {
    console.log(`[migrations]${label} Complete — now at v${targetVersion}`)
  }
}

/**
 * Roll back a single migration (the most recently applied one).
 * Returns the new current version, or null if rollback was not possible.
 */
export async function rollbackMigration(
  storage: MigrationStorage,
  migrations: Migration[],
  namespace?: string,
): Promise<{ rolledBackVersion: number; newVersion: number } | null> {
  const currentVersion = (await storage.get<number>(MIGRATION_VERSION_KEY)) ?? 0
  if (currentVersion === 0) return null

  const sorted = [...migrations].sort((a, b) => a.version - b.version)
  const current = sorted.find(m => m.version === currentVersion)
  if (!current) return null
  if (!current.down) {
    throw new Error(`Migration v${currentVersion} (${current.name}) does not support rollback — no down() defined`)
  }

  const label = namespace ? ` [${namespace}]` : ''
  console.log(`[migrations]${label} Rolling back v${currentVersion}: ${current.name}`)
  await current.down(storage)

  // Find the previous version
  const prevMigrations = sorted.filter(m => m.version < currentVersion)
  const newVersion = prevMigrations.length > 0 ? prevMigrations[prevMigrations.length - 1].version : 0
  await storage.put(MIGRATION_VERSION_KEY, newVersion)

  // Update history
  const history = (await storage.get<MigrationHistoryEntry[]>(MIGRATION_HISTORY_KEY)) ?? []
  const entry = history.find(h => h.version === currentVersion)
  if (entry) {
    entry.status = 'pending'
    entry.appliedAt = undefined
  }
  await storage.put(MIGRATION_HISTORY_KEY, history)
  await storage.put(MIGRATION_LAST_RUN_KEY, new Date().toISOString())

  console.log(`[migrations]${label} Rolled back to v${newVersion}`)
  return { rolledBackVersion: currentVersion, newVersion }
}

/**
 * Get current migration status for a storage instance.
 */
export async function getMigrationStatus(
  storage: MigrationStorage,
  migrations: Migration[],
): Promise<{
  currentVersion: number
  latestVersion: number
  pending: number
  history: MigrationHistoryEntry[]
  lastRun: string | null
}> {
  const currentVersion = (await storage.get<number>(MIGRATION_VERSION_KEY)) ?? 0
  const history = (await storage.get<MigrationHistoryEntry[]>(MIGRATION_HISTORY_KEY)) ?? []
  const lastRun = (await storage.get<string>(MIGRATION_LAST_RUN_KEY)) ?? null

  const sorted = [...migrations].sort((a, b) => a.version - b.version)
  const latestVersion = sorted.length > 0 ? sorted[sorted.length - 1].version : 0
  const pending = sorted.filter(m => m.version > currentVersion).length

  // Build full status including pending migrations
  const fullHistory: MigrationHistoryEntry[] = sorted.map(m => {
    const existing = history.find(h => h.version === m.version)
    if (existing) return existing
    return { version: m.version, name: m.name, status: 'pending' as const }
  })

  return { currentVersion, latestVersion, pending, history: fullHistory, lastRun }
}
