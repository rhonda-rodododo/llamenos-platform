import { pgTable, text, timestamp, index, unique } from 'drizzle-orm/pg-core'
import { shifts } from './shifts'

export const shiftOverrides = pgTable('shift_overrides', {
  id: text('id').primaryKey(),
  hubId: text('hub_id').notNull(),
  shiftId: text('shift_id').references(() => shifts.id, { onDelete: 'cascade' }),
  date: text('date').notNull(),
  type: text('type').notNull(),
  userPubkeys: text('user_pubkeys').array(),
  encryptedNote: text('encrypted_note'),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique('shift_overrides_hub_shift_date').on(table.hubId, table.shiftId, table.date),
  index('shift_overrides_hub_date_idx').on(table.hubId, table.date),
])

