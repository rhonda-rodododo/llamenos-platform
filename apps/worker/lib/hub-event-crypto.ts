/**
 * Hub-event encryption for Nostr relay events.
 *
 * The hub key is client-side only (ECIES-wrapped per member); the server never
 * holds the raw hub key. For server-published events, we derive a symmetric
 * event encryption key from SERVER_NOSTR_SECRET so that relay content is
 * encrypted at rest. Clients receive this key via the hub key distribution
 * envelope (the admin wraps it alongside the hub key).
 *
 * Derivation:
 *   event_key = HKDF(SHA-256, SERVER_NOSTR_SECRET, salt=empty, info="llamenos:hub-event", 32)
 *   nonce = random(24)
 *   ciphertext = XChaCha20-Poly1305(event_key, nonce).encrypt(UTF-8(json))
 *   output = hex(nonce || ciphertext)
 *
 * Clients receive the server's event key via GET /api/auth/me (serverEventKeyHex).
 */

import { hkdf } from '@noble/hashes/hkdf.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'
import { utf8ToBytes } from '@noble/ciphers/utils.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import {
  LABEL_SERVER_EVENT_ENCRYPTION_KEY,
  LABEL_SERVER_EVENT_ENCRYPTION_KEY_INFO,
  LABEL_HUB_EVENT_EPOCH,
} from '@shared/crypto-labels'

/**
 * Derive the server event encryption key from SERVER_NOSTR_SECRET.
 *
 * Uses encryption-specific domain separation labels (H1 fix) — cryptographically
 * independent from the signing key derived in nostr-publisher.ts.
 *
 * Optionally accepts a hubId for per-hub key scoping and an epoch for
 * forward secrecy (H5 fix). When epoch is provided, the key changes
 * each epoch window, providing forward secrecy.
 */
export function deriveServerEventKey(
  serverSecret: string,
  hubId?: string,
  epoch?: number,
): Uint8Array {
  const salt = hubId
    ? utf8ToBytes(`${LABEL_SERVER_EVENT_ENCRYPTION_KEY}:${hubId}`)
    : utf8ToBytes(LABEL_SERVER_EVENT_ENCRYPTION_KEY)

  const info = epoch !== undefined
    ? utf8ToBytes(`${LABEL_HUB_EVENT_EPOCH}:${epoch}`)
    : utf8ToBytes(LABEL_SERVER_EVENT_ENCRYPTION_KEY_INFO)

  return hkdf(sha256, hexToBytes(serverSecret), salt, info, 32)
}

/** Default epoch duration in seconds (24 hours) */
export const EVENT_KEY_EPOCH_DURATION = 86400

/** Get the current epoch number based on timestamp */
export function getCurrentEpoch(timestampSec?: number): number {
  const ts = timestampSec ?? Math.floor(Date.now() / 1000)
  return Math.floor(ts / EVENT_KEY_EPOCH_DURATION)
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
