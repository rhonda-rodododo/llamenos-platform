/**
 * Platform abstraction layer — Tauri-only desktop application.
 *
 * All crypto operations route through native Rust via Tauri IPC.
 * The nsec (secret key) lives exclusively in the Rust process.
 * The webview never receives it (except for device provisioning
 * via getNsecFromState, which is intentional — see Epic 93 §5.4).
 *
 * This module is the single entry point for all platform-specific behavior.
 * Import from here instead of directly from crypto.ts or @tauri-apps/*.
 */

// Type re-exports (will be moved to a shared types file in Epic 94)
export type { KeyEnvelope, RecipientKeyEnvelope } from './crypto'

// ── Tauri IPC wrapper ────────────────────────────────────────────────

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(cmd, args)
}

// ── Crypto types ─────────────────────────────────────────────────────

export interface PlatformKeyPair {
  secretKeyHex: string
  publicKey: string
  nsec: string
  npub: string
}

export interface SignedNostrEvent {
  id: string
  pubkey: string
  created_at: number
  kind: number
  tags: string[][]
  content: string
  sig: string
}

export interface EncryptedNoteResult {
  encryptedContent: string
  authorEnvelope: import('./crypto').KeyEnvelope
  adminEnvelopes: import('./crypto').RecipientKeyEnvelope[]
}

export interface EncryptedMessageResult {
  encryptedContent: string
  readerEnvelopes: import('./crypto').RecipientKeyEnvelope[]
}

export interface EncryptedKeyData {
  salt: string
  iterations: number
  nonce: string
  ciphertext: string
  pubkey: string
}

// ── Keypair generation (stateless) ───────────────────────────────────

/** Generate a new Nostr keypair via Rust. */
export async function generateKeyPair(): Promise<PlatformKeyPair> {
  return tauriInvoke<PlatformKeyPair>('generate_keypair')
}

/** Get x-only public key from a secret key hex (stateless). */
export async function getPublicKey(secretKeyHex: string): Promise<string> {
  return tauriInvoke<string>('get_public_key', { secretKeyHex })
}

/** Get public key from CryptoState (stateful — no key leaves Rust). */
export async function getPublicKeyFromState(): Promise<string | null> {
  try {
    return await tauriInvoke<string>('get_public_key_from_state')
  } catch {
    return null
  }
}

// ── Auth tokens ──────────────────────────────────────────────────────

/**
 * Create a Schnorr auth token using CryptoState (nsec stays in Rust).
 * For day-to-day auth after unlock.
 */
export async function createAuthToken(
  timestamp: number,
  method: string,
  path: string,
): Promise<string> {
  return tauriInvoke<string>('create_auth_token_from_state', {
    timestamp,
    method,
    path,
  })
}

/**
 * Create a Schnorr auth token with an explicit secret key hex.
 * For sign-in flow ONLY (nsec not yet in CryptoState).
 */
export async function createAuthTokenStateless(
  secretKeyHex: string,
  timestamp: number,
  method: string,
  path: string,
): Promise<string> {
  return tauriInvoke<string>('create_auth_token', {
    secretKeyHex,
    timestamp,
    method,
    path,
  })
}

// ── ECIES operations ─────────────────────────────────────────────────

/**
 * ECIES wrap a 32-byte key for a recipient (public-key-only, no nsec needed).
 */
export async function eciesWrapKey(
  keyHex: string,
  recipientPubkey: string,
  label: string,
): Promise<import('./crypto').KeyEnvelope> {
  return tauriInvoke<import('./crypto').KeyEnvelope>('ecies_wrap_key', {
    keyHex,
    recipientPubkey,
    label,
  })
}

/**
 * ECIES unwrap a key from an envelope using CryptoState.
 */
export async function eciesUnwrapKey(
  envelope: import('./crypto').KeyEnvelope,
  label: string,
): Promise<string> {
  return tauriInvoke<string>('ecies_unwrap_key_from_state', {
    envelope,
    label,
  })
}

// ── Note encryption/decryption ───────────────────────────────────────

/**
 * Encrypt a note with per-note forward secrecy (public-key-only).
 */
export async function encryptNote(
  payloadJson: string,
  authorPubkey: string,
  adminPubkeys: string[],
): Promise<EncryptedNoteResult> {
  return tauriInvoke<EncryptedNoteResult>('encrypt_note', {
    payloadJson,
    authorPubkey,
    adminPubkeys,
  })
}

/**
 * Decrypt a V2 note using the appropriate envelope via CryptoState.
 */
export async function decryptNote(
  encryptedContent: string,
  envelope: import('./crypto').KeyEnvelope,
): Promise<string | null> {
  return tauriInvoke<string>('decrypt_note_from_state', {
    encryptedContent,
    envelope,
  })
}

/**
 * Decrypt a legacy V1 note via CryptoState.
 */
export async function decryptLegacyNote(
  packed: string,
): Promise<import('@shared/types').NotePayload | null> {
  try {
    const json = await tauriInvoke<string>('decrypt_legacy_note_from_state', { packed })
    return JSON.parse(json)
  } catch {
    return null
  }
}

// ── Message encryption/decryption ────────────────────────────────────

/**
 * Encrypt a message for multiple readers (public-key-only).
 */
export async function encryptMessage(
  plaintext: string,
  readerPubkeys: string[],
): Promise<EncryptedMessageResult> {
  return tauriInvoke<EncryptedMessageResult>('encrypt_message', {
    plaintext,
    readerPubkeys,
  })
}

/**
 * Decrypt a message using CryptoState (reader pubkey derived from state).
 */
export async function decryptMessage(
  encryptedContent: string,
  readerEnvelopes: import('./crypto').RecipientKeyEnvelope[],
): Promise<string | null> {
  try {
    return await tauriInvoke<string>('decrypt_message_from_state', {
      encryptedContent,
      readerEnvelopes,
    })
  } catch {
    return null
  }
}

// ── Call record decryption ───────────────────────────────────────────

/**
 * Decrypt a call record's encrypted metadata via CryptoState.
 */
export async function decryptCallRecord(
  encryptedContent: string,
  adminEnvelopes: import('./crypto').RecipientKeyEnvelope[],
): Promise<{ answeredBy: string | null; callerNumber: string } | null> {
  try {
    const json = await tauriInvoke<string>('decrypt_call_record_from_state', {
      encryptedContent,
      adminEnvelopes,
    })
    return JSON.parse(json)
  } catch {
    return null
  }
}

// ── Transcription decryption ─────────────────────────────────────────

/**
 * Decrypt a server-encrypted transcription via CryptoState.
 */
export async function decryptTranscription(
  packed: string,
  ephemeralPubkeyHex: string,
): Promise<string | null> {
  try {
    return await tauriInvoke<string>('decrypt_transcription_from_state', {
      packed,
      ephemeralPubkeyHex,
    })
  } catch {
    return null
  }
}

// ── Draft encryption/decryption ──────────────────────────────────────

/**
 * Encrypt a draft for local auto-save via CryptoState.
 */
export async function encryptDraft(
  plaintext: string,
): Promise<string> {
  return tauriInvoke<string>('encrypt_draft_from_state', { plaintext })
}

/**
 * Decrypt a locally-saved draft via CryptoState.
 */
export async function decryptDraft(
  packed: string,
): Promise<string | null> {
  try {
    return await tauriInvoke<string>('decrypt_draft_from_state', { packed })
  } catch {
    return null
  }
}

// ── Export encryption ────────────────────────────────────────────────

/**
 * Encrypt a JSON export blob via CryptoState.
 * Returns a base64-encoded string (Rust side encodes to base64 for IPC efficiency).
 */
export async function encryptExport(
  jsonString: string,
): Promise<string> {
  return tauriInvoke<string>('encrypt_export_from_state', { jsonString })
}

// ── Nostr event signing ──────────────────────────────────────────────

/**
 * Sign a Nostr event using CryptoState. Replaces finalizeEvent(template, sk).
 * Computes event ID + signs in Rust (canonical JSON serialization).
 */
export async function signNostrEvent(
  kind: number,
  createdAt: number,
  tags: string[][],
  content: string,
): Promise<SignedNostrEvent> {
  return tauriInvoke<SignedNostrEvent>('sign_nostr_event_from_state', {
    kind,
    createdAt,
    tags,
    content,
  })
}

// ── File crypto (ECIES ops through Rust) ─────────────────────────────

/**
 * Decrypt file metadata via ECIES through CryptoState.
 */
export async function decryptFileMetadata(
  encryptedContentHex: string,
  ephemeralPubkeyHex: string,
): Promise<string | null> {
  try {
    return await tauriInvoke<string>('decrypt_file_metadata_from_state', {
      encryptedContentHex,
      ephemeralPubkeyHex,
    })
  } catch {
    return null
  }
}

/**
 * Unwrap a file key envelope via CryptoState.
 */
export async function unwrapFileKey(
  envelope: import('./crypto').KeyEnvelope,
): Promise<string> {
  return tauriInvoke<string>('unwrap_file_key_from_state', { envelope })
}

/**
 * Unwrap a hub key envelope via CryptoState.
 */
export async function unwrapHubKey(
  envelope: import('./crypto').KeyEnvelope,
): Promise<string> {
  return tauriInvoke<string>('unwrap_hub_key_from_state', { envelope })
}

/**
 * Re-wrap a file key for a new recipient via CryptoState.
 */
export async function rewrapFileKey(
  encryptedFileKeyHex: string,
  ephemeralPubkeyHex: string,
  newRecipientPubkeyHex: string,
): Promise<import('./crypto').RecipientKeyEnvelope> {
  return tauriInvoke<import('./crypto').RecipientKeyEnvelope>('rewrap_file_key_from_state', {
    encryptedFileKeyHex,
    ephemeralPubkeyHex,
    newRecipientPubkeyHex,
  })
}

// ── nsec retrieval (device provisioning only) ────────────────────────

/**
 * Get nsec from CryptoState for device provisioning/backup ONLY.
 * This intentionally sends the nsec back to the webview — acceptable because
 * provisioning already sends it (encrypted) to another device.
 */
export async function getNsecFromState(): Promise<string> {
  return tauriInvoke<string>('get_nsec_from_state')
}

// ── Nsec validation & parsing (stateless) ────────────────────────────

/**
 * Validate nsec format via Rust (stateless IPC).
 */
export async function isValidNsec(nsec: string): Promise<boolean> {
  try {
    return await tauriInvoke<boolean>('is_valid_nsec', { nsec })
  } catch {
    return false
  }
}

/**
 * Parse nsec to keypair (stateless, for onboarding sign-in).
 * Returns null if the nsec is invalid.
 */
export async function keyPairFromNsec(nsec: string): Promise<PlatformKeyPair | null> {
  try {
    return await tauriInvoke<PlatformKeyPair>('key_pair_from_nsec', { nsec })
  } catch {
    return null
  }
}

// ── Schnorr signature verification (stateless) ──────────────────────

/**
 * Verify a Schnorr signature (stateless — for event/auth verification).
 */
export async function verifySchnorr(
  message: string,
  signature: string,
  pubkey: string,
): Promise<boolean> {
  try {
    return await tauriInvoke<boolean>('verify_schnorr', { message, signature, pubkey })
  } catch {
    return false
  }
}

// ── Key persistence ─────────────────────────────────────────────────

const TAURI_ENCRYPTED_KEY_STORE = 'llamenos-encrypted-key'

/**
 * Encrypt an nsec with a PIN and persist to Tauri Store.
 * Also loads the key into CryptoState (Rust-side).
 */
export async function encryptWithPin(
  nsec: string,
  pin: string,
  pubkeyHex: string,
): Promise<void> {
  const encryptedData = await tauriInvoke<EncryptedKeyData>('import_key_to_state', {
    nsec,
    pin,
    pubkeyHex,
  })
  const { Store } = await import('@tauri-apps/plugin-store')
  const store = await Store.load('keys.json')
  await store.set(TAURI_ENCRYPTED_KEY_STORE, encryptedData)
  await store.save()
}

/**
 * Decrypt an nsec from PIN-encrypted storage and load into CryptoState.
 * Returns ONLY the pubkey — the nsec NEVER leaves the Rust process.
 */
export async function decryptWithPin(pin: string): Promise<string | null> {
  const { Store } = await import('@tauri-apps/plugin-store')
  const store = await Store.load('keys.json')
  const data = await store.get<EncryptedKeyData>(TAURI_ENCRYPTED_KEY_STORE)
  if (!data) return null
  try {
    return await tauriInvoke<string>('unlock_with_pin', { data, pin })
  } catch {
    return null // Wrong PIN or corrupted data
  }
}

/**
 * Lock the crypto state (zeros nsec in Rust process).
 */
export async function lockCrypto(): Promise<void> {
  await tauriInvoke<void>('lock_crypto')
}

/**
 * Check if the crypto state is unlocked.
 */
export async function isCryptoUnlocked(): Promise<boolean> {
  return tauriInvoke<boolean>('is_crypto_unlocked')
}

/**
 * Check if an encrypted key exists in Tauri Store.
 */
export async function hasStoredKey(): Promise<boolean> {
  const { Store } = await import('@tauri-apps/plugin-store')
  const store = await Store.load('keys.json')
  const data = await store.get(TAURI_ENCRYPTED_KEY_STORE)
  return data !== null && data !== undefined
}

/**
 * Clear the encrypted key from Tauri Store and lock CryptoState.
 */
export async function clearStoredKey(): Promise<void> {
  const { Store } = await import('@tauri-apps/plugin-store')
  const store = await Store.load('keys.json')
  await store.delete(TAURI_ENCRYPTED_KEY_STORE)
  await store.save()
  await lockCrypto()
}
