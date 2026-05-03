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
 *   padded = pad_to_bucket(UTF-8(json))  -- power-of-2 bucket, min 512B
 *   ciphertext = XChaCha20-Poly1305(event_key, nonce).encrypt(padded)
 *   output = hex(nonce || ciphertext)
 *
 * Padding format: [4-byte LE actual-length][plaintext][random padding bytes]
 * Buckets: 512, 1024, 2048, 4096, 8192, ... (powers of 2, minimum 512B)
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

const MIN_BUCKET_SIZE = 512

/**
 * Pad plaintext to the nearest power-of-2 bucket (minimum 512B).
 * Format: [4-byte LE actual-length][plaintext][random padding bytes]
 */
export function padToBucket(plaintext: Uint8Array): Uint8Array {
  const totalNeeded = 4 + plaintext.length
  let bucket = MIN_BUCKET_SIZE
  while (bucket < totalNeeded) {
    bucket *= 2
  }
  const padded = new Uint8Array(bucket)
  const view = new DataView(padded.buffer)
  view.setUint32(0, plaintext.length, true) // 4-byte LE length prefix
  padded.set(plaintext, 4)
  if (bucket > totalNeeded) {
    crypto.getRandomValues(padded.subarray(totalNeeded))
  }
  return padded
}

/**
 * Strip padding added by padToBucket — reads 4-byte LE length prefix and
 * returns only the actual plaintext bytes.
 */
export function unpadFromBucket(padded: Uint8Array): Uint8Array {
  if (padded.length < 4) {
    throw new Error('Invalid padded payload: buffer too short')
  }
  const view = new DataView(padded.buffer, padded.byteOffset)
  const actualLen = view.getUint32(0, true)
  if (actualLen + 4 > padded.length) {
    throw new Error('Invalid padded payload: length prefix exceeds buffer size')
  }
  return padded.slice(4, 4 + actualLen)
}

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
 * Pads plaintext to a power-of-2 bucket before encrypting to resist traffic analysis.
 * Returns hex-encoded nonce || ciphertext.
 */
export function encryptHubEvent(content: Record<string, unknown>, eventKey: Uint8Array): string {
  const nonce = new Uint8Array(24)
  crypto.getRandomValues(nonce)
  const plaintext = utf8ToBytes(JSON.stringify(content))
  const padded = padToBucket(plaintext)
  const cipher = xchacha20poly1305(eventKey, nonce)
  const ciphertext = cipher.encrypt(padded)
  const packed = new Uint8Array(nonce.length + ciphertext.length)
  packed.set(nonce)
  packed.set(ciphertext, nonce.length)
  return bytesToHex(packed)
}

/**
 * Decrypt a hub event previously encrypted with encryptHubEvent.
 * Strips payload padding and returns the original content object.
 */
export function decryptHubEvent(hex: string, eventKey: Uint8Array): Record<string, unknown> {
  const packed = hexToBytes(hex)
  if (packed.length < 24) {
    throw new Error('Invalid hub event ciphertext: too short')
  }
  const nonce = packed.slice(0, 24)
  const ciphertext = packed.slice(24)
  const cipher = xchacha20poly1305(eventKey, nonce)
  const padded = cipher.decrypt(ciphertext)
  const plaintext = unpadFromBucket(padded)
  return JSON.parse(new TextDecoder().decode(plaintext)) as Record<string, unknown>
}
