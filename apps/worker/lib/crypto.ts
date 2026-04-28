import { secp256k1 } from '@noble/curves/secp256k1.js'
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { hmac } from '@noble/hashes/hmac.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import { utf8ToBytes } from '@noble/ciphers/utils.js'
import { hkdf } from '@noble/hashes/hkdf.js'
import { LABEL_MESSAGE, LABEL_CALL_META, LABEL_CONTACT_ID, LABEL_STORAGE_CREDENTIAL_WRAP, HMAC_PHONE_PREFIX, HMAC_IP_PREFIX } from '@shared/crypto-labels'
import type { RecipientEnvelope } from '@shared/types'

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

/** ECIES version byte for HKDF-based key derivation (v2). */
const ECIES_VERSION_V2 = 0x02

/**
 * Derive ECIES symmetric key using HKDF-SHA256 (v2).
 */
function deriveEciesKeyV2(label: string, sharedX: Uint8Array): Uint8Array {
  return hkdf(sha256, sharedX, new Uint8Array(0), utf8ToBytes(label), 32) as Uint8Array
}

/**
 * Legacy ECIES key derivation (v1): SHA-256(label || sharedX).
 * Used only for decryption of existing ciphertext without version byte.
 */
function deriveEciesKeyV1(label: string, sharedX: Uint8Array): Uint8Array {
  const labelBytes = utf8ToBytes(label)
  const keyInput = new Uint8Array(labelBytes.length + sharedX.length)
  keyInput.set(labelBytes)
  keyInput.set(sharedX, labelBytes.length)
  return sha256(keyInput)
}

/**
 * ECIES key wrapping for a single recipient (server-side, v2).
 * Uses HKDF for key derivation and prepends version byte.
 */
export function eciesWrapKeyForRecipient(
  key: Uint8Array,
  recipientPubkeyHex: string,
  label: string,
): { wrappedKey: string; ephemeralPubkey: string } {
  return eciesWrapKeyServer(key, recipientPubkeyHex, label)
}

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

  const symmetricKey = deriveEciesKeyV2(label, sharedX)

  const nonce = new Uint8Array(24)
  crypto.getRandomValues(nonce)
  const cipher = xchacha20poly1305(symmetricKey, nonce)
  const ciphertext = cipher.encrypt(key)

  // Pack: version(1) + nonce(24) + ciphertext
  const packed = new Uint8Array(1 + nonce.length + ciphertext.length)
  packed[0] = ECIES_VERSION_V2
  packed.set(nonce, 1)
  packed.set(ciphertext, 1 + nonce.length)

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
  label: string = LABEL_MESSAGE,
): { encryptedContent: string; readerEnvelopes: RecipientEnvelope[] } {
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
      ...eciesWrapKeyServer(messageKey, pk, label),
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
): { encryptedContent: string; adminEnvelopes: RecipientEnvelope[] } {
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

// --- Contact Identifier Encryption (Epic 255) ---

/**
 * Encrypt a contact identifier for at-rest storage.
 * Uses HKDF(HMAC_SECRET) → XChaCha20-Poly1305.
 * Stored with "enc:" prefix to distinguish from legacy plaintext.
 */
export function encryptContactIdentifier(identifier: string, hmacSecret: string): string {
  const key = hkdf(sha256, hexToBytes(hmacSecret), new Uint8Array(0), utf8ToBytes(LABEL_CONTACT_ID), 32)
  const nonce = new Uint8Array(24)
  crypto.getRandomValues(nonce)
  const cipher = xchacha20poly1305(key, nonce)
  const ct = cipher.encrypt(utf8ToBytes(identifier))
  const packed = new Uint8Array(24 + ct.length)
  packed.set(nonce)
  packed.set(ct, 24)
  return 'enc:' + bytesToHex(packed)
}

/**
 * Decrypt a contact identifier from storage.
 * Handles both encrypted ("enc:"-prefixed) and legacy plaintext values.
 * Legacy plaintext values are returned as-is (migration is lazy on next write).
 */
export function decryptContactIdentifier(stored: string, hmacSecret: string): string {
  if (!stored.startsWith('enc:')) return stored // legacy plaintext
  const hex = stored.slice(4)
  const data = hexToBytes(hex)
  const key = hkdf(sha256, hexToBytes(hmacSecret), new Uint8Array(0), utf8ToBytes(LABEL_CONTACT_ID), 32)
  const nonce = data.slice(0, 24)
  const ct = data.slice(24)
  const cipher = xchacha20poly1305(key, nonce)
  return new TextDecoder().decode(cipher.decrypt(ct))
}

/**
 * Check if a stored contact needs migration from legacy plaintext to encrypted.
 * Returns the decrypted value and whether re-encryption is needed.
 *
 * - Legacy plaintext (no "enc:" prefix): returns as-is with needsUpdate=true
 * - Encrypted ("enc:" prefix): decrypts and returns with needsUpdate=false
 */
export function migrateContactIfNeeded(stored: string, hmacSecret: string): {
  value: string; needsUpdate: boolean
} {
  if (!stored.startsWith('enc:')) {
    return { value: stored, needsUpdate: true }
  }
  return { value: decryptContactIdentifier(stored, hmacSecret), needsUpdate: false }
}

/**
 * Compute SHA-256 hash of an audit entry's core content for chain linking.
 */
export function hashAuditEntry(entry: {
  id: string
  action: string
  actorPubkey: string
  details: Record<string, unknown>
  createdAt: string
  previousEntryHash?: string
}): string {
  const content = `${entry.id}:${entry.action}:${entry.actorPubkey}:${entry.createdAt}:${JSON.stringify(entry.details)}:${entry.previousEntryHash || ''}`
  return bytesToHex(sha256(utf8ToBytes(content)))
}

// --- Storage Credential Encryption ---

/**
 * Encrypt a storage IAM secret key for at-rest protection.
 * Uses HKDF(HMAC_SECRET) → XChaCha20-Poly1305.
 */
export function encryptStorageCredential(secretKey: string, hmacSecret: string): string {
  const key = hkdf(sha256, hexToBytes(hmacSecret), new Uint8Array(0), utf8ToBytes(LABEL_STORAGE_CREDENTIAL_WRAP), 32)
  const nonce = new Uint8Array(24)
  crypto.getRandomValues(nonce)
  const cipher = xchacha20poly1305(key, nonce)
  const ct = cipher.encrypt(utf8ToBytes(secretKey))
  const packed = new Uint8Array(24 + ct.length)
  packed.set(nonce)
  packed.set(ct, 24)
  return bytesToHex(packed)
}

/**
 * Decrypt a storage IAM secret key from at-rest storage.
 */
export function decryptStorageCredential(encrypted: string, hmacSecret: string): string {
  const data = hexToBytes(encrypted)
  const key = hkdf(sha256, hexToBytes(hmacSecret), new Uint8Array(0), utf8ToBytes(LABEL_STORAGE_CREDENTIAL_WRAP), 32)
  const nonce = data.slice(0, 24)
  const ct = data.slice(24)
  const cipher = xchacha20poly1305(key, nonce)
  return new TextDecoder().decode(cipher.decrypt(ct))
}
