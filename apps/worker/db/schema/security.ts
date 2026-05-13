/**
 * Security domain tables: security events (append-only), device verifications.
 */
import { index, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { jsonb } from '../bun-jsonb'
import { users } from './users'

// ---------------------------------------------------------------------------
// security_events (append-only — no UPDATE or DELETE operations)
// ---------------------------------------------------------------------------

export const securityEvents = pgTable(
  'security_events',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userPubkey: text('user_pubkey')
      .notNull()
      .references(() => users.pubkey, { onDelete: 'set null' }),
    eventType: text('event_type').notNull(),
    deviceId: text('device_id'),
    metadata: jsonb('metadata').notNull().default({}),
    ipHash: text('ip_hash'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('security_events_user_pubkey_idx').on(table.userPubkey),
    index('security_events_event_type_idx').on(table.eventType),
    index('security_events_created_at_idx').on(table.createdAt),
  ],
)

// ---------------------------------------------------------------------------
// device_verifications (SAS emoji verification records)
// ---------------------------------------------------------------------------

export const deviceVerifications = pgTable(
  'device_verifications',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    verifierPubkey: text('verifier_pubkey').notNull(),
    targetDeviceId: text('target_device_id').notNull(),
    targetPubkey: text('target_pubkey').notNull(),
    signedAuditEntry: text('signed_audit_entry').notNull(),
    verifiedAt: timestamp('verified_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('device_verifications_verifier_idx').on(table.verifierPubkey),
    index('device_verifications_target_idx').on(table.targetDeviceId),
  ],
)
