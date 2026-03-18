/**
 * Nostr domain tables: event outbox for reliable relay publishing.
 */
import { sql } from 'drizzle-orm'
import {
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'
import { jsonb } from '../bun-jsonb'

// ---------------------------------------------------------------------------
// nostr_event_outbox
// ---------------------------------------------------------------------------

export const nostrEventOutbox = pgTable(
  'nostr_event_outbox',
  {
    id: serial('id').primaryKey(),
    eventJson: jsonb('event_json').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    attempts: integer('attempts').default(0),
    nextRetryAt: timestamp('next_retry_at', { withTimezone: true }).defaultNow(),
    status: text('status').default('pending'),
  },
  (table) => [
    index('nostr_event_outbox_pending_idx')
      .on(table.status, table.nextRetryAt)
      .where(sql`status = 'pending'`),
  ],
)
