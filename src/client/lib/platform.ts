/**
 * Platform detection and abstraction layer.
 *
 * Routes crypto operations to native Rust (via Tauri IPC) on desktop,
 * and falls back to JS implementations (@noble/*) on browser/web.
 *
 * On desktop, the nsec (secret key) lives exclusively in the Rust process.
 * The webview never receives it. All operations that need the secret key
 * use "stateful" IPC commands that access the Rust CryptoState directly.
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
 * Desktop: uses CryptoState (nsec stays in Rust).
 * Browser: secret key passed explicitly.
 */
export async function createAuthToken(
  secretKeyHex: string,
  timestamp: number,
  method: string,
  path: string,
): Promise<string> {
  if (isTauri()) {
    // Use stateful command — Rust holds the secret key
    return tauriInvoke<string>('create_auth_token_from_state', {
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
 * (Encryption uses only the recipient's public key — no secret key needed.)
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
 * Desktop: uses CryptoState (nsec stays in Rust).
 * Browser: secret key passed explicitly.
 */
export async function eciesUnwrapKey(
  envelope: KeyEnvelope,
  secretKeyHex: string,
  label: string,
): Promise<string> {
  if (isTauri()) {
    // Use stateful command — Rust holds the secret key
    return tauriInvoke<string>('ecies_unwrap_key_from_state', {
      envelope,
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
 * (Uses only public keys — no secret key needed.)
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
 * Desktop: uses CryptoState (nsec stays in Rust).
 * Browser: secret key passed explicitly.
 */
export async function decryptNote(
  encryptedContent: string,
  envelope: KeyEnvelope,
  secretKeyHex: string,
): Promise<string | null> {
  if (isTauri()) {
    // Use stateful command — Rust holds the secret key
    return tauriInvoke<string>('decrypt_note_from_state', {
      encryptedContent,
      envelope,
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
 * (Uses only public keys — no secret key needed.)
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
 * Desktop: uses CryptoState (nsec stays in Rust, reader pubkey from state).
 * Browser: secret key and pubkey passed explicitly.
 */
export async function decryptMessage(
  encryptedContent: string,
  readerEnvelopes: RecipientKeyEnvelope[],
  secretKeyHex: string,
  readerPubkey: string,
): Promise<string | null> {
  if (isTauri()) {
    // Use stateful command — Rust holds the secret key + derives pubkey
    return tauriInvoke<string>('decrypt_message_from_state', {
      encryptedContent,
      readerEnvelopes,
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

const TAURI_ENCRYPTED_KEY_STORE = 'llamenos-encrypted-key'

/**
 * Encrypt an nsec with a PIN for local storage.
 * Desktop: Rust crypto + Tauri Store for persistence. Also loads key into CryptoState.
 * Browser: JS crypto + localStorage.
 */
export async function encryptWithPin(
  nsec: string,
  pin: string,
  pubkeyHex: string,
): Promise<void> {
  if (isTauri()) {
    // import_key_to_state encrypts the nsec AND loads it into CryptoState
    const encryptedData = await tauriInvoke<EncryptedKeyData>('import_key_to_state', {
      nsec,
      pin,
      pubkeyHex,
    })
    // Persist the encrypted key data via Tauri Store
    const { Store } = await import('@tauri-apps/plugin-store')
    const store = await Store.load('keys.json')
    await store.set(TAURI_ENCRYPTED_KEY_STORE, encryptedData)
    await store.save()
    return
  }
  const { storeEncryptedKey } = await import('./key-store')
  await storeEncryptedKey(nsec, pin, pubkeyHex)
}

/**
 * Decrypt an nsec from PIN-encrypted storage.
 * Desktop: decrypts and loads into CryptoState — returns ONLY the pubkey.
 *          The nsec hex NEVER leaves the Rust process.
 * Browser: returns the nsec string (managed by key-manager.ts closure).
 */
export async function decryptWithPin(pin: string): Promise<string | null> {
  if (isTauri()) {
    const { Store } = await import('@tauri-apps/plugin-store')
    const store = await Store.load('keys.json')
    const data = await store.get<EncryptedKeyData>(TAURI_ENCRYPTED_KEY_STORE)
    if (!data) return null
    try {
      // unlock_with_pin: decrypts nsec, stores in CryptoState, returns pubkey only
      const pubkey = await tauriInvoke<string>('unlock_with_pin', { data, pin })
      return pubkey
    } catch {
      return null // Wrong PIN or corrupted data
    }
  }
  const { decryptStoredKey } = await import('./key-store')
  return decryptStoredKey(pin)
}

/**
 * Lock the crypto state (desktop only — zeros nsec in Rust process).
 */
export async function lockCrypto(): Promise<void> {
  if (isTauri()) {
    await tauriInvoke<void>('lock_crypto')
  }
}

/**
 * Check if the crypto state is unlocked (desktop — Rust CryptoState).
 */
export async function isCryptoUnlocked(): Promise<boolean> {
  if (isTauri()) {
    return tauriInvoke<boolean>('is_crypto_unlocked')
  }
  return false
}

/**
 * Get the public key from CryptoState (desktop only).
 */
export async function getPublicKeyFromState(): Promise<string | null> {
  if (isTauri()) {
    try {
      return await tauriInvoke<string>('get_public_key_from_state')
    } catch {
      return null
    }
  }
  return null
}

/**
 * Check if an encrypted key exists in storage.
 * Desktop: checks Tauri Store.
 * Browser: checks localStorage.
 */
export async function hasStoredKey(): Promise<boolean> {
  if (isTauri()) {
    const { Store } = await import('@tauri-apps/plugin-store')
    const store = await Store.load('keys.json')
    const data = await store.get(TAURI_ENCRYPTED_KEY_STORE)
    return data !== null && data !== undefined
  }
  const { hasStoredKey: jsHasKey } = await import('./key-store')
  return jsHasKey()
}

/**
 * Clear the encrypted key from storage (wipe on max failed attempts).
 */
export async function clearStoredKey(): Promise<void> {
  if (isTauri()) {
    const { Store } = await import('@tauri-apps/plugin-store')
    const store = await Store.load('keys.json')
    await store.delete(TAURI_ENCRYPTED_KEY_STORE)
    await store.save()
    // Also lock the crypto state
    await lockCrypto()
    return
  }
  const { clearStoredKey: jsClear } = await import('./key-store')
  jsClear()
}
