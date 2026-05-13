/**
 * Retention domain tables: per-hub retention settings
 * and platform-enforced minimum retention floors.
 */
import {
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'

// ---------------------------------------------------------------------------
// retention_settings (composite PK: hub_id + category)
// ---------------------------------------------------------------------------

export const retentionSettings = pgTable(
  'retention_settings',
  {
    hubId: text('hub_id').notNull(),
    category: text('category').notNull(),
    retentionDays: integer('retention_days').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedBy: text('updated_by').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.hubId, table.category] }),
  ],
)

// ---------------------------------------------------------------------------
// retention_platform_floors (PK: category)
// ---------------------------------------------------------------------------

export const retentionPlatformFloors = pgTable('retention_platform_floors', {
  category: text('category').primaryKey(),
  minRetentionDays: integer('min_retention_days').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedBy: text('updated_by').notNull(),
})
