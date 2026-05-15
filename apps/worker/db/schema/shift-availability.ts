import { pgTable, text, timestamp, index } from 'drizzle-orm/pg-core'

export const userAvailabilityBlocks = pgTable('user_availability_blocks', {
  id: text('id').primaryKey(),
  hubId: text('hub_id').notNull(),
  userPubkey: text('user_pubkey').notNull(),
  startDate: text('start_date').notNull(),
  endDate: text('end_date').notNull(),
  encryptedReason: text('encrypted_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('availability_blocks_hub_user_idx').on(table.hubId, table.userPubkey),
  index('availability_blocks_hub_date_idx').on(table.hubId, table.startDate, table.endDate),
])
