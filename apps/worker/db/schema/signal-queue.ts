/**
 * Signal message queue table: PostgreSQL-backed retry queue for
 * Signal message delivery with exponential backoff.
 */
import { sql } from 'drizzle-orm'
import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

// ---------------------------------------------------------------------------
// signal_message_queue
// ---------------------------------------------------------------------------

export const signalMessageQueue = pgTable(
  'signal_message_queue',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    hubId: text('hub_id'),
    conversationId: text('conversation_id').notNull(),
    recipientIdentifier: text('recipient_identifier').notNull(),
    body: text('body').notNull(),
    mediaUrl: text('media_url'),
    mediaType: text('media_type'),
    externalId: text('external_id'),
    idempotencyKey: text('idempotency_key'),
    status: text('status').notNull().default('pending'),
    retryCount: integer('retry_count').notNull().default(0),
    lastError: text('last_error'),
    nextRetryAt: timestamp('next_retry_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Partial index for efficient polling of pending messages ready for retry
    index('signal_queue_pending_idx')
      .on(table.nextRetryAt)
      .where(sql`status = 'pending'`),
    // Rate-limit lookups: recent sends per recipient
    index('signal_queue_recipient_status_idx')
      .on(table.recipientIdentifier, table.status, table.updatedAt),
    // Idempotency: prevent duplicate enqueues
    uniqueIndex('signal_queue_idempotency_idx')
      .on(table.idempotencyKey)
      .where(sql`idempotency_key IS NOT NULL`),
    // Hub-scoped stats queries
    index('signal_queue_hub_status_idx')
      .on(table.hubId, table.status),
  ],
)
