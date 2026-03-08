import type { Migration } from './types'
import { MIGRATION_VERSION_KEY } from './types'
import type { ReportType, CustomFieldDefinition } from '../types'
import { DEFAULT_REPORT_TYPES } from '../types'

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
  {
    version: 2,
    name: 'migrate-report-categories-to-report-types',
    async run(storage) {
      // Check if report types already exist (idempotent)
      const existing = await storage.get<ReportType[]>('reportTypes')
      if (existing && existing.length > 0) return

      // Read old flat categories
      const categories = await storage.get<string[]>('reportCategories')

      const now = new Date().toISOString()

      if (categories && categories.length > 0) {
        // Convert each category string into a ReportType
        const reportTypes: ReportType[] = categories.map((cat, i) => {
          // Try to find a matching default to inherit icon
          const defaultMatch = DEFAULT_REPORT_TYPES.find(
            d => d.name.toLowerCase() === cat.toLowerCase()
          )
          return {
            id: crypto.randomUUID(),
            name: cat,
            description: defaultMatch?.description || '',
            icon: defaultMatch?.icon,
            fields: [] as CustomFieldDefinition[],
            isDefault: i === 0,
            isArchived: false,
            createdAt: now,
            updatedAt: now,
          }
        })
        await storage.put('reportTypes', reportTypes)
      } else {
        // No existing categories — seed with defaults
        const reportTypes: ReportType[] = DEFAULT_REPORT_TYPES.map(d => ({
          ...d,
          id: crypto.randomUUID(),
          fields: [] as CustomFieldDefinition[],
          isArchived: false,
          createdAt: now,
          updatedAt: now,
        }))
        await storage.put('reportTypes', reportTypes)
      }

      // Note: We do NOT delete 'reportCategories' — the old key is kept for
      // backward compatibility with any code that still reads it.
    },
  },
]

// Re-export for convenience
export { MIGRATION_VERSION_KEY }
