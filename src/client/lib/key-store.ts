/**
 * Encrypted key storage using PBKDF2 + XChaCha20-Poly1305.
 *
 * PIN (4-6 digits) → PBKDF2-SHA256 (600k iterations, 16-byte salt) → 32-byte KEK
 * → XChaCha20-Poly1305 encrypts nsec bytes → stored in localStorage as JSON.
 *
 * Decrypted keyPair is held in memory only — never written to storage unencrypted.
 */

import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'
import { utf8ToBytes } from '@noble/ciphers/utils.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import { HMAC_KEYID_PREFIX } from '@shared/crypto-labels'

const STORAGE_KEY = 'llamenos-encrypted-key'
const PBKDF2_ITERATIONS = 600_000

export interface EncryptedKeyData {
  salt: string       // hex, 16 bytes
  iterations: number
  nonce: string      // hex, 24 bytes (XChaCha20)
  ciphertext: string // hex
  pubkey: string     // truncated SHA-256 hash of pubkey (not plaintext) for identification
}

/**
 * Derive a 32-byte Key Encryption Key from a PIN using PBKDF2-SHA256.
 */
async function deriveKEK(pin: string, salt: Uint8Array): Promise<Uint8Array> {
  const pinBytes = utf8ToBytes(pin)
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    pinBytes.buffer as ArrayBuffer,
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const derived = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: salt.buffer as ArrayBuffer,
      iterations: PBKDF2_ITERATIONS,
    },
    keyMaterial,
    256, // 32 bytes
  )
  return new Uint8Array(derived)
}

/**
 * Encrypt an nsec string with a PIN and store in localStorage.
 */
export async function storeEncryptedKey(nsec: string, pin: string, pubkey: string): Promise<void> {
  const salt = new Uint8Array(16)
  crypto.getRandomValues(salt)

  const kek = await deriveKEK(pin, salt)
  const nonce = new Uint8Array(24)
  crypto.getRandomValues(nonce)

  const cipher = xchacha20poly1305(kek, nonce)
  const plaintext = utf8ToBytes(nsec)
  const ciphertext = cipher.encrypt(plaintext)

  // Hash pubkey for identification — never store plaintext pubkey alongside encrypted key
  const hashInput = utf8ToBytes(`${HMAC_KEYID_PREFIX}${pubkey}`)
  const pubkeyHash = bytesToHex(new Uint8Array(
    await crypto.subtle.digest('SHA-256', hashInput.buffer as ArrayBuffer)
  )).slice(0, 16)

  const data: EncryptedKeyData = {
    salt: bytesToHex(salt),
    iterations: PBKDF2_ITERATIONS,
    nonce: bytesToHex(nonce),
    ciphertext: bytesToHex(ciphertext),
    pubkey: pubkeyHash,
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

/**
 * Decrypt the stored key using a PIN. Returns the nsec string or null on failure.
 */
export async function decryptStoredKey(pin: string): Promise<string | null> {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null

  try {
    const data: EncryptedKeyData = JSON.parse(raw)
    const salt = hexToBytes(data.salt)
    const nonce = hexToBytes(data.nonce)
    const ciphertext = hexToBytes(data.ciphertext)

    const kek = await deriveKEK(pin, salt)
    const cipher = xchacha20poly1305(kek, nonce)
    const plaintext = cipher.decrypt(ciphertext)
    return new TextDecoder().decode(plaintext)
  } catch {
    return null // Wrong PIN or corrupted data
  }
}

/**
 * Re-encrypt the stored key with a new PIN (for PIN change).
 */
export async function reEncryptKey(nsec: string, newPin: string, pubkey: string): Promise<void> {
  await storeEncryptedKey(nsec, newPin, pubkey)
}

/**
 * Check if an encrypted key exists in localStorage.
 */
export function hasStoredKey(): boolean {
  return localStorage.getItem(STORAGE_KEY) !== null
}

/**
 * Get the hashed pubkey identifier from the stored encrypted key.
 * Returns a truncated SHA-256 hash (not the actual pubkey) for identification.
 */
export function getStoredKeyId(): string | null {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    const data: EncryptedKeyData = JSON.parse(raw)
    return data.pubkey
  } catch {
    return null
  }
}

/**
 * Clear the encrypted key from localStorage (wipe on too many failed attempts).
 */
export function clearStoredKey(): void {
  localStorage.removeItem(STORAGE_KEY)
}

/**
 * Validate PIN format: 4-6 digits.
 */
export function isValidPin(pin: string): boolean {
  return /^\d{4,6}$/.test(pin)
}
