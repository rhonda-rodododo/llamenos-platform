/**
 * Shifts domain tables: shift schedules and push reminder tracking.
 */
import { sql } from 'drizzle-orm'
import {
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'

// ---------------------------------------------------------------------------
// shifts
// ---------------------------------------------------------------------------

export const shifts = pgTable('shifts', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  hubId: text('hub_id'),
  name: text('name').notNull(),
  startTime: text('start_time').notNull(),
  endTime: text('end_time').notNull(),
  days: integer('days')
    .array()
    .notNull()
    .default(sql`'{}'::int[]`),
  userPubkeys: text('user_pubkeys')
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

// ---------------------------------------------------------------------------
// push_reminders_sent
// ---------------------------------------------------------------------------

export const pushRemindersSent = pgTable(
  'push_reminders_sent',
  {
    shiftId: text('shift_id').notNull(),
    reminderDate: text('reminder_date').notNull(),
    pubkey: text('pubkey').notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [table.shiftId, table.reminderDate, table.pubkey],
    }),
  ],
)
