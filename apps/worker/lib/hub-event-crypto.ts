/**
 * Hub-event encryption for Nostr relay events.
 *
 * Each hub gets its own symmetric event encryption key, derived from
 * SERVER_NOSTR_SECRET with the hubId as HKDF salt. This ensures a user
 * with access to one hub cannot decrypt events for other hubs.
 *
 * Derivation (per-hub):
 *   event_key = HKDF(SHA-256, SERVER_NOSTR_SECRET, salt=hubId, info=LABEL_HUB_EVENT_KEY, 32)
 *   nonce = random(24)
 *   ciphertext = XChaCha20-Poly1305(event_key, nonce).encrypt(UTF-8(json))
 *   output = hex(nonce || ciphertext)
 *
 * Legacy (global, deprecated — kept for backward compatibility during migration):
 *   event_key = HKDF(SHA-256, SERVER_NOSTR_SECRET, salt=empty, info=LABEL_HUB_EVENT, 32)
 *
 * Clients receive per-hub event keys via GET /api/auth/me (hubEventKeys map).
 */

import { hkdf } from '@noble/hashes/hkdf.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'
import { utf8ToBytes } from '@noble/ciphers/utils.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import { LABEL_HUB_EVENT, LABEL_HUB_EVENT_KEY } from '@shared/crypto-labels'

/**
 * Derive a per-hub event encryption key from SERVER_NOSTR_SECRET.
 * Uses hubId as HKDF salt for domain separation between hubs.
 * Deterministic — same (secret, hubId) always produces the same key.
 */
export function deriveHubEventKey(serverSecret: string, hubId: string): Uint8Array {
  return hkdf(sha256, hexToBytes(serverSecret), utf8ToBytes(hubId), utf8ToBytes(LABEL_HUB_EVENT_KEY), 32)
}

/**
 * @deprecated Use deriveHubEventKey() with a hubId instead.
 * Kept for backward compatibility during migration — derives the old global key.
 */
export function deriveServerEventKey(serverSecret: string): Uint8Array {
  return hkdf(sha256, hexToBytes(serverSecret), new Uint8Array(0), utf8ToBytes(LABEL_HUB_EVENT), 32)
}

/**
 * Derive event keys for multiple hubs at once.
 * Returns a map of hubId → hex-encoded key.
 */
export function deriveHubEventKeys(serverSecret: string, hubIds: string[]): Record<string, string> {
  const keys: Record<string, string> = {}
  for (const hubId of hubIds) {
    keys[hubId] = bytesToHex(deriveHubEventKey(serverSecret, hubId))
  }
  return keys
}

/**
 * Encrypt event content for Nostr relay publication.
 * Returns hex-encoded nonce || ciphertext.
 */
export function encryptHubEvent(content: Record<string, unknown>, eventKey: Uint8Array): string {
  const nonce = new Uint8Array(24)
  crypto.getRandomValues(nonce)
  const cipher = xchacha20poly1305(eventKey, nonce)
  const ciphertext = cipher.encrypt(utf8ToBytes(JSON.stringify(content)))
  const packed = new Uint8Array(nonce.length + ciphertext.length)
  packed.set(nonce)
  packed.set(ciphertext, nonce.length)
  return bytesToHex(packed)
}
