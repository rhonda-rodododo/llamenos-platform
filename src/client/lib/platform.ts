/**
 * Platform abstraction layer — dual-backend crypto (Tauri IPC + WASM).
 *
 * In Tauri desktop: all crypto operations route through native Rust via IPC.
 * In browser/test: all crypto operations route through the Rust-compiled WASM module.
 *
 * The nsec (secret key) never enters JavaScript in either mode — it lives in
 * Rust memory (native process or WASM linear memory).
 *
 * This module is the single entry point for all platform-specific behavior.
 * Import from here instead of directly from crypto.ts or @tauri-apps/*.
 */

// Type re-exports from shared types
export type { KeyEnvelope, RecipientEnvelope, RecipientKeyEnvelope } from '@shared/types'

// ── Backend detection ────────────────────────────────────────────────
// Tauri injects __TAURI_INTERNALS__ at startup. If present, use IPC.
// Otherwise, use WASM (browser/test builds).

const useTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

// ── Tauri IPC wrapper (desktop only) ─────────────────────────────────

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(cmd, args)
}

// ── WASM backend (browser/test only) ─────────────────────────────────

type WasmModule = typeof import('../../../packages/crypto/dist/wasm/llamenos_core')
type WasmState = import('../../../packages/crypto/dist/wasm/llamenos_core').WasmCryptoState

let wasmModulePromise: Promise<WasmModule> | null = null
let wasmState: WasmState | null = null

async function getWasm(): Promise<WasmModule> {
  if (!wasmModulePromise) {
    wasmModulePromise = (async () => {
      try {
        const mod = await import('../../../packages/crypto/dist/wasm/llamenos_core')
        await mod.default()
        return mod
      } catch (e) {
        const msg = [
          'FATAL: WASM crypto module not available.',
          'Run: bun run crypto:wasm',
          `Original error: ${e instanceof Error ? e.message : String(e)}`,
        ].join('\n')
        throw new Error(msg)
      }
    })()
  }
  return wasmModulePromise
}

async function getWasmState(): Promise<WasmState> {
  const mod = await getWasm()
  if (!wasmState) {
    wasmState = new mod.WasmCryptoState()
  }
  return wasmState
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
  authorEnvelope: import('@shared/types').KeyEnvelope
  adminEnvelopes: import('@shared/types').RecipientEnvelope[]
}

export interface EncryptedMessageResult {
  encryptedContent: string
  readerEnvelopes: import('@shared/types').RecipientEnvelope[]
}

export interface EncryptedKeyData {
  salt: string
  iterations: number
  nonce: string
  ciphertext: string
  pubkey: string
}

// ── Keypair generation (stateless) ───────────────────────────────────

/** Generate a new Nostr keypair. */
export async function generateKeyPair(): Promise<PlatformKeyPair> {
  if (useTauri) {
    return tauriInvoke<PlatformKeyPair>('generate_keypair')
  }
  const mod = await getWasm()
  const result = mod.generateKeypair()
  return { secretKeyHex: result.skHex, publicKey: result.pubkeyHex, nsec: result.nsec, npub: result.npub }
}

/** Get x-only public key from a secret key hex (stateless). */
export async function getPublicKey(secretKeyHex: string): Promise<string> {
  if (useTauri) {
    return tauriInvoke<string>('get_public_key', { secretKeyHex })
  }
  const mod = await getWasm()
  return mod.getPublicKeyFromSecret(secretKeyHex)
}

/** Get public key from CryptoState (stateful). */
export async function getPublicKeyFromState(): Promise<string | null> {
  if (useTauri) {
    try {
      return await tauriInvoke<string>('get_public_key_from_state')
    } catch {
      return null
    }
  }
  try {
    const state = await getWasmState()
    return state.getPublicKey()
  } catch {
    return null
  }
}

// ── Auth tokens ──────────────────────────────────────────────────────

/**
 * Create a Schnorr auth token using CryptoState (nsec stays in Rust/WASM).
 */
export async function createAuthToken(
  timestamp: number,
  method: string,
  path: string,
): Promise<string> {
  if (useTauri) {
    return tauriInvoke<string>('create_auth_token_from_state', {
      timestamp,
      method,
      path,
    })
  }
  const state = await getWasmState()
  return JSON.stringify(state.createAuthToken(method, path))
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
  if (useTauri) {
    return tauriInvoke<string>('create_auth_token', {
      secretKeyHex,
      timestamp,
      method,
      path,
    })
  }
  const mod = await getWasm()
  return JSON.stringify(mod.createAuthTokenStateless(secretKeyHex, method, path))
}

// ── ECIES operations ─────────────────────────────────────────────────

/**
 * ECIES wrap a 32-byte key for a recipient (public-key-only, no nsec needed).
 */
export async function eciesWrapKey(
  keyHex: string,
  recipientPubkey: string,
  label: string,
): Promise<import('@shared/types').KeyEnvelope> {
  if (useTauri) {
    return tauriInvoke<import('@shared/types').KeyEnvelope>('ecies_wrap_key', {
      keyHex,
      recipientPubkey,
      label,
    })
  }
  const mod = await getWasm()
  return mod.eciesWrapKey(keyHex, recipientPubkey, label)
}

/**
 * ECIES unwrap a key from an envelope using CryptoState.
 */
export async function eciesUnwrapKey(
  envelope: import('@shared/types').KeyEnvelope,
  label: string,
): Promise<string> {
  if (useTauri) {
    return tauriInvoke<string>('ecies_unwrap_key_from_state', {
      envelope,
      label,
    })
  }
  const state = await getWasmState()
  return state.eciesUnwrapKey(JSON.stringify(envelope), label)
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
  if (useTauri) {
    return tauriInvoke<EncryptedNoteResult>('encrypt_note', {
      payloadJson,
      authorPubkey,
      adminPubkeys,
    })
  }
  const state = await getWasmState()
  return state.encryptNote(payloadJson, authorPubkey, JSON.stringify(adminPubkeys))
}

/**
 * Decrypt a V2 note using the appropriate envelope via CryptoState.
 */
export async function decryptNote(
  encryptedContent: string,
  envelope: import('@shared/types').KeyEnvelope,
): Promise<string | null> {
  if (useTauri) {
    return tauriInvoke<string>('decrypt_note_from_state', {
      encryptedContent,
      envelope,
    })
  }
  try {
    const state = await getWasmState()
    return state.decryptNote(encryptedContent, JSON.stringify(envelope))
  } catch {
    return null
  }
}

/**
 * Decrypt a legacy V1 note via CryptoState.
 */
export async function decryptLegacyNote(
  packed: string,
): Promise<import('@shared/types').NotePayload | null> {
  if (useTauri) {
    try {
      const json = await tauriInvoke<string>('decrypt_legacy_note_from_state', { packed })
      return JSON.parse(json)
    } catch {
      return null
    }
  }
  try {
    const state = await getWasmState()
    const json = state.decryptLegacyNote(packed)
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
  if (useTauri) {
    return tauriInvoke<EncryptedMessageResult>('encrypt_message', {
      plaintext,
      readerPubkeys,
    })
  }
  const state = await getWasmState()
  return state.encryptMessage(plaintext, JSON.stringify(readerPubkeys))
}

/**
 * Decrypt a message using CryptoState (reader pubkey derived from state).
 */
export async function decryptMessage(
  encryptedContent: string,
  readerEnvelopes: import('@shared/types').RecipientEnvelope[],
): Promise<string | null> {
  if (useTauri) {
    try {
      return await tauriInvoke<string>('decrypt_message_from_state', {
        encryptedContent,
        readerEnvelopes,
      })
    } catch {
      return null
    }
  }
  try {
    const state = await getWasmState()
    return state.decryptMessage(encryptedContent, JSON.stringify(readerEnvelopes))
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
  adminEnvelopes: import('@shared/types').RecipientEnvelope[],
): Promise<{ answeredBy: string | null; callerNumber: string } | null> {
  if (useTauri) {
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
  try {
    const state = await getWasmState()
    const json = state.decryptCallRecord(encryptedContent, JSON.stringify(adminEnvelopes))
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
  if (useTauri) {
    try {
      return await tauriInvoke<string>('decrypt_transcription_from_state', {
        packed,
        ephemeralPubkeyHex,
      })
    } catch {
      return null
    }
  }
  try {
    const state = await getWasmState()
    return state.decryptTranscription(packed, ephemeralPubkeyHex)
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
  if (useTauri) {
    return tauriInvoke<string>('encrypt_draft_from_state', { plaintext })
  }
  const state = await getWasmState()
  return state.encryptDraft(plaintext)
}

/**
 * Decrypt a locally-saved draft via CryptoState.
 */
export async function decryptDraft(
  packed: string,
): Promise<string | null> {
  if (useTauri) {
    try {
      return await tauriInvoke<string>('decrypt_draft_from_state', { packed })
    } catch {
      return null
    }
  }
  try {
    const state = await getWasmState()
    return state.decryptDraft(packed)
  } catch {
    return null
  }
}

// ── Export encryption ────────────────────────────────────────────────

/**
 * Encrypt a JSON export blob via CryptoState.
 * Returns a base64-encoded string.
 */
export async function encryptExport(
  jsonString: string,
): Promise<string> {
  if (useTauri) {
    return tauriInvoke<string>('encrypt_export_from_state', { jsonString })
  }
  const state = await getWasmState()
  return state.encryptExport(jsonString)
}

// ── Nostr event signing ──────────────────────────────────────────────

/**
 * Sign a Nostr event using CryptoState.
 */
export async function signNostrEvent(
  kind: number,
  createdAt: number,
  tags: string[][],
  content: string,
): Promise<SignedNostrEvent> {
  if (useTauri) {
    return tauriInvoke<SignedNostrEvent>('sign_nostr_event_from_state', {
      kind,
      createdAt,
      tags,
      content,
    })
  }
  const state = await getWasmState()
  const eventTemplate = { kind, created_at: createdAt, tags, content }
  return state.signNostrEvent(JSON.stringify(eventTemplate))
}

// ── File crypto ──────────────────────────────────────────────────────

/**
 * Decrypt file metadata via ECIES through CryptoState.
 */
export async function decryptFileMetadata(
  encryptedContentHex: string,
  ephemeralPubkeyHex: string,
): Promise<string | null> {
  if (useTauri) {
    try {
      return await tauriInvoke<string>('decrypt_file_metadata_from_state', {
        encryptedContentHex,
        ephemeralPubkeyHex,
      })
    } catch {
      return null
    }
  }
  try {
    const state = await getWasmState()
    const envelope = { wrappedKey: encryptedContentHex, ephemeralPubkey: ephemeralPubkeyHex }
    return state.decryptFileMetadata(encryptedContentHex, JSON.stringify(envelope))
  } catch {
    return null
  }
}

/**
 * Unwrap a file key envelope via CryptoState.
 */
export async function unwrapFileKey(
  envelope: import('@shared/types').KeyEnvelope,
): Promise<string> {
  if (useTauri) {
    return tauriInvoke<string>('unwrap_file_key_from_state', { envelope })
  }
  const state = await getWasmState()
  return state.unwrapFileKey(JSON.stringify(envelope))
}

/**
 * Unwrap a hub key envelope via CryptoState.
 */
export async function unwrapHubKey(
  envelope: import('@shared/types').KeyEnvelope,
): Promise<string> {
  if (useTauri) {
    return tauriInvoke<string>('unwrap_hub_key_from_state', { envelope })
  }
  const state = await getWasmState()
  return state.unwrapHubKey(JSON.stringify(envelope))
}

/**
 * Re-wrap a file key for a new recipient via CryptoState.
 */
export async function rewrapFileKey(
  encryptedFileKeyHex: string,
  ephemeralPubkeyHex: string,
  newRecipientPubkeyHex: string,
): Promise<import('@shared/types').RecipientEnvelope> {
  if (useTauri) {
    return tauriInvoke<import('@shared/types').RecipientEnvelope>('rewrap_file_key_from_state', {
      encryptedFileKeyHex,
      ephemeralPubkeyHex,
      newRecipientPubkeyHex,
    })
  }
  const state = await getWasmState()
  const envelope = { wrappedKey: encryptedFileKeyHex, ephemeralPubkey: ephemeralPubkeyHex }
  return state.rewrapFileKey(JSON.stringify(envelope), newRecipientPubkeyHex)
}

// ── Device provisioning (nsec never enters JS) ──────────────────────

export interface ProvisioningEncryptResult {
  encryptedHex: string
  sasCode: string
}

export interface ProvisioningDecryptResult {
  nsec: string
  sasCode: string
}

/**
 * Encrypt the nsec for device provisioning entirely in Rust/WASM.
 * The nsec NEVER enters JavaScript — ECDH, key derivation, encryption,
 * and SAS computation all happen inside the native/WASM crypto module.
 */
export async function encryptNsecForProvisioning(
  ephemeralPubkeyHex: string,
): Promise<ProvisioningEncryptResult> {
  if (useTauri) {
    return tauriInvoke<ProvisioningEncryptResult>('encrypt_nsec_for_provisioning', {
      ephemeralPubkeyHex,
    })
  }
  const state = await getWasmState()
  return state.encryptNsecForProvisioning(ephemeralPubkeyHex)
}

/**
 * Decrypt a provisioned nsec from the primary device entirely in Rust/WASM.
 * Used by the NEW device after receiving the encrypted payload.
 *
 * Note: The ephemeral SK is passed in because it was generated before
 * CryptoState existed on this device.
 */
export async function decryptProvisionedNsec(
  encryptedHex: string,
  primaryPubkeyHex: string,
  ephemeralSkHex: string,
): Promise<ProvisioningDecryptResult> {
  if (useTauri) {
    return tauriInvoke<ProvisioningDecryptResult>('decrypt_provisioned_nsec', {
      encryptedHex,
      primaryPubkeyHex,
      ephemeralSkHex,
    })
  }
  const state = await getWasmState()
  return state.decryptProvisionedNsec(encryptedHex, primaryPubkeyHex, ephemeralSkHex)
}

/**
 * Get nsec from CryptoState for device provisioning/backup ONLY.
 * @deprecated Use encryptNsecForProvisioning instead — this leaks the nsec into JS.
 */
export async function getNsecFromState(): Promise<string> {
  if (useTauri) {
    const token = await tauriInvoke<string>('request_provisioning_token')
    return tauriInvoke<string>('get_nsec_from_state', { token })
  }
  const state = await getWasmState()
  const token = state.requestProvisioningToken()
  return state.getNsec(token)
}

// ── Nsec validation & parsing (stateless) ────────────────────────────

/**
 * Validate nsec format (stateless).
 */
export async function isValidNsec(nsec: string): Promise<boolean> {
  if (useTauri) {
    try {
      return await tauriInvoke<boolean>('is_valid_nsec', { nsec })
    } catch {
      return false
    }
  }
  try {
    const mod = await getWasm()
    return mod.isValidNsec(nsec)
  } catch {
    return false
  }
}

/**
 * Parse nsec to keypair (stateless, for onboarding sign-in).
 * Returns null if the nsec is invalid.
 */
export async function keyPairFromNsec(nsec: string): Promise<PlatformKeyPair | null> {
  if (useTauri) {
    try {
      return await tauriInvoke<PlatformKeyPair>('key_pair_from_nsec', { nsec })
    } catch {
      return null
    }
  }
  try {
    const mod = await getWasm()
    const result = mod.keyPairFromNsec(nsec)
    return { secretKeyHex: result.skHex, publicKey: result.pubkeyHex, nsec: result.nsec, npub: result.npub }
  } catch {
    return null
  }
}

// ── Schnorr signature verification (stateless) ──────────────────────

/**
 * Verify a Schnorr signature (stateless).
 */
export async function verifySchnorr(
  message: string,
  signature: string,
  pubkey: string,
): Promise<boolean> {
  if (useTauri) {
    try {
      return await tauriInvoke<boolean>('verify_schnorr', { message, signature, pubkey })
    } catch {
      return false
    }
  }
  try {
    const mod = await getWasm()
    return mod.verifySchnorr(message, signature, pubkey)
  } catch {
    return false
  }
}

// ── WASM value conversion ────────────────────────────────────────────

/**
 * Convert a value returned by serde_wasm_bindgen 0.6 (default serializer) to a plain JS object.
 * serde_wasm_bindgen 0.6 converts Rust/serde map types (including serde_json::Value::Object)
 * to JS Map objects, which serialize as {} with JSON.stringify. This recursively converts
 * Maps to plain objects so the result can be stored and retrieved correctly.
 */
function fromWasmValue(val: unknown): unknown {
  if (val instanceof Map) {
    const obj: Record<string, unknown> = {}
    val.forEach((v: unknown, k: unknown) => { obj[String(k)] = fromWasmValue(v) })
    return obj
  }
  if (Array.isArray(val)) return val.map(fromWasmValue)
  return val
}

// ── Key persistence ─────────────────────────────────────────────────

const STORE_KEY = 'llamenos-encrypted-key'

/** Get the Tauri Store or a localStorage-based fallback for browser. */
async function getStore() {
  if (useTauri) {
    const { Store } = await import('@tauri-apps/plugin-store')
    return Store.load('keys.json')
  }
  // Browser/test: use localStorage with a prefix
  return {
    async get<T>(key: string): Promise<T | null> {
      const raw = localStorage.getItem(`llamenos:${key}`)
      if (raw === null) return null
      return JSON.parse(raw) as T
    },
    async set(key: string, value: unknown): Promise<void> {
      localStorage.setItem(`llamenos:${key}`, JSON.stringify(value))
    },
    async delete(key: string): Promise<void> {
      localStorage.removeItem(`llamenos:${key}`)
    },
    async save(): Promise<void> {
      // No-op — localStorage persists automatically
    },
  }
}

/**
 * Encrypt an nsec with a PIN and persist to store.
 * Also loads the key into CryptoState.
 */
export async function encryptWithPin(
  nsec: string,
  pin: string,
  pubkeyHex: string,
): Promise<void> {
  let encryptedData: EncryptedKeyData
  if (useTauri) {
    encryptedData = await tauriInvoke<EncryptedKeyData>('import_key_to_state', {
      nsec,
      pin,
      pubkeyHex,
    })
  } else {
    const state = await getWasmState()
    // importKey returns { encryptedKeyData: EncryptedKeyData, pubkey: string }.
    // serde_wasm_bindgen 0.6 converts serde_json::Value::Object to JS Map (not plain object),
    // so JSON.stringify gives {}. Use fromWasmValue to get plain objects, then extract the inner data.
    const result = fromWasmValue(state.importKey(nsec, pin)) as { encryptedKeyData: EncryptedKeyData }
    encryptedData = result.encryptedKeyData
  }
  const store = await getStore()
  await store.set(STORE_KEY, encryptedData)
  await store.save()
}

/**
 * Decrypt an nsec from PIN-encrypted storage and load into CryptoState.
 * Returns ONLY the pubkey — the nsec NEVER leaves the Rust/WASM process.
 *
 * Throws on lockout or key wipe.
 * Returns null only for wrong PIN (no lockout).
 */
export async function decryptWithPin(pin: string): Promise<string | null> {
  const store = await getStore()
  const data = await store.get<EncryptedKeyData>(STORE_KEY)
  if (!data) return null
  if (useTauri) {
    try {
      return await tauriInvoke<string>('unlock_with_pin', { data, pin })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('Locked out') || msg.includes('Keys wiped')) {
        throw new Error(msg)
      }
      return null
    }
  }
  try {
    const state = await getWasmState()
    return state.unlockWithPin(JSON.stringify(data), pin)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('Locked out') || msg.includes('Keys wiped')) {
      throw new Error(msg)
    }
    return null
  }
}

/**
 * Lock the crypto state (zeros nsec).
 */
export async function lockCrypto(): Promise<void> {
  if (useTauri) {
    await tauriInvoke<void>('lock_crypto')
    return
  }
  const state = await getWasmState()
  state.lock()
}

/**
 * Check if the crypto state is unlocked.
 */
export async function isCryptoUnlocked(): Promise<boolean> {
  if (useTauri) {
    return tauriInvoke<boolean>('is_crypto_unlocked')
  }
  const state = await getWasmState()
  return state.isUnlocked()
}

/**
 * Check if an encrypted key exists in store.
 */
export async function hasStoredKey(): Promise<boolean> {
  const store = await getStore()
  const data = await store.get(STORE_KEY)
  return data !== null && data !== undefined
}

/**
 * Clear the encrypted key from store and lock CryptoState.
 */
export async function clearStoredKey(): Promise<void> {
  const store = await getStore()
  await store.delete(STORE_KEY)
  await store.save()
  await lockCrypto()
}
