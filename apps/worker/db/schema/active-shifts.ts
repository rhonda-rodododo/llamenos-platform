import { pgTable, text, timestamp, primaryKey } from 'drizzle-orm/pg-core'

export const activeShifts = pgTable('active_shifts', {
  pubkey: text('pubkey').notNull(),
  hubId: text('hub_id').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  lastHeartbeat: timestamp('last_heartbeat', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.pubkey, table.hubId] }),
])
