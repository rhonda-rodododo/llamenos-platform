/**
 * Blast domain tables: subscribers, blasts, blast settings.
 */
import { relations, sql } from 'drizzle-orm'
import {
  boolean,
  pgTable,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core'
import { jsonb } from '../bun-jsonb'

// ---------------------------------------------------------------------------
// subscribers
// ---------------------------------------------------------------------------

export const subscribers = pgTable(
  'subscribers',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    hubId: text('hub_id'),
    identifierHash: text('identifier_hash').notNull(),
    channels: jsonb('channels').notNull().default(sql`'[]'::jsonb`),
    tags: text('tags').array().default(sql`'{}'::text[]`),
    language: text('language').notNull().default('en'),
    status: text('status').notNull().default('active'),
    doubleOptInConfirmed: boolean('double_opt_in_confirmed').default(false),
    preferenceToken: text('preference_token').unique(),
    subscribedAt: timestamp('subscribed_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('subscribers_hub_identifier_idx').on(
      table.hubId,
      table.identifierHash,
    ),
  ],
)

// ---------------------------------------------------------------------------
// blasts
// ---------------------------------------------------------------------------

export const blasts = pgTable('blasts', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  hubId: text('hub_id'),
  name: text('name').notNull(),
  content: jsonb('content').notNull().default(sql`'{}'::jsonb`),
  status: text('status').notNull().default('draft'),
  targetChannels: text('target_channels')
    .array()
    .default(sql`'{}'::text[]`),
  targetTags: text('target_tags').array().default(sql`'{}'::text[]`),
  targetLanguages: text('target_languages')
    .array()
    .default(sql`'{}'::text[]`),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  createdBy: text('created_by'),
  stats: jsonb('stats').notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

// ---------------------------------------------------------------------------
// blast_settings
// ---------------------------------------------------------------------------

export const blastSettings = pgTable('blast_settings', {
  hubId: text('hub_id').primaryKey(),
  settings: jsonb('settings').notNull().default(sql`'{}'::jsonb`),
})

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const blastsRelations = relations(blasts, ({}) => ({}))

export const subscribersRelations = relations(subscribers, ({}) => ({}))
