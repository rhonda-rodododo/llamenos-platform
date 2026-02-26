/**
 * Key backup & recovery utilities.
 *
 * Backup files use generic, non-identifying field names to avoid
 * associating the file with any specific application if discovered
 * on a seized device.
 *
 * Format: { v, id, t, d: { s, i, n, c }, r?: { s, i, n, c } }
 *   v  = version (1)
 *   id = first 6 hex chars of SHA-256(pubkey) — user identification only
 *   t  = unix timestamp, rounded to nearest hour
 *   d  = PIN-encrypted data: salt, iterations, nonce, ciphertext
 *   r  = recovery key encrypted data (same structure)
 *
 * Recovery key: 128-bit random, Base32-encoded, formatted as XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX
 */

import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'
import { utf8ToBytes } from '@noble/ciphers/utils.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import { RECOVERY_SALT } from '@shared/crypto-labels'

const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

interface EncryptedBlock {
  s: string  // salt (hex)
  i: number  // PBKDF2 iterations
  n: string  // nonce (hex)
  c: string  // ciphertext (hex)
}

export interface BackupFile {
  v: 1
  id: string         // truncated SHA-256(pubkey), first 6 hex chars
  t: number          // unix timestamp (seconds), rounded to nearest hour
  d: EncryptedBlock  // PIN-encrypted nsec
  r?: EncryptedBlock // recovery-key-encrypted nsec
}

/**
 * Generate a 128-bit recovery key, Base32-encoded with dashes.
 */
export function generateRecoveryKey(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  let base32 = ''
  let bits = 0
  let buffer = 0
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte
    bits += 8
    while (bits >= 5) {
      bits -= 5
      base32 += BASE32_CHARS[(buffer >> bits) & 0x1f]
    }
  }
  if (bits > 0) {
    base32 += BASE32_CHARS[(buffer << (5 - bits)) & 0x1f]
  }
  return base32.match(/.{1,4}/g)!.join('-')
}

/**
 * Derive a KEK from a recovery key using PBKDF2.
 */
async function deriveFromRecoveryKey(recoveryKey: string, perBackupSalt?: Uint8Array): Promise<Uint8Array> {
  const normalized = recoveryKey.replace(/-/g, '').toUpperCase()
  const keyBytes = utf8ToBytes(normalized)
  const salt = perBackupSalt ?? utf8ToBytes(RECOVERY_SALT)
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    keyBytes.buffer as ArrayBuffer,
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const derived = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: salt.buffer as ArrayBuffer,
      iterations: 100_000,
    },
    keyMaterial,
    256,
  )
  return new Uint8Array(derived)
}

/**
 * Derive a KEK from a PIN using PBKDF2.
 */
async function deriveFromPin(pin: string, salt: Uint8Array): Promise<Uint8Array> {
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
      iterations: 600_000,
    },
    keyMaterial,
    256,
  )
  return new Uint8Array(derived)
}

function encrypt(plaintext: string, kek: Uint8Array): { nonce: string; ciphertext: string } {
  const nonce = new Uint8Array(24)
  crypto.getRandomValues(nonce)
  const cipher = xchacha20poly1305(kek, nonce)
  const ct = cipher.encrypt(utf8ToBytes(plaintext))
  return { nonce: bytesToHex(nonce), ciphertext: bytesToHex(ct) }
}

function decrypt(nonce: string, ciphertext: string, kek: Uint8Array): string | null {
  try {
    const cipher = xchacha20poly1305(kek, hexToBytes(nonce))
    const pt = cipher.decrypt(hexToBytes(ciphertext))
    return new TextDecoder().decode(pt)
  } catch {
    return null
  }
}

/**
 * Create a truncated pubkey identifier (first 6 hex chars of SHA-256).
 * Enough for the user to identify which backup is which, not enough to identify the pubkey.
 */
function truncatedPubkeyId(pubkey: string): string {
  const hash = sha256(utf8ToBytes(pubkey))
  return bytesToHex(hash).slice(0, 6)
}

/**
 * Round a timestamp to the nearest hour to reduce timing correlation.
 */
function roundToHour(date: Date): number {
  const ms = date.getTime()
  const hourMs = 3_600_000
  return Math.round(ms / hourMs) * hourMs / 1000
}

/**
 * Create an encrypted backup file.
 */
export async function createBackup(
  nsec: string,
  pin: string,
  pubkey: string,
  recoveryKey: string,
): Promise<BackupFile> {
  const salt = new Uint8Array(16)
  crypto.getRandomValues(salt)
  const kek = await deriveFromPin(pin, salt)
  const { nonce, ciphertext } = encrypt(nsec, kek)

  const rSalt = new Uint8Array(16)
  crypto.getRandomValues(rSalt)
  const rKek = await deriveFromRecoveryKey(recoveryKey, rSalt)
  const { nonce: rNonce, ciphertext: rCt } = encrypt(nsec, rKek)

  return {
    v: 1,
    id: truncatedPubkeyId(pubkey),
    t: roundToHour(new Date()),
    d: {
      s: bytesToHex(salt),
      i: 600_000,
      n: nonce,
      c: ciphertext,
    },
    r: {
      s: bytesToHex(rSalt),
      i: 100_000,
      n: rNonce,
      c: rCt,
    },
  }
}

/**
 * Restore nsec from a backup file using PIN.
 */
export async function restoreFromBackupWithPin(backup: BackupFile, pin: string): Promise<string | null> {
  const salt = hexToBytes(backup.d.s)
  const kek = await deriveFromPin(pin, salt)
  return decrypt(backup.d.n, backup.d.c, kek)
}

/**
 * Restore nsec from a backup file using recovery key.
 */
export async function restoreFromBackupWithRecoveryKey(backup: BackupFile, recoveryKey: string): Promise<string | null> {
  if (!backup.r) return null
  const perBackupSalt = backup.r.s ? hexToBytes(backup.r.s) : undefined
  const rKek = await deriveFromRecoveryKey(recoveryKey, perBackupSalt)
  return decrypt(backup.r.n, backup.r.c, rKek)
}

/**
 * Download a backup file to the user's device.
 * Uses compact JSON (no pretty-print) and generic filename.
 */
export function downloadBackupFile(backup: BackupFile): void {
  const content = JSON.stringify(backup)
  const blob = new Blob([content], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const randomSuffix = Array.from(crypto.getRandomValues(new Uint8Array(4)))
    .map(b => b.toString(16).padStart(2, '0')).join('')
  a.download = `backup-${randomSuffix}.json`
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Read a backup file from a File input.
 * Recognizes the new format by presence of "v" and "d" fields.
 */
export async function readBackupFile(file: File): Promise<BackupFile | null> {
  try {
    const text = await file.text()
    const data = JSON.parse(text)
    // New format: has "v" and "d" fields
    if (data.v === 1 && data.d && typeof data.d.s === 'string') {
      return data as BackupFile
    }
    return null
  } catch {
    return null
  }
}
