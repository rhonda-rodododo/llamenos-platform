/**
 * Platform abstraction layer — v3 crypto API (Ed25519 / X25519 / HPKE).
 *
 * In Tauri desktop: all crypto operations route through native Rust via IPC.
 * In browser/test: WASM or JS mock implementations.
 *
 * Device key material (Ed25519 signing seed + X25519 encryption seed) never
 * enters JavaScript — it lives in Rust memory (native process or WASM).
 *
 * This module is the single entry point for all platform-specific behavior.
 * Import from here instead of directly from @tauri-apps/*.
 */

// ── Backend detection ────────────────────────────────────────────────

const useTauri = typeof window !== 'undefined' &&
  ('__TAURI_INTERNALS__' in window || !!import.meta.env.PLAYWRIGHT_TEST)

// ── Tauri IPC wrapper (desktop only) ─────────────────────────────────

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(cmd, args)
}

// ── Crypto types (v3) ───────────────────────────────────────────────

/** HPKE envelope — RFC 9180 sealed payload. */
export interface HpkeEnvelope {
  v: number       // Version (3)
  labelId: number  // Label registry ID
  enc: string     // Base64url-encoded encapsulated key (32 bytes)
  ct: string      // Base64url-encoded ciphertext
}

/** Device key state — public info only, no secrets. */
export interface DeviceKeyState {
  deviceId: string
  signingPubkeyHex: string      // Ed25519 (64 hex chars)
  encryptionPubkeyHex: string   // X25519 (64 hex chars)
}

/** PIN-encrypted device key blob for persistent storage. */
export interface EncryptedDeviceKeys {
  salt: string
  iterations: number
  nonce: string
  ciphertext: string
  state: DeviceKeyState
}

/** Ed25519 auth token. */
export interface AuthToken {
  pubkey: string     // Ed25519 (64 hex chars)
  timestamp: number  // Unix timestamp ms
  token: string      // Ed25519 signature (128 hex chars)
}

/** PUK state — per-user key public info. */
export interface PukState {
  generation: number
  signPubkeyHex: string  // Ed25519 (64 hex chars)
  dhPubkeyHex: string    // X25519 (64 hex chars)
}

/** PUK creation result. */
export interface PukCreateResult {
  pukState: PukState
  seedHex: string
  envelope: HpkeEnvelope
}

/** PUK rotation result. */
export interface PukRotateResult {
  state: PukState
  deviceEnvelopes: Array<{ deviceId: string; envelope: HpkeEnvelope }>
  clkrChainLinkHex: string
}

/** Sigchain link — append-only identity log entry. */
export interface SigchainLink {
  id: string
  seq: number
  prevHash: string | null
  entryHash: string
  signerDeviceId: string
  signerPubkey: string   // Ed25519 (64 hex chars)
  signature: string      // Ed25519 (128 hex chars)
  timestamp: string      // ISO-8601
  payloadJson: string    // Type-tagged JSON
}

/** Sigchain verification result. */
export interface SigchainVerifiedState {
  verifiedCount: number
  headSeq: number
  headHash: string
  activeDevicePubkeys: string[]
}

// ── Device key management ───────────────────────────────────────────

/**
 * Generate a new device keypair, encrypt with PIN, and load into CryptoState.
 * Returns the encrypted key blob — secrets NEVER enter JS.
 */
export async function deviceGenerateAndLoad(
  pin: string,
  deviceId: string,
): Promise<EncryptedDeviceKeys> {
  if (useTauri) {
    return tauriInvoke<EncryptedDeviceKeys>('device_generate_and_load', { pin, deviceId })
  }
  throw new Error('WASM device key generation not yet implemented')
}

/**
 * Import a known Ed25519 signing seed as device keys.
 * Encryption seed is derived via HKDF from the signing seed.
 * Used in tests to import known key material.
 */
export async function deviceImportAndLoad(
  signingSecretHex: string,
  pin: string,
  deviceId: string,
): Promise<EncryptedDeviceKeys> {
  if (useTauri) {
    return tauriInvoke<EncryptedDeviceKeys>('device_import_and_load', { signingSecretHex, pin, deviceId })
  }
  throw new Error('WASM device import not yet implemented')
}

/**
 * Import a legacy secp256k1 secret key (nsec hex) as device keys.
 * Used for backward-compatible admin login in tests.
 */
export async function legacyImportNsec(
  nsecHex: string,
  pin: string,
  deviceId: string,
): Promise<EncryptedDeviceKeys> {
  if (useTauri) {
    return tauriInvoke<EncryptedDeviceKeys>('legacy_import_nsec', { nsecHex, pin, deviceId })
  }
  throw new Error('WASM legacy import not yet implemented')
}

/**
 * Decrypt device keys from PIN-encrypted storage, load into CryptoState.
 * Returns only the device state (public keys) — secrets NEVER leave Rust.
 * Throws on lockout or key wipe. Returns null only for wrong PIN.
 */
export async function unlockWithPin(
  data: EncryptedDeviceKeys,
  pin: string,
): Promise<DeviceKeyState | null> {
  if (useTauri) {
    try {
      return await tauriInvoke<DeviceKeyState>('unlock_with_pin', { data, pin })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('Locked out') || msg.includes('Keys wiped')) {
        throw new Error(msg)
      }
      return null
    }
  }
  throw new Error('WASM unlock not yet implemented')
}

/** Lock the crypto state — zeroizes device secrets. */
export async function lockCrypto(): Promise<void> {
  if (useTauri) {
    await tauriInvoke<void>('lock_crypto')
    return
  }
  throw new Error('WASM lock not yet implemented')
}

/** Check if the crypto state is unlocked. */
export async function isCryptoUnlocked(): Promise<boolean> {
  if (useTauri) {
    return tauriInvoke<boolean>('is_crypto_unlocked')
  }
  return false
}

/** Get the device public keys from CryptoState. */
export async function getDevicePubkeys(): Promise<DeviceKeyState | null> {
  if (useTauri) {
    try {
      return await tauriInvoke<DeviceKeyState>('get_device_pubkeys')
    } catch {
      return null
    }
  }
  return null
}

// ── Auth tokens (Ed25519) ───────────────────────────────────────────

/**
 * Create an Ed25519 auth token using the device signing key in CryptoState.
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
  throw new Error('WASM auth token not yet implemented')
}

// ── Ed25519 signing/verification ────────────────────────────────────

/** Sign a hex-encoded message using the device's Ed25519 key. */
export async function ed25519Sign(messageHex: string): Promise<string> {
  if (useTauri) {
    return tauriInvoke<string>('ed25519_sign_from_state', { messageHex })
  }
  throw new Error('WASM ed25519 sign not yet implemented')
}

/** Verify an Ed25519 signature (stateless — no secrets needed). */
export async function ed25519Verify(
  messageHex: string,
  signatureHex: string,
  pubkeyHex: string,
): Promise<boolean> {
  if (useTauri) {
    try {
      return await tauriInvoke<boolean>('ed25519_verify', {
        messageHex,
        signatureHex,
        pubkeyHex,
      })
    } catch {
      return false
    }
  }
  return false
}

// ── HPKE envelope encryption ───────────────────────────────────────

/**
 * HPKE seal: encrypt plaintext for a recipient's X25519 pubkey (stateless).
 */
export async function hpkeSeal(
  plaintextHex: string,
  recipientPubkeyHex: string,
  label: string,
  aadHex: string,
): Promise<HpkeEnvelope> {
  if (useTauri) {
    return tauriInvoke<HpkeEnvelope>('hpke_seal', {
      plaintextHex,
      recipientPubkeyHex,
      label,
      aadHex,
    })
  }
  throw new Error('WASM hpke seal not yet implemented')
}

/**
 * HPKE open: decrypt an envelope using the device's X25519 key from CryptoState.
 */
export async function hpkeOpenFromState(
  envelope: HpkeEnvelope,
  expectedLabel: string,
  aadHex: string,
): Promise<string> {
  if (useTauri) {
    return tauriInvoke<string>('hpke_open_from_state', {
      envelope,
      expectedLabel,
      aadHex,
    })
  }
  throw new Error('WASM hpke open not yet implemented')
}

/**
 * HPKE seal a 32-byte key for a recipient (convenience wrapper).
 */
export async function hpkeSealKey(
  keyHex: string,
  recipientPubkeyHex: string,
  label: string,
  aadHex: string,
): Promise<HpkeEnvelope> {
  if (useTauri) {
    return tauriInvoke<HpkeEnvelope>('hpke_seal_key', {
      keyHex,
      recipientPubkeyHex,
      label,
      aadHex,
    })
  }
  throw new Error('WASM hpke seal key not yet implemented')
}

/**
 * HPKE open a 32-byte key from an envelope using CryptoState.
 */
export async function hpkeOpenKeyFromState(
  envelope: HpkeEnvelope,
  expectedLabel: string,
  aadHex: string,
): Promise<string> {
  if (useTauri) {
    return tauriInvoke<string>('hpke_open_key_from_state', {
      envelope,
      expectedLabel,
      aadHex,
    })
  }
  throw new Error('WASM hpke open key not yet implemented')
}

// ── PUK (Per-User Key) ─────────────────────────────────────────────

/** Create the initial PUK (generation 1), wrapped to the device's X25519 pubkey. */
export async function pukCreateFromState(): Promise<PukCreateResult> {
  if (useTauri) {
    return tauriInvoke<PukCreateResult>('puk_create_from_state')
  }
  throw new Error('WASM puk create not yet implemented')
}

/** Rotate the PUK to a new generation. */
export async function pukRotate(
  oldSeedHex: string,
  oldGen: number,
  remainingDevices: Array<[string, string]>,
): Promise<PukRotateResult> {
  if (useTauri) {
    return tauriInvoke<PukRotateResult>('puk_rotate', {
      oldSeedHex,
      oldGen,
      remainingDevicesJson: JSON.stringify(remainingDevices),
    })
  }
  throw new Error('WASM puk rotate not yet implemented')
}

/** Unwrap a PUK seed from an HPKE envelope using CryptoState. */
export async function pukUnwrapSeedFromState(
  envelope: HpkeEnvelope,
  expectedLabel: string,
  aadHex: string,
): Promise<string> {
  if (useTauri) {
    return tauriInvoke<string>('puk_unwrap_seed_from_state', {
      envelope,
      expectedLabel,
      aadHex,
    })
  }
  throw new Error('WASM puk unwrap seed not yet implemented')
}

// ── Sigchain ────────────────────────────────────────────────────────

/** Sign a new sigchain link using the device's Ed25519 key from CryptoState. */
export async function sigchainCreateLinkFromState(
  id: string,
  seq: number,
  prevHash: string | null,
  timestamp: string,
  payloadJson: string,
): Promise<SigchainLink> {
  if (useTauri) {
    return tauriInvoke<SigchainLink>('sigchain_create_link_from_state', {
      id,
      seq,
      prevHash,
      timestamp,
      payloadJson,
    })
  }
  throw new Error('WASM sigchain create link not yet implemented')
}

/** Verify a sigchain (stateless). */
export async function sigchainVerify(
  links: SigchainLink[],
): Promise<SigchainVerifiedState> {
  if (useTauri) {
    return tauriInvoke<SigchainVerifiedState>('sigchain_verify', {
      linksJson: JSON.stringify(links),
    })
  }
  throw new Error('WASM sigchain verify not yet implemented')
}

/** Verify a single sigchain link (stateless). */
export async function sigchainVerifyLink(
  link: SigchainLink,
  expectedSignerPubkey: string,
): Promise<boolean> {
  if (useTauri) {
    return tauriInvoke<boolean>('sigchain_verify_link', {
      linkJson: JSON.stringify(link),
      expectedSignerPubkey,
    })
  }
  return false
}

// ── SFrame key derivation ───────────────────────────────────────────

/** Derive an SFrame key for a call participant (stateless). */
export async function sframeDeriveKey(
  exporterSecretHex: string,
  callId: string,
  participantIndex: number,
): Promise<string> {
  if (useTauri) {
    return tauriInvoke<string>('sframe_derive_key', {
      exporterSecretHex,
      callId,
      participantIndex,
    })
  }
  throw new Error('WASM sframe derive key not yet implemented')
}

// ── Key persistence ─────────────────────────────────────────────────

const STORE_KEY = 'llamenos-encrypted-device-keys'

/** Get the Tauri Store or a localStorage-based fallback for browser. */
async function getStore() {
  if (useTauri) {
    const { Store } = await import('@tauri-apps/plugin-store')
    return Store.load('keys.json')
  }
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
 * Persist encrypted device keys to store and unlock.
 * Used during onboarding after device_generate_and_load.
 */
export async function persistAndUnlockDeviceKeys(
  encrypted: EncryptedDeviceKeys,
  pin: string,
): Promise<DeviceKeyState | null> {
  const store = await getStore()
  await store.set(STORE_KEY, encrypted)
  await store.save()
  return unlockWithPin(encrypted, pin)
}

/**
 * Load encrypted device keys from store and unlock with PIN.
 * Returns null for wrong PIN, throws on lockout/wipe.
 */
export async function unlockStoredKeys(pin: string): Promise<DeviceKeyState | null> {
  const store = await getStore()
  const data = await store.get<EncryptedDeviceKeys>(STORE_KEY)
  if (!data) return null
  return unlockWithPin(data, pin)
}

/** Check if encrypted device keys exist in store. */
export async function hasStoredKey(): Promise<boolean> {
  const store = await getStore()
  const data = await store.get(STORE_KEY)
  return data !== null && data !== undefined
}

/** Clear encrypted keys from store and lock CryptoState. */
export async function clearStoredKey(): Promise<void> {
  const store = await getStore()
  await store.delete(STORE_KEY)
  await store.save()
  await lockCrypto()
}

// ══════════════════════════════════════════════════════════════════════
// Backward-compatibility layer — transitional exports for callers that
// still use the v2 (secp256k1/ECIES/Schnorr) API names.
//
// These will be removed once all callers are migrated to the v3 API.
// Functions that cannot be meaningfully mapped throw at runtime.
// ══════════════════════════════════════════════════════════════════════

// --- Legacy type re-exports ---

import type {
  KeyEnvelope as _KeyEnvelope,
  RecipientEnvelope as _RecipientEnvelope,
  RecipientKeyEnvelope as _RecipientKeyEnvelope,
} from '@shared/types'

/** @deprecated Use HpkeEnvelope instead. */
export type KeyEnvelope = _KeyEnvelope
/** @deprecated Use HpkeEnvelope instead. */
export type RecipientEnvelope = _RecipientEnvelope
/** @deprecated Use HpkeEnvelope instead. */
export type RecipientKeyEnvelope = _RecipientKeyEnvelope

/** @deprecated Use EncryptedDeviceKeys instead. */
export interface EncryptedKeyData {
  salt: string
  iterations: number
  nonce: string
  ciphertext: string
  pubkey: string
}

/** @deprecated Use DeviceKeyState instead. */
export interface PublicKeyPair {
  publicKey: string
  npub: string
}

/** @deprecated Use EncryptedDeviceKeys instead. */
export interface GenerateAndLoadResult extends PublicKeyPair {
  encryptedKeyData: EncryptedKeyData
}

/** @deprecated Removed in v3 — no more Nostr nsec/npub. */
export interface EphemeralKeyPair {
  publicKey: string
  npub: string
  nsec: string
}

/** @deprecated Removed in v3 — use Ed25519 signing. */
export interface SignedNostrEvent {
  id: string
  pubkey: string
  created_at: number
  kind: number
  tags: string[][]
  content: string
  sig: string
}

/** @deprecated High-level encryption results. */
export interface EncryptedNoteResult {
  encryptedContent: string
  authorEnvelope: KeyEnvelope
  adminEnvelopes: RecipientEnvelope[]
}

/** @deprecated High-level encryption results. */
export interface EncryptedMessageResult {
  encryptedContent: string
  readerEnvelopes: RecipientEnvelope[]
}

/** @deprecated Use HpkeEnvelope instead. */
export interface FileKeyEnvelope {
  wrappedKey: string
  ephemeralPubkey: string
}

// --- Legacy function wrappers ---

/** @deprecated Use deviceGenerateAndLoad + persistAndUnlockDeviceKeys instead. */
export async function generateKeypairAndLoad(pin: string): Promise<GenerateAndLoadResult> {
  const deviceId = crypto.randomUUID()
  const encrypted = await deviceGenerateAndLoad(pin, deviceId)
  // Persist to store so the key survives page reloads
  await persistAndUnlockDeviceKeys(encrypted, pin)
  // Map v3 result to v2 shape for callers
  return {
    publicKey: encrypted.state.signingPubkeyHex,
    npub: '', // No more npub in v3
    encryptedKeyData: {
      salt: encrypted.salt,
      iterations: encrypted.iterations,
      nonce: encrypted.nonce,
      ciphertext: encrypted.ciphertext,
      pubkey: encrypted.state.signingPubkeyHex,
    },
  }
}

/** @deprecated Use unlockStoredKeys instead. */
export async function decryptWithPin(pin: string): Promise<string | null> {
  const state = await unlockStoredKeys(pin)
  return state?.signingPubkeyHex ?? null
}

/** @deprecated No more nsec-based key import in v3. */
export async function encryptWithPin(
  _nsec: string,
  _pin: string,
  _pubkeyHex: string,
): Promise<void> {
  throw new Error('encryptWithPin removed in v3 — use deviceGenerateAndLoad instead')
}

/** @deprecated Use getDevicePubkeys instead. */
export async function getPublicKeyFromState(): Promise<string | null> {
  const state = await getDevicePubkeys()
  return state?.signingPubkeyHex ?? null
}

/** @deprecated No more nsec in v3. */
export async function pubkeyFromNsec(_nsec: string): Promise<string | null> {
  throw new Error('pubkeyFromNsec removed in v3 — no more Nostr nsec/npub')
}

/** @deprecated No more nsec validation in v3. */
export async function isValidNsec(_nsec: string): Promise<boolean> {
  return false
}

/** @deprecated Use ed25519Verify instead. */
export async function verifySchnorr(
  message: string,
  signature: string,
  pubkey: string,
): Promise<boolean> {
  return ed25519Verify(message, signature, pubkey)
}

// ── Helpers: base64url ↔ hex conversion for HPKE enc field ──────────

function base64urlToHex(b64url: string): string {
  const padded = b64url.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice(0, (4 - (b64url.length % 4)) % 4)
  const binary = atob(padded)
  return Array.from(binary, c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('')
}

function hexToBase64url(hex: string): string {
  const bytes = hex.match(/.{2}/g)!.map(b => String.fromCharCode(parseInt(b, 16))).join('')
  return btoa(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// ── AES-256-GCM content encryption (WebCrypto) ─────────────────────

async function aesGcmEncrypt(plaintext: string, keyHex: string): Promise<string> {
  const keyBytes = new Uint8Array(keyHex.match(/.{2}/g)!.map(b => parseInt(b, 16)))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cryptoKey = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt'])
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, new TextEncoder().encode(plaintext)))
  const packed = new Uint8Array(iv.length + ct.length)
  packed.set(iv)
  packed.set(ct, iv.length)
  return Array.from(packed, b => b.toString(16).padStart(2, '0')).join('')
}

async function aesGcmDecrypt(ciphertextHex: string, keyHex: string): Promise<string> {
  const data = new Uint8Array(ciphertextHex.match(/.{2}/g)!.map(b => parseInt(b, 16)))
  const iv = data.slice(0, 12)
  const ct = data.slice(12)
  const keyBytes = new Uint8Array(keyHex.match(/.{2}/g)!.map(b => parseInt(b, 16)))
  const cryptoKey = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt'])
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, ct)
  return new TextDecoder().decode(plaintext)
}

/**
 * Resolve the encryption pubkey for a recipient.
 *
 * If the pubkey matches the current device's signing pubkey, returns the
 * device's X25519 encryption pubkey (they differ in v3). Otherwise returns
 * the pubkey as-is (assumes it's already an encryption pubkey from the server).
 */
async function resolveEncryptionPubkey(signingOrEncPubkey: string): Promise<string> {
  const deviceState = await getDevicePubkeys()
  if (deviceState && signingOrEncPubkey === deviceState.signingPubkeyHex) {
    return deviceState.encryptionPubkeyHex
  }
  return signingOrEncPubkey
}

/** @deprecated Use hpkeSealKey instead. */
export async function eciesWrapKey(
  keyHex: string,
  recipientPubkey: string,
  label: string,
): Promise<KeyEnvelope> {
  const encPubkey = await resolveEncryptionPubkey(recipientPubkey)
  const envelope = await hpkeSealKey(keyHex, encPubkey, label, '')
  // Convert base64url enc to hex for eciesPubkeySchema compatibility
  return { wrappedKey: envelope.ct, ephemeralPubkey: base64urlToHex(envelope.enc) }
}

/** @deprecated Use hpkeOpenKeyFromState instead. */
export async function eciesUnwrapKey(
  _envelope: KeyEnvelope,
  _label: string,
): Promise<string> {
  throw new Error('eciesUnwrapKey removed in v3 — use hpkeOpenKeyFromState with HpkeEnvelope')
}

/**
 * Encrypt a note payload with per-note forward secrecy.
 * Generates a random AES-256-GCM key, encrypts content, then HPKE-wraps
 * the key for the author and each admin.
 */
export async function encryptNote(
  payloadJson: string,
  authorPubkey: string,
  adminPubkeys: string[],
): Promise<EncryptedNoteResult> {
  // Generate random 32-byte content key
  const keyBytes = crypto.getRandomValues(new Uint8Array(32))
  const keyHex = Array.from(keyBytes, b => b.toString(16).padStart(2, '0')).join('')

  // AES-256-GCM encrypt content
  const encryptedContent = await aesGcmEncrypt(payloadJson, keyHex)

  // HPKE-wrap key for author
  const authorEncPub = await resolveEncryptionPubkey(authorPubkey)
  const authorHpke = await hpkeSealKey(keyHex, authorEncPub, 'llamenos:note-key', '')
  const authorEnvelope: KeyEnvelope = {
    wrappedKey: authorHpke.ct,
    ephemeralPubkey: base64urlToHex(authorHpke.enc),
  }

  // HPKE-wrap key for each admin
  const adminEnvelopes: RecipientEnvelope[] = await Promise.all(
    adminPubkeys.map(async (pubkey) => {
      const encPub = await resolveEncryptionPubkey(pubkey)
      const hpke = await hpkeSealKey(keyHex, encPub, 'llamenos:note-key', '')
      return {
        pubkey,
        wrappedKey: hpke.ct,
        ephemeralPubkey: base64urlToHex(hpke.enc),
      }
    }),
  )

  return { encryptedContent, authorEnvelope, adminEnvelopes }
}

/**
 * Decrypt a note by HPKE-opening the key envelope and AES-GCM decrypting content.
 */
export async function decryptNote(
  encryptedContent: string,
  envelope: KeyEnvelope,
): Promise<string | null> {
  try {
    // Reconstruct HpkeEnvelope from the stored key envelope
    const hpkeEnvelope: HpkeEnvelope = {
      v: 3,
      labelId: 0, // LABEL_NOTE_KEY index
      enc: hexToBase64url(envelope.ephemeralPubkey),
      ct: envelope.wrappedKey,
    }
    const keyHex = await hpkeOpenKeyFromState(hpkeEnvelope, 'llamenos:note-key', '')
    return await aesGcmDecrypt(encryptedContent, keyHex)
  } catch {
    return null
  }
}

/** @deprecated No more legacy note format. */
export async function decryptLegacyNote(
  _packed: string,
): Promise<import('@shared/types').NotePayload | null> {
  return null
}

/**
 * Encrypt a message for multiple readers.
 * Random AES-256-GCM key, HPKE-wrapped per reader.
 */
export async function encryptMessage(
  plaintext: string,
  readerPubkeys: string[],
): Promise<EncryptedMessageResult> {
  const keyBytes = crypto.getRandomValues(new Uint8Array(32))
  const keyHex = Array.from(keyBytes, b => b.toString(16).padStart(2, '0')).join('')

  const encryptedContent = await aesGcmEncrypt(plaintext, keyHex)

  const readerEnvelopes: RecipientEnvelope[] = await Promise.all(
    readerPubkeys.map(async (pubkey) => {
      const encPub = await resolveEncryptionPubkey(pubkey)
      const hpke = await hpkeSealKey(keyHex, encPub, 'llamenos:message', '')
      return {
        pubkey,
        wrappedKey: hpke.ct,
        ephemeralPubkey: base64urlToHex(hpke.enc),
      }
    }),
  )

  return { encryptedContent, readerEnvelopes }
}

/**
 * Decrypt a message by finding our envelope and HPKE-opening the key.
 */
export async function decryptMessage(
  encryptedContent: string,
  readerEnvelopes: RecipientEnvelope[],
): Promise<string | null> {
  const deviceState = await getDevicePubkeys()
  if (!deviceState) return null

  // Find envelope for our pubkey (try signing pubkey match first)
  const myEnvelope = readerEnvelopes.find(e =>
    e.pubkey === deviceState.signingPubkeyHex || e.pubkey === deviceState.encryptionPubkeyHex,
  )
  if (!myEnvelope) return null

  try {
    const hpkeEnvelope: HpkeEnvelope = {
      v: 3,
      labelId: 5, // LABEL_MESSAGE index
      enc: hexToBase64url(myEnvelope.ephemeralPubkey),
      ct: myEnvelope.wrappedKey,
    }
    const keyHex = await hpkeOpenKeyFromState(hpkeEnvelope, 'llamenos:message', '')
    return await aesGcmDecrypt(encryptedContent, keyHex)
  } catch {
    return null
  }
}

/**
 * Decrypt a call record by finding our admin envelope and decrypting.
 * Uses LABEL_CALL_META for key unwrapping (distinct from message label).
 */
export async function decryptCallRecord(
  encryptedContent: string,
  adminEnvelopes: RecipientEnvelope[],
): Promise<{ answeredBy: string | null; callerNumber: string } | null> {
  const deviceState = await getDevicePubkeys()
  if (!deviceState) return null

  const myEnvelope = adminEnvelopes.find(e =>
    e.pubkey === deviceState.signingPubkeyHex || e.pubkey === deviceState.encryptionPubkeyHex,
  )
  if (!myEnvelope) return null

  try {
    const hpkeEnvelope: HpkeEnvelope = {
      v: 3,
      labelId: 6, // LABEL_CALL_META index
      enc: hexToBase64url(myEnvelope.ephemeralPubkey),
      ct: myEnvelope.wrappedKey,
    }
    const keyHex = await hpkeOpenKeyFromState(hpkeEnvelope, 'llamenos:call-meta', '')
    const plaintext = await aesGcmDecrypt(encryptedContent, keyHex)
    return JSON.parse(plaintext)
  } catch {
    return null
  }
}

/** @deprecated Use hpkeOpenFromState instead. */
export async function decryptTranscription(
  _packed: string,
  _ephemeralPubkeyHex: string,
): Promise<string | null> {
  throw new Error('decryptTranscription removed in v3 — use hpkeOpenFromState')
}

/** @deprecated Drafts need v3 migration. */
export async function encryptDraft(_plaintext: string): Promise<string> {
  throw new Error('encryptDraft removed in v3 — needs migration to HPKE')
}

/** @deprecated Drafts need v3 migration. */
export async function decryptDraft(_packed: string): Promise<string | null> {
  return null
}

/** @deprecated Export encryption needs v3 migration. */
export async function encryptExport(_jsonString: string): Promise<string> {
  throw new Error('encryptExport removed in v3 — needs migration to HPKE')
}

/** @deprecated Nostr signing removed in v3. Use ed25519Sign. */
export async function signNostrEvent(
  _kind: number,
  _createdAt: number,
  _tags: string[][],
  _content: string,
): Promise<SignedNostrEvent> {
  throw new Error('signNostrEvent removed in v3 — Nostr replaced with Ed25519/sigchain')
}

/** @deprecated Use hpkeOpenFromState with LABEL_FILE_METADATA. */
export async function decryptFileMetadata(
  _encryptedContentHex: string,
  _ephemeralPubkeyHex: string,
): Promise<string | null> {
  throw new Error('decryptFileMetadata removed in v3 — use hpkeOpenFromState')
}

/** @deprecated Use hpkeOpenKeyFromState with LABEL_FILE_KEY. */
export async function unwrapFileKey(
  _envelope: KeyEnvelope,
): Promise<string> {
  throw new Error('unwrapFileKey removed in v3 — use hpkeOpenKeyFromState with LABEL_FILE_KEY')
}

/** @deprecated Use hpkeOpenKeyFromState with LABEL_HUB_KEY_WRAP. */
export async function unwrapHubKey(
  _envelope: KeyEnvelope,
): Promise<string> {
  throw new Error('unwrapHubKey removed in v3 — use hpkeOpenKeyFromState with LABEL_HUB_KEY_WRAP')
}

/** @deprecated Use hpkeOpenKeyFromState + hpkeSealKey composition. */
export async function rewrapFileKey(
  _encryptedFileKeyHex: string,
  _ephemeralPubkeyHex: string,
  _newRecipientPubkeyHex: string,
): Promise<RecipientEnvelope> {
  throw new Error('rewrapFileKey removed in v3 — compose hpkeOpenKeyFromState + hpkeSealKey')
}

/**
 * Generate an encrypted backup from the current CryptoState.
 * In v3, wraps the device key material for offline recovery.
 */
export async function generateBackupFromState(
  pubkey: string,
  pin: string,
  recoveryKey: string,
): Promise<string> {
  if (useTauri) {
    return tauriInvoke<string>('generate_backup_from_state', { pubkey, pin, recoveryKey })
  }
  throw new Error('WASM backup generation not yet implemented')
}

/**
 * Generate an ephemeral Ed25519 keypair for admin-created users.
 * Returns the hex-encoded signing seed as "nsec" for backward compat with callers.
 * The public key is the Ed25519 signing pubkey hex.
 */
export async function generateEphemeralKeypair(): Promise<EphemeralKeyPair> {
  if (useTauri) {
    // Use the mock/Rust to generate a random Ed25519 seed and derive pubkey
    const result = await tauriInvoke<{ signingPubkeyHex: string; seedHex: string }>('generate_ephemeral_ed25519')
    return { publicKey: result.signingPubkeyHex, npub: '', nsec: result.seedHex }
  }
  throw new Error('WASM ephemeral keypair not yet implemented')
}

/** @deprecated Device provisioning needs v3 migration. */
export interface ProvisioningEncryptResult {
  encryptedHex: string
  sasCode: string
}

/** @deprecated Device provisioning needs v3 migration. */
export interface ProvisioningDecryptResult {
  nsec: string
  sasCode: string
}

/** @deprecated Device provisioning needs v3 migration. */
export async function encryptNsecForProvisioning(
  _ephemeralPubkeyHex: string,
): Promise<ProvisioningEncryptResult> {
  throw new Error('encryptNsecForProvisioning removed in v3')
}

/** @deprecated Device provisioning needs v3 migration. */
export async function generateProvisioningEphemeral(): Promise<string> {
  throw new Error('generateProvisioningEphemeral removed in v3')
}

/** @deprecated Device provisioning needs v3 migration. */
export async function decryptProvisionedNsec(
  _encryptedHex: string,
  _primaryPubkeyHex: string,
): Promise<ProvisioningDecryptResult> {
  throw new Error('decryptProvisionedNsec removed in v3')
}
