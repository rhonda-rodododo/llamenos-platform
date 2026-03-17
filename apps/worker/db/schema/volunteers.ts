/**
 * Identity domain tables: volunteers, sessions, invite codes,
 * WebAuthn credentials/challenges, devices, provision rooms.
 */
import { relations, sql } from 'drizzle-orm'
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'

// ---------------------------------------------------------------------------
// volunteers
// ---------------------------------------------------------------------------

export const volunteers = pgTable('volunteers', {
  pubkey: text('pubkey').primaryKey(),
  roles: text('roles')
    .array()
    .notNull()
    .default(sql`'{"volunteer"}'::text[]`),
  displayName: text('display_name'),
  phone: text('phone'),
  status: text('status').notNull().default('active'),
  hubRoles: jsonb('hub_roles').notNull().default([]),
  availability: text('availability').notNull().default('unavailable'),
  onBreak: boolean('on_break').default(false),
  callPreference: text('call_preference'),
  spokenLanguages: text('spoken_languages')
    .array()
    .default(sql`'{}'::text[]`),
  uiLanguage: text('ui_language'),
  transcriptionEnabled: boolean('transcription_enabled').default(true),
  profileCompleted: boolean('profile_completed').default(false),
  active: boolean('active').notNull().default(true),
  encryptedSecretKey: text('encrypted_secret_key').default(''),
  supportedMessagingChannels: text('supported_messaging_channels').array(),
  messagingEnabled: boolean('messaging_enabled'),
  specializations: text('specializations')
    .array()
    .default(sql`'{}'::text[]`),
  maxCaseAssignments: integer('max_case_assignments'),
  teamId: text('team_id'),
  supervisorPubkey: text('supervisor_pubkey'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

// ---------------------------------------------------------------------------
// sessions
// ---------------------------------------------------------------------------

export const sessions = pgTable(
  'sessions',
  {
    token: text('token').primaryKey(),
    pubkey: text('pubkey')
      .notNull()
      .references(() => volunteers.pubkey, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    deviceInfo: jsonb('device_info'),
  },
  (table) => [
    index('sessions_pubkey_idx').on(table.pubkey),
    index('sessions_expires_at_idx').on(table.expiresAt),
  ],
)

// ---------------------------------------------------------------------------
// invite_codes
// ---------------------------------------------------------------------------

export const inviteCodes = pgTable('invite_codes', {
  code: text('code').primaryKey(),
  name: text('name').notNull().default(''),
  phone: text('phone').notNull().default(''),
  roleIds: text('role_ids')
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  createdBy: text('created_by'),
  hubId: text('hub_id'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  usedBy: text('used_by'),
})

// ---------------------------------------------------------------------------
// webauthn_credentials
// ---------------------------------------------------------------------------

export const webauthnCredentials = pgTable(
  'webauthn_credentials',
  {
    credentialId: text('credential_id').primaryKey(),
    pubkey: text('pubkey')
      .notNull()
      .references(() => volunteers.pubkey, { onDelete: 'cascade' }),
    publicKey: text('public_key').notNull(),
    counter: integer('counter').notNull().default(0),
    transports: text('transports').array(),
    backedUp: boolean('backed_up').default(false),
    label: text('label').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  (table) => [index('webauthn_credentials_pubkey_idx').on(table.pubkey)],
)

// ---------------------------------------------------------------------------
// webauthn_challenges
// ---------------------------------------------------------------------------

export const webauthnChallenges = pgTable('webauthn_challenges', {
  challengeId: text('challenge_id').primaryKey(),
  challenge: text('challenge').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

// ---------------------------------------------------------------------------
// devices
// ---------------------------------------------------------------------------

export const devices = pgTable(
  'devices',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    pubkey: text('pubkey')
      .notNull()
      .references(() => volunteers.pubkey, { onDelete: 'cascade' }),
    platform: text('platform').notNull(),
    pushToken: text('push_token'),
    voipToken: text('voip_token'),
    wakeKeyPublic: text('wake_key_public'),
    registeredAt: timestamp('registered_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  },
  (table) => [index('devices_pubkey_idx').on(table.pubkey)],
)

// ---------------------------------------------------------------------------
// provision_rooms
// ---------------------------------------------------------------------------

export const provisionRooms = pgTable('provision_rooms', {
  roomId: text('room_id').primaryKey(),
  ephemeralPubkey: text('ephemeral_pubkey').notNull(),
  token: text('token').notNull(),
  status: text('status').notNull().default('waiting'),
  encryptedNsec: text('encrypted_nsec'),
  primaryPubkey: text('primary_pubkey'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
})

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const volunteersRelations = relations(volunteers, ({ many }) => ({
  sessions: many(sessions),
  webauthnCredentials: many(webauthnCredentials),
  devices: many(devices),
}))

export const sessionsRelations = relations(sessions, ({ one }) => ({
  volunteer: one(volunteers, {
    fields: [sessions.pubkey],
    references: [volunteers.pubkey],
  }),
}))

export const webauthnCredentialsRelations = relations(
  webauthnCredentials,
  ({ one }) => ({
    volunteer: one(volunteers, {
      fields: [webauthnCredentials.pubkey],
      references: [volunteers.pubkey],
    }),
  }),
)

export const devicesRelations = relations(devices, ({ one }) => ({
  volunteer: one(volunteers, {
    fields: [devices.pubkey],
    references: [volunteers.pubkey],
  }),
}))
