import { pgTable, text, timestamp, index } from 'drizzle-orm/pg-core'

/**
 * Tracks used Ed25519 auth token signatures to prevent replay attacks.
 *
 * Each row represents a Bearer token signature that has already been used.
 * Inserting a duplicate nonceHash (primary key) indicates a replay — the
 * unique constraint violation is caught to reject the request.
 *
 * TTL = TOKEN_MAX_AGE_MS (5 minutes). Rows are cleaned up by identity cleanup().
 */
export const authNonces = pgTable('auth_nonces', {
  /** SHA-256 of the Ed25519 signature hex — unique per issued token */
  nonceHash: text('nonce_hash').primaryKey(),
  /** Pubkey that issued the token — for auditing */
  pubkey: text('pubkey').notNull(),
  /** When this nonce record expires (= token issuance time + TOKEN_MAX_AGE_MS) */
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
}, (table) => [
  index('idx_auth_nonces_expires').on(table.expiresAt),
])
