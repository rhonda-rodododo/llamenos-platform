/**
 * Erasure domain tables: erasure requests, erasure config,
 * re-encryption jobs, audit user keys.
 */
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'
import { jsonb } from '../bun-jsonb'

// ---------------------------------------------------------------------------
// erasure_requests
// ---------------------------------------------------------------------------

export const erasureRequests = pgTable(
  'erasure_requests',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id').notNull(),
    status: text('status').notNull().default('pending'),
    requestedBy: text('requested_by').notNull(),
    requestedAt: timestamp('requested_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    executeAt: timestamp('execute_at', { withTimezone: true }).notNull(),
    executedAt: timestamp('executed_at', { withTimezone: true }),
    justification: text('justification'),
    emergencyOverride: boolean('emergency_override').notNull().default(false),
    coApproverPubkey: text('co_approver_pubkey'),
    coApproverSignature: text('co_approver_signature'),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  },
  (table) => [
    index('erasure_requests_user_id_idx').on(table.userId),
    index('erasure_requests_status_idx').on(table.status),
    index('erasure_requests_execute_at_idx').on(table.executeAt),
  ],
)

// ---------------------------------------------------------------------------
// erasure_config (per-hub, PK = hubId)
// ---------------------------------------------------------------------------

export const erasureConfig = pgTable('erasure_config', {
  hubId: text('hub_id').primaryKey(),
  delayHours: integer('delay_hours').notNull().default(72),
  emergencyOverrideEnabled: boolean('emergency_override_enabled')
    .notNull()
    .default(true),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedBy: text('updated_by').notNull(),
})

// ---------------------------------------------------------------------------
// re_encryption_jobs
// ---------------------------------------------------------------------------

export const reEncryptionJobs = pgTable(
  're_encryption_jobs',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id').notNull(),
    hubId: text('hub_id').notNull(),
    status: text('status').notNull().default('queued'),
    totalEnvelopes: integer('total_envelopes').notNull().default(0),
    processedEnvelopes: integer('processed_envelopes').notNull().default(0),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('re_encryption_jobs_user_id_idx').on(table.userId),
    index('re_encryption_jobs_status_idx').on(table.status),
  ],
)

// ---------------------------------------------------------------------------
// audit_user_keys (per-user audit envelope key, HPKE-wrapped)
// ---------------------------------------------------------------------------

export const auditUserKeys = pgTable('audit_user_keys', {
  userPubkey: text('user_pubkey').primaryKey(),
  encryptedKey: text('encrypted_key').notNull(),
  adminEnvelopes: jsonb('admin_envelopes').notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})
