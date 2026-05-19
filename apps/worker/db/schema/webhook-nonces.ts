import { pgTable, text, timestamp, index } from 'drizzle-orm/pg-core'

export const webhookNonces = pgTable('webhook_nonces', {
  nonceHash: text('nonce_hash').primaryKey(),
  provider: text('provider').notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
}, (table) => [
  index('idx_webhook_nonces_expires').on(table.expiresAt),
])
