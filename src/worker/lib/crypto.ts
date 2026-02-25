import { secp256k1 } from '@noble/curves/secp256k1.js'
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { hmac } from '@noble/hashes/hmac.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import { utf8ToBytes } from '@noble/ciphers/utils.js'
import { LABEL_MESSAGE, LABEL_CALL_META, HMAC_PHONE_PREFIX, HMAC_IP_PREFIX } from '@shared/crypto-labels'
import type { MessageKeyEnvelope } from '../types'

/**
 * Hash a phone number for storage (one-way — compare by re-hashing).
 * Uses HMAC-SHA256 with a server secret to prevent precomputation attacks.
 */
export function hashPhone(phone: string, secret: string): string {
  const key = hexToBytes(secret)
  const input = utf8ToBytes(`${HMAC_PHONE_PREFIX}${phone}`)
  return bytesToHex(hmac(sha256, key, input))
}

/**
 * Hash an IP address for storage in audit logs.
 * Uses HMAC-SHA256 with a server secret, truncated to 96 bits.
 */
export function hashIP(ip: string, secret: string): string {
  const key = hexToBytes(secret)
  const input = utf8ToBytes(`${HMAC_IP_PREFIX}${ip}`)
  return bytesToHex(hmac(sha256, key, input)).slice(0, 24)
}

// --- Envelope-Pattern Message Encryption (Epic 74) ---

/**
 * ECIES key wrapping for a single recipient (server-side).
 * Mirrors the client-side eciesWrapKey from src/client/lib/crypto.ts.
 */
function eciesWrapKeyServer(
  key: Uint8Array,
  recipientPubkeyHex: string,
  label: string,
): { wrappedKey: string; ephemeralPubkey: string } {
  const ephemeralSecret = new Uint8Array(32)
  crypto.getRandomValues(ephemeralSecret)
  const ephemeralPublicKey = secp256k1.getPublicKey(ephemeralSecret, true)

  const recipientCompressed = hexToBytes('02' + recipientPubkeyHex)
  const shared = secp256k1.getSharedSecret(ephemeralSecret, recipientCompressed)
  const sharedX = shared.slice(1, 33)

  const labelBytes = utf8ToBytes(label)
  const keyInput = new Uint8Array(labelBytes.length + sharedX.length)
  keyInput.set(labelBytes)
  keyInput.set(sharedX, labelBytes.length)
  const symmetricKey = sha256(keyInput)

  const nonce = new Uint8Array(24)
  crypto.getRandomValues(nonce)
  const cipher = xchacha20poly1305(symmetricKey, nonce)
  const ciphertext = cipher.encrypt(key)

  const packed = new Uint8Array(nonce.length + ciphertext.length)
  packed.set(nonce)
  packed.set(ciphertext, nonce.length)

  return {
    wrappedKey: bytesToHex(packed),
    ephemeralPubkey: bytesToHex(ephemeralPublicKey),
  }
}

/**
 * Encrypt a message for storage using the envelope pattern.
 * Generates a random per-message symmetric key, encrypts the plaintext,
 * then wraps the key for each reader via ECIES.
 *
 * Used server-side when inbound messages arrive via webhooks.
 * The plaintext is discarded after encryption — the server cannot read
 * stored messages after this function returns.
 *
 * @param plaintext - Message text (from SMS/WhatsApp/Signal webhook)
 * @param readerPubkeys - Pubkeys of authorized readers (assigned volunteer + admins)
 */
export function encryptMessageForStorage(
  plaintext: string,
  readerPubkeys: string[],
): { encryptedContent: string; readerEnvelopes: MessageKeyEnvelope[] } {
  // Generate random per-message symmetric key
  const messageKey = new Uint8Array(32)
  crypto.getRandomValues(messageKey)

  const nonce = new Uint8Array(24)
  crypto.getRandomValues(nonce)
  const cipher = xchacha20poly1305(messageKey, nonce)
  const ciphertext = cipher.encrypt(utf8ToBytes(plaintext))

  const packed = new Uint8Array(nonce.length + ciphertext.length)
  packed.set(nonce)
  packed.set(ciphertext, nonce.length)

  return {
    encryptedContent: bytesToHex(packed),
    readerEnvelopes: readerPubkeys.map(pk => ({
      pubkey: pk,
      ...eciesWrapKeyServer(messageKey, pk, LABEL_MESSAGE),
    })),
  }
  // messageKey goes out of scope — never stored
}

/**
 * Encrypt call record metadata for history storage (Epic 77).
 * Uses the same envelope pattern as messages: random per-record key
 * wrapped via ECIES for each admin pubkey.
 *
 * @param metadata - JSON-serializable call metadata (answeredBy, callerNumber, etc.)
 * @param adminPubkeys - Admin decryption pubkeys
 */
export function encryptCallRecordForStorage(
  metadata: Record<string, unknown>,
  adminPubkeys: string[],
): { encryptedContent: string; adminEnvelopes: MessageKeyEnvelope[] } {
  const recordKey = new Uint8Array(32)
  crypto.getRandomValues(recordKey)

  const nonce = new Uint8Array(24)
  crypto.getRandomValues(nonce)
  const cipher = xchacha20poly1305(recordKey, nonce)
  const ciphertext = cipher.encrypt(utf8ToBytes(JSON.stringify(metadata)))

  const packed = new Uint8Array(nonce.length + ciphertext.length)
  packed.set(nonce)
  packed.set(ciphertext, nonce.length)

  return {
    encryptedContent: bytesToHex(packed),
    adminEnvelopes: adminPubkeys.map(pk => ({
      pubkey: pk,
      ...eciesWrapKeyServer(recordKey, pk, LABEL_CALL_META),
    })),
  }
}

/**
 * Compute SHA-256 hash of an audit entry's core content for chain linking.
 */
export function hashAuditEntry(entry: {
  id: string
  event: string
  actorPubkey: string
  details: Record<string, unknown>
  createdAt: string
  previousEntryHash?: string
}): string {
  const content = `${entry.id}:${entry.event}:${entry.actorPubkey}:${entry.createdAt}:${JSON.stringify(entry.details)}:${entry.previousEntryHash || ''}`
  return bytesToHex(sha256(utf8ToBytes(content)))
}
