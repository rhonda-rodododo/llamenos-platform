/**
 * Minimal storage interface for migrations.
 * Accepts both our StorageApi and CF's DurableObjectStorage
 * (which returns boolean from delete instead of void).
 */
export interface MigrationStorage {
  get<T = unknown>(key: string): Promise<T | undefined>
  put(key: string, value: unknown): Promise<void>
  delete(key: string): Promise<void | boolean>
  list(options?: { prefix?: string }): Promise<Map<string, unknown>>
}

/**
 * A single data migration that runs against storage.
 * Works identically on CF DOs (KV) and PostgreSQL (kv_store table).
 */
export interface Migration {
  /** Sequential version number — migrations run in order */
  version: number
  /** Human-readable name for logging/status */
  name: string
  /** The migration function — receives storage and performs data transformations */
  run(storage: MigrationStorage): Promise<void>
  /** Reverse the migration — receives storage and undoes data transformations */
  down?(storage: MigrationStorage): Promise<void>
}

/** Options for controlling migration execution */
export interface MigrationRunOptions {
  /** If true, validate but don't apply changes */
  dryRun?: boolean
  /** Progress callback — called after each migration completes */
  onProgress?: (progress: MigrationProgress) => void
}

/** Progress information emitted during migration execution */
export interface MigrationProgress {
  /** Current migration version being applied */
  currentVersion: number
  /** Target version (last migration's version) */
  targetVersion: number
  /** Name of the migration just completed */
  migrationName: string
  /** Total migrations to run */
  totalPending: number
  /** How many have completed so far */
  completedCount: number
}

/** Status of a migration (applied or pending) */
export type MigrationStatus = 'applied' | 'pending'

/** History entry for a single migration */
export interface MigrationHistoryEntry {
  version: number
  name: string
  status: MigrationStatus
  appliedAt?: string
}

/** Reserved key for tracking migration version per namespace */
export const MIGRATION_VERSION_KEY = '__migrations:version'

/** Reserved key for storing migration history entries */
export const MIGRATION_HISTORY_KEY = '__migrations:history'

/** Reserved key for storing the last migration run timestamp */
export const MIGRATION_LAST_RUN_KEY = '__migrations:lastRun'
