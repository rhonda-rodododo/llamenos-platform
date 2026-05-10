import { sql } from 'drizzle-orm'
import {
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'
import { hubs } from './settings'

export const providerConfigs = pgTable('provider_configs', {
  id: text('id').primaryKey(),
  hubId: text('hub_id').references(() => hubs.id, { onDelete: 'cascade' }),
  providerType: text('provider_type').notNull(),
  credentials: text('credentials'),
  status: text('status').notNull().default('disconnected'),
  capabilities: text('capabilities')
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  phoneNumbers: text('phone_numbers')
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  error: text('error'),
  lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export const oauthStates = pgTable('oauth_states', {
  id: text('id').primaryKey(),
  provider: text('provider').notNull(),
  status: text('status').notNull().default('pending'),
  redirectUrl: text('redirect_url').notNull(),
  callbackScheme: text('callback_scheme'),
  error: text('error'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export const signalRegistrations = pgTable('signal_registrations', {
  id: text('id').primaryKey(),
  hubId: text('hub_id').notNull(),
  bridgeUrl: text('bridge_url'),
  phoneNumber: text('phone_number').notNull(),
  method: text('method').notNull(),
  status: text('status').notNull().default('pending'),
  error: text('error'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export const a2pRegistrations = pgTable('a2p_registrations', {
  id: text('id').primaryKey(),
  hubId: text('hub_id').notNull(),
  providerType: text('provider_type').notNull(),
  brandStatus: text('brand_status').notNull().default('not_submitted'),
  campaignStatus: text('campaign_status').notNull().default('not_submitted'),
  submittedAt: timestamp('submitted_at', { withTimezone: true }),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})
