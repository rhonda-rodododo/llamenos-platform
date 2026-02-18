/**
 * Key backup & recovery utilities.
 *
 * Backup file format:
 * {
 *   version: 1,
 *   format: "llamenos-key-backup",
 *   pubkey: "hex",
 *   createdAt: "ISO",
 *   encrypted: { salt, iterations, nonce, ciphertext }  // encrypted with PIN
 * }
 *
 * Recovery key: 128-bit random, Base32-encoded, formatted as XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX
 */

import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'
import { utf8ToBytes } from '@noble/ciphers/utils.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'

const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export interface BackupFile {
  version: 1
  format: 'llamenos-key-backup'
  pubkey: string
  createdAt: string
  encrypted: {
    salt: string
    iterations: number
    nonce: string
    ciphertext: string
  }
  recoveryKey?: {
    salt: string
    iterations: number
    nonce: string
    ciphertext: string
  }
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
  // Format as XXXX-XXXX-XXXX-...
  return base32.match(/.{1,4}/g)!.join('-')
}

/**
 * Derive a KEK from a recovery key using PBKDF2.
 */
async function deriveFromRecoveryKey(recoveryKey: string, perBackupSalt?: Uint8Array): Promise<Uint8Array> {
  const normalized = recoveryKey.replace(/-/g, '').toUpperCase()
  const keyBytes = utf8ToBytes(normalized)
  // Use per-backup random salt if provided, otherwise fall back to static salt for legacy backups
  const salt = perBackupSalt ?? utf8ToBytes('llamenos:recovery')
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
      iterations: 100_000, // Fewer iterations — recovery key is high entropy
    },
    keyMaterial,
    256,
  )
  return new Uint8Array(derived)
}

/**
 * Derive a KEK from a PIN using PBKDF2 (same as key-store.ts).
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
 * Create an encrypted backup file.
 */
export async function createBackup(
  nsec: string,
  pin: string,
  pubkey: string,
  recoveryKey?: string,
): Promise<BackupFile> {
  const salt = new Uint8Array(16)
  crypto.getRandomValues(salt)
  const kek = await deriveFromPin(pin, salt)
  const { nonce, ciphertext } = encrypt(nsec, kek)

  const backup: BackupFile = {
    version: 1,
    format: 'llamenos-key-backup',
    pubkey,
    createdAt: new Date().toISOString(),
    encrypted: {
      salt: bytesToHex(salt),
      iterations: 600_000,
      nonce,
      ciphertext,
    },
  }

  if (recoveryKey) {
    const rSalt = new Uint8Array(16)
    crypto.getRandomValues(rSalt)
    const rKek = await deriveFromRecoveryKey(recoveryKey, rSalt)
    const { nonce: rNonce, ciphertext: rCt } = encrypt(nsec, rKek)
    backup.recoveryKey = {
      salt: bytesToHex(rSalt),
      iterations: 100_000,
      nonce: rNonce,
      ciphertext: rCt,
    }
  }

  return backup
}

/**
 * Restore nsec from a backup file using PIN.
 */
export async function restoreFromBackupWithPin(backup: BackupFile, pin: string): Promise<string | null> {
  const salt = hexToBytes(backup.encrypted.salt)
  const kek = await deriveFromPin(pin, salt)
  return decrypt(backup.encrypted.nonce, backup.encrypted.ciphertext, kek)
}

/**
 * Restore nsec from a backup file using recovery key.
 */
export async function restoreFromBackupWithRecoveryKey(backup: BackupFile, recoveryKey: string): Promise<string | null> {
  if (!backup.recoveryKey) return null
  // Use per-backup salt if present (new format), fall back to static salt for legacy backups
  const perBackupSalt = backup.recoveryKey.salt ? hexToBytes(backup.recoveryKey.salt) : undefined
  const rKek = await deriveFromRecoveryKey(recoveryKey, perBackupSalt)
  return decrypt(backup.recoveryKey.nonce, backup.recoveryKey.ciphertext, rKek)
}

/**
 * Download a backup file to the user's device.
 */
export function downloadBackupFile(backup: BackupFile): void {
  const content = JSON.stringify(backup, null, 2)
  const blob = new Blob([content], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `llamenos-backup-${backup.pubkey.slice(0, 8)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Read a backup file from a File input.
 */
export async function readBackupFile(file: File): Promise<BackupFile | null> {
  try {
    const text = await file.text()
    const data = JSON.parse(text)
    if (data.format !== 'llamenos-key-backup' || data.version !== 1) return null
    return data as BackupFile
  } catch {
    return null
  }
}
