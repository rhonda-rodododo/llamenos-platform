import { pgTable, text, bigint, timestamp } from 'drizzle-orm/pg-core'

export const signalIdentifiers = pgTable('signal_identifiers', {
  hash: text('hash').primaryKey(),
  ciphertext: text('ciphertext').notNull(),
  type: text('type', { enum: ['phone', 'username'] }).notNull(),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
})

export const signalAuditLog = pgTable('signal_audit_log', {
  id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
  action: text('action').notNull(),
  identifierHash: text('identifier_hash'),
  success: text('success', { enum: ['true', 'false'] }).notNull(),
  errorMessage: text('error_message'),
  metadata: text('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})
