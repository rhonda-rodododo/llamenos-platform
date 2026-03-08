import type { Migration } from './types'
import { MIGRATION_VERSION_KEY } from './types'

/**
 * Migration registry — append new migrations here.
 *
 * Rules:
 * - Always increment the version number
 * - Never modify or reorder existing migrations
 * - Migrations must be idempotent (safe to re-run)
 * - Use storage.get() / storage.put() / storage.delete() / storage.list()
 * - Include a down() function for rollback support where feasible
 */
export const migrations: Migration[] = [
  {
    version: 1,
    name: 'add-schema-version-baseline',
    async run(storage) {
      // Set baseline schema version marker — indicates this namespace
      // has been touched by the migration system.
      const existing = await storage.get<number>('__schema:version')
      if (existing === undefined) {
        await storage.put('__schema:version', 1)
      }
    },
    async down(storage) {
      await storage.delete('__schema:version')
    },
  },
]

// Re-export for convenience
export { MIGRATION_VERSION_KEY }
