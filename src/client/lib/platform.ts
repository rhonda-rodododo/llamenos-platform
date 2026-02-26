/**
 * Platform detection and abstraction layer.
 *
 * Routes crypto operations to native Rust (via Tauri IPC) on desktop,
 * and falls back to JS implementations (@noble/*) on browser/web.
 *
 * This module is the single entry point for all platform-specific behavior.
 * Import from here instead of directly from crypto.ts or @tauri-apps/*.
 */

import type { KeyEnvelope, RecipientKeyEnvelope } from './crypto'

// ── Platform detection ───────────────────────────────────────────────

/** True when running inside the Tauri desktop shell. */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

/** True when running in a web browser (not Tauri). */
export function isBrowser(): boolean {
  return !isTauri()
}

// ── Tauri IPC wrapper (lazy import to avoid bundling in web builds) ──

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(cmd, args)
}

// ── Crypto operations (routed by platform) ──────────────────────────

export interface PlatformKeyPair {
  secretKeyHex: string
  publicKey: string
  nsec: string
  npub: string
}

/**
 * Generate a new keypair.
 * Desktop: native Rust via llamenos-core.
 * Browser: JS via nostr-tools + @noble/curves.
 */
export async function generateKeyPair(): Promise<PlatformKeyPair> {
  if (isTauri()) {
    const kp = await tauriInvoke<PlatformKeyPair>('generate_keypair')
    return kp
  }
  const { generateKeyPair: jsGenerate } = await import('./crypto')
  const kp = jsGenerate()
  return {
    secretKeyHex: Array.from(kp.secretKey)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join(''),
    publicKey: kp.publicKey,
    nsec: kp.nsec,
    npub: kp.npub,
  }
}

/**
 * Get the x-only public key from a secret key hex.
 */
export async function getPublicKey(secretKeyHex: string): Promise<string> {
  if (isTauri()) {
    return tauriInvoke<string>('get_public_key', { secretKeyHex })
  }
  const { getPublicKey: jsGetPub } = await import('nostr-tools')
  const { hexToBytes } = await import('@noble/hashes/utils.js')
  return jsGetPub(hexToBytes(secretKeyHex))
}

/**
 * Create a Schnorr auth token for API authentication.
 */
export async function createAuthToken(
  secretKeyHex: string,
  timestamp: number,
  method: string,
  path: string,
): Promise<string> {
  if (isTauri()) {
    return tauriInvoke<string>('create_auth_token', {
      secretKeyHex,
      timestamp,
      method,
      path,
    })
  }
  const { createAuthToken: jsCreate } = await import('./crypto')
  const { hexToBytes } = await import('@noble/hashes/utils.js')
  return jsCreate(hexToBytes(secretKeyHex), timestamp, method, path)
}

/**
 * ECIES wrap a 32-byte key for a recipient.
 */
export async function eciesWrapKey(
  keyHex: string,
  recipientPubkey: string,
  label: string,
): Promise<KeyEnvelope> {
  if (isTauri()) {
    return tauriInvoke<KeyEnvelope>('ecies_wrap_key', {
      keyHex,
      recipientPubkey,
      label,
    })
  }
  const { eciesWrapKey: jsWrap } = await import('./crypto')
  const { hexToBytes } = await import('@noble/hashes/utils.js')
  return jsWrap(hexToBytes(keyHex), recipientPubkey, label)
}

/**
 * ECIES unwrap a key from an envelope.
 */
export async function eciesUnwrapKey(
  envelope: KeyEnvelope,
  secretKeyHex: string,
  label: string,
): Promise<string> {
  if (isTauri()) {
    return tauriInvoke<string>('ecies_unwrap_key', {
      envelope,
      secretKeyHex,
      label,
    })
  }
  const { eciesUnwrapKey: jsUnwrap } = await import('./crypto')
  const { hexToBytes, bytesToHex } = await import('@noble/hashes/utils.js')
  const result = jsUnwrap(envelope, hexToBytes(secretKeyHex), label)
  return bytesToHex(result)
}

export interface EncryptedNoteResult {
  encryptedContent: string
  authorEnvelope: KeyEnvelope
  adminEnvelopes: RecipientKeyEnvelope[]
}

/**
 * Encrypt a note with per-note forward secrecy.
 */
export async function encryptNote(
  payloadJson: string,
  authorPubkey: string,
  adminPubkeys: string[],
): Promise<EncryptedNoteResult> {
  if (isTauri()) {
    return tauriInvoke<EncryptedNoteResult>('encrypt_note', {
      payloadJson,
      authorPubkey,
      adminPubkeys,
    })
  }
  const { encryptNoteV2 } = await import('./crypto')
  const payload = JSON.parse(payloadJson)
  return encryptNoteV2(payload, authorPubkey, adminPubkeys)
}

/**
 * Decrypt a V2 note using the appropriate envelope.
 * Returns the JSON string of the decrypted payload, or null on failure.
 */
export async function decryptNote(
  encryptedContent: string,
  envelope: KeyEnvelope,
  secretKeyHex: string,
): Promise<string | null> {
  if (isTauri()) {
    return tauriInvoke<string>('decrypt_note', {
      encryptedContent,
      envelope,
      secretKeyHex,
    })
  }
  const { decryptNoteV2 } = await import('./crypto')
  const { hexToBytes } = await import('@noble/hashes/utils.js')
  const result = decryptNoteV2(encryptedContent, envelope, hexToBytes(secretKeyHex))
  return result ? JSON.stringify(result) : null
}

export interface EncryptedMessageResult {
  encryptedContent: string
  readerEnvelopes: RecipientKeyEnvelope[]
}

/**
 * Encrypt a message for multiple readers.
 */
export async function encryptMessage(
  plaintext: string,
  readerPubkeys: string[],
): Promise<EncryptedMessageResult> {
  if (isTauri()) {
    return tauriInvoke<EncryptedMessageResult>('encrypt_message', {
      plaintext,
      readerPubkeys,
    })
  }
  const { encryptMessage: jsEncrypt } = await import('./crypto')
  return jsEncrypt(plaintext, readerPubkeys)
}

/**
 * Decrypt a message using the reader's envelope.
 * Returns the plaintext string or null on failure.
 */
export async function decryptMessage(
  encryptedContent: string,
  readerEnvelopes: RecipientKeyEnvelope[],
  secretKeyHex: string,
  readerPubkey: string,
): Promise<string | null> {
  if (isTauri()) {
    return tauriInvoke<string>('decrypt_message', {
      encryptedContent,
      readerEnvelopes,
      secretKeyHex,
      readerPubkey,
    })
  }
  const { decryptMessage: jsDecrypt } = await import('./crypto')
  const { hexToBytes } = await import('@noble/hashes/utils.js')
  return jsDecrypt(encryptedContent, readerEnvelopes, hexToBytes(secretKeyHex), readerPubkey)
}

export interface EncryptedKeyData {
  salt: string
  iterations: number
  nonce: string
  ciphertext: string
  pubkey: string
}

/**
 * Encrypt an nsec with a PIN for local storage.
 * Desktop: stores via Tauri Stronghold.
 * Browser: stores in localStorage.
 */
export async function encryptWithPin(
  nsec: string,
  pin: string,
  pubkeyHex: string,
): Promise<void> {
  if (isTauri()) {
    await tauriInvoke('encrypt_with_pin', { nsec, pin, pubkeyHex })
    return
  }
  const { storeEncryptedKey } = await import('./key-store')
  await storeEncryptedKey(nsec, pin, pubkeyHex)
}

/**
 * Decrypt an nsec from PIN-encrypted storage.
 * Returns the nsec string or null on failure.
 */
export async function decryptWithPin(pin: string): Promise<string | null> {
  if (isTauri()) {
    return tauriInvoke<string>('decrypt_with_pin', { pin })
  }
  const { decryptStoredKey } = await import('./key-store')
  return decryptStoredKey(pin)
}
