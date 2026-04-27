/**
 * SignalContactsService — encrypted Signal contact storage.
 *
 * Zero-knowledge design:
 *   - App server stores only the HMAC hash of the Signal identifier.
 *   - The plaintext identifier is registered in the signal-notifier sidecar's SQLite DB.
 *   - The sidecar resolves hash → plaintext for delivery, keeping plaintext off the main DB.
 *   - ECIES ciphertext + per-user envelopes let the volunteer recover their identifier.
 *
 * HMAC key derivation: HMAC-SHA-256(serverHmacSecret, "signal-contact:" + userPubkey)
 * This gives each user a distinct HMAC context so hash leakage from one user
 * cannot be correlated with another user's Signal identifier.
 */
import { hmac } from '@noble/hashes/hmac.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js'
import { eq } from 'drizzle-orm'
import type { Database } from '../db'
import { userSignalContacts, type UserSignalContactRow } from '../db/schema/signal-notifications'

export { normalizeSignalIdentifier } from './signal-identifier-normalize'

/**
 * Hash a normalized Signal identifier using a per-user derived HMAC key.
 * The key itself is derived from the global server secret and the user pubkey.
 */
export function hashSignalIdentifier(normalized: string, perUserKey: string): string {
  const mac = hmac(sha256, utf8ToBytes(perUserKey), utf8ToBytes(normalized))
  return bytesToHex(mac)
}

/**
 * Derive a per-user HMAC key from the server secret and user pubkey.
 * This is the key returned to the client so it can hash locally before sending.
 */
export function derivePerUserHmacKey(serverHmacSecret: string, userPubkey: string): string {
  const userKey = hmac(
    sha256,
    utf8ToBytes(serverHmacSecret),
    utf8ToBytes(`signal-contact:${userPubkey}`)
  )
  return bytesToHex(userKey)
}

export interface UpsertSignalContactInput {
  userPubkey: string
  identifierHash: string
  identifierCiphertext: string
  identifierEnvelope: { recipientPubkey: string; encryptedKey: string }[]
  identifierType: 'phone' | 'username'
}

export class SignalContactsService {
  constructor(
    private db: Database,
    private hmacSecret: string
  ) {}

  async upsert(input: UpsertSignalContactInput): Promise<UserSignalContactRow> {
    const now = new Date()
    const rows = await this.db
      .insert(userSignalContacts)
      .values({
        userPubkey: input.userPubkey,
        identifierHash: input.identifierHash,
        identifierCiphertext: input.identifierCiphertext,
        identifierEnvelope: input.identifierEnvelope,
        identifierType: input.identifierType,
        verifiedAt: now,
      })
      .onConflictDoUpdate({
        target: userSignalContacts.userPubkey,
        set: {
          identifierHash: input.identifierHash,
          identifierCiphertext: input.identifierCiphertext,
          identifierEnvelope: input.identifierEnvelope,
          identifierType: input.identifierType,
          updatedAt: now,
          verifiedAt: now,
        },
      })
      .returning()
    const row = rows[0]
    if (!row) throw new Error('Failed to upsert signal contact')
    return row
  }

  async findByUser(userPubkey: string): Promise<UserSignalContactRow | null> {
    const rows = await this.db
      .select()
      .from(userSignalContacts)
      .where(eq(userSignalContacts.userPubkey, userPubkey))
      .limit(1)
    return rows[0] ?? null
  }

  async deleteByUser(userPubkey: string): Promise<void> {
    await this.db
      .delete(userSignalContacts)
      .where(eq(userSignalContacts.userPubkey, userPubkey))
  }

  /** Return the per-user HMAC key so the client can hash the identifier client-side. */
  getPerUserHmacKey(userPubkey: string): string {
    return derivePerUserHmacKey(this.hmacSecret, userPubkey)
  }

  /** Hash a normalized identifier using the per-user derived key. */
  hashIdentifierForUser(normalized: string, userPubkey: string): string {
    const userKey = this.getPerUserHmacKey(userPubkey)
    return hashSignalIdentifier(normalized, userKey)
  }
}
