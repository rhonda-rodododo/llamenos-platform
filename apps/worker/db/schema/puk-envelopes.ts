/**
 * PUK (Pre-User Key) envelope table.
 *
 * After each PUK epoch rotation the server stores one HPKE-encrypted envelope
 * per registered device. The device fetches its envelope and decrypts the PUK
 * seed using its X25519 private key.  Old envelopes are superseded when a new
 * generation is written for the same (userId, deviceId) pair.
 */
import { relations } from 'drizzle-orm'
import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core'
import { users, devices } from './users'

// ---------------------------------------------------------------------------
// puk_envelopes
// ---------------------------------------------------------------------------

export const pukEnvelopes = pgTable(
  'puk_envelopes',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    /** User who owns this PUK seed (references users.pubkey). */
    userPubkey: text('user_pubkey')
      .notNull()
      .references(() => users.pubkey, { onDelete: 'cascade' }),
    /** Device the envelope is sealed for (references devices.id). */
    deviceId: text('device_id')
      .notNull()
      .references(() => devices.id, { onDelete: 'cascade' }),
    /**
     * Monotonically increasing PUK generation counter.  Clients should
     * discard older generations once a newer one is fetched.
     */
    generation: integer('generation').notNull(),
    /**
     * HPKE-encrypted PUK seed envelope.
     * Encoding: base64url(kem_output || ciphertext)
     * The recipient's X25519 public key is used as the HPKE recipient key.
     */
    envelope: text('envelope').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('puk_envelopes_user_pubkey_idx').on(table.userPubkey),
    index('puk_envelopes_device_id_idx').on(table.deviceId),
    // Only one envelope per (device, generation) pair
    unique('puk_envelopes_device_gen_uniq').on(table.deviceId, table.generation),
  ],
)

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const pukEnvelopesRelations = relations(pukEnvelopes, ({ one }) => ({
  user: one(users, {
    fields: [pukEnvelopes.userPubkey],
    references: [users.pubkey],
  }),
  device: one(devices, {
    fields: [pukEnvelopes.deviceId],
    references: [devices.id],
  }),
}))
