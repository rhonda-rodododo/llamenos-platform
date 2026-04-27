/**
 * MLS (Message Layer Security) pending message table.
 *
 * The server acts as a delivery service for MLS handshake messages.
 * Commit and Welcome messages are fanned out to group members and queued here
 * until the target device acknowledges receipt.  Application-layer MLS messages
 * (SFrame-encrypted media) are NOT stored here — only handshake control messages.
 */
import { relations } from 'drizzle-orm'
import {
  index,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'
import { jsonb } from '../bun-jsonb'
import { devices } from './users'

// ---------------------------------------------------------------------------
// mls_pending_messages
// ---------------------------------------------------------------------------

export const mlsPendingMessages = pgTable(
  'mls_pending_messages',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    /** Hub whose MLS group this message belongs to. */
    hubId: text('hub_id').notNull(),
    /** Device that must receive and process this message. */
    recipientDeviceId: text('recipient_device_id')
      .notNull()
      .references(() => devices.id, { onDelete: 'cascade' }),
    /**
     * MLS message type:
     * 'commit'      — group state advance (fan-out to all members)
     * 'welcome'     — new member bootstrapping (point-to-point)
     * 'key_package' — pre-key material uploaded by a device
     * 'proposal'    — standalone MLS proposal (add/remove/update)
     */
    messageType: text('message_type').notNull(),
    /**
     * Opaque MLS message payload (TLS-serialised MLSMessage).
     * Stored as base64url text.
     */
    payload: jsonb('payload').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('mls_pending_messages_hub_idx').on(table.hubId),
    index('mls_pending_messages_device_idx').on(table.recipientDeviceId),
    index('mls_pending_messages_hub_device_idx').on(
      table.hubId,
      table.recipientDeviceId,
    ),
  ],
)

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const mlsPendingMessagesRelations = relations(
  mlsPendingMessages,
  ({ one }) => ({
    device: one(devices, {
      fields: [mlsPendingMessages.recipientDeviceId],
      references: [devices.id],
    }),
  }),
)
