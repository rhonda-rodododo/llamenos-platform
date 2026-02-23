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
}

/** Reserved key for tracking migration version per namespace */
export const MIGRATION_VERSION_KEY = '__migrations:version'
