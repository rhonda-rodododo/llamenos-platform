/**
 * Event outbox table — persistent queue for WebSocket events that
 * must survive process restarts and relay downtime.
 *
 * Events are written here before fan-out. On successful delivery
 * they are marked 'delivered'; on failure they are retried with
 * exponential backoff. A periodic sweep drains pending events and
 * cleans up expired rows.
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

export const eventOutbox = pgTable(
  'event_outbox',
  {
    id: serial('id').primaryKey(),
    /** Fully-signed, encrypted event payload (ready for fan-out) */
    eventJson: jsonb('event_json').notNull(),
    /** Hub ID for targeted fan-out (null = global) */
    hubId: text('hub_id'),
    /** Event kind (for filtering during drain) */
    kind: integer('kind').notNull(),
    /** Epoch at publish time */
    epoch: integer('epoch').notNull(),
    status: text('status').notNull().default('pending'),
    retryCount: integer('retry_count').notNull().default(0),
    lastError: text('last_error'),
    nextRetryAt: timestamp('next_retry_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('event_outbox_pending_idx')
      .on(table.nextRetryAt)
      .where(sql`status = 'pending'`),
    index('event_outbox_cleanup_idx')
      .on(table.status, table.createdAt)
      .where(sql`status IN ('delivered', 'failed')`),
  ],
)
