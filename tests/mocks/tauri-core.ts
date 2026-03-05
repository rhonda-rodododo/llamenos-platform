/**
 * Mock @tauri-apps/api/core for Playwright test builds.
 *
 * Replaces Tauri IPC with JS crypto using @noble/curves.
 * Aliased via vite.config.ts when PLAYWRIGHT_TEST=true.
 */

// Production guard: prevent test mocks from loading in production builds.
// The PLAYWRIGHT_TEST env var is set by Vite when building for tests.
if (!import.meta.env.PLAYWRIGHT_TEST) {
  throw new Error('FATAL: Tauri IPC mock loaded outside test environment.')
}

import { schnorr } from '@noble/curves/secp256k1.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'
import { randomBytes, utf8ToBytes } from '@noble/ciphers/utils.js'
import { bech32 } from '@scure/base'

// Must match packages/shared/crypto-labels.ts AUTH_PREFIX
const AUTH_PREFIX = 'llamenos:auth:'

// ── CryptoState ───────────────────────────────────────────────────

let secretKeyHex: string | null = null
let publicKeyHex: string | null = null
let mockProvisioningToken: string | null = null

// PIN lockout tracking (mirrors Rust crypto.rs)
let pinFailedAttempts = 0
let pinLockoutUntil = 0 // epoch ms

function getLockoutDuration(attempts: number): number {
  if (attempts < 5) return 0
  if (attempts < 7) return 30_000
  if (attempts < 9) return 120_000
  if (attempts < 10) return 600_000
  return -1 // wipe
}

function checkLockout(): void {
  if (pinLockoutUntil > Date.now()) {
    const remaining = Math.ceil((pinLockoutUntil - Date.now()) / 1000)
    throw new Error(`Locked out for ${remaining} seconds`)
  }
}

function recordFailedAttempt(): void {
  pinFailedAttempts++
  const duration = getLockoutDuration(pinFailedAttempts)
  if (duration === -1) {
    // Wipe
    secretKeyHex = null
    publicKeyHex = null
    pinFailedAttempts = 0
    pinLockoutUntil = 0
    throw new Error('Keys wiped after too many failed attempts')
  }
  if (duration > 0) {
    pinLockoutUntil = Date.now() + duration
    throw new Error(`Locked out for ${duration / 1000} seconds`)
  }
}

// Store note keys for round-trip encryption/decryption in tests
const noteKeyStore = new Map<string, string>() // encryptedContent → noteKeyHex

function requireUnlocked(): string {
  if (!secretKeyHex) throw new Error('CryptoState is locked')
  return secretKeyHex
}

function pubFromSk(sk: string): string {
  return bytesToHex(schnorr.getPublicKey(hexToBytes(sk)))
}

function nsecEncode(sk: string): string {
  return bech32.encode('nsec', bech32.toWords(hexToBytes(sk)), 1500)
}

function nsecDecode(nsec: string): string {
  const { prefix, words } = bech32.decode(nsec, 1500)
  if (prefix !== 'nsec') throw new Error('Invalid nsec')
  return bytesToHex(bech32.fromWords(words))
}

function npubEncode(pk: string): string {
  return bech32.encode('npub', bech32.toWords(hexToBytes(pk)), 1500)
}

// ── ECIES (simplified for tests) ──────────────────────────────────

function eciesWrap(keyHex: string, recipientPubkey: string, _label: string) {
  const ephSk = bytesToHex(randomBytes(32))
  const ephPk = pubFromSk(ephSk)
  // Simplified: wrap key with XChaCha20 keyed from HKDF-like hash
  const ikm = sha256(hexToBytes(ephSk + recipientPubkey))
  const nonce = randomBytes(24)
  const cipher = xchacha20poly1305(ikm, nonce)
  const ct = cipher.encrypt(hexToBytes(keyHex))
  return {
    wrappedKey: bytesToHex(nonce) + bytesToHex(ct),
    ephemeralPubkey: ephPk,
  }
}

// ── PIN encryption (PBKDF2 + XChaCha20) ───────────────────────────
//
// Uses Web Crypto PBKDF2 (600k iterations) to match the test helper's
// preloadEncryptedKey and the real Rust/Tauri encryption format.
// The encrypted payload is the nsec bech32 string, not raw key bytes.

const PBKDF2_ITERATIONS = 600_000

async function deriveKEK(pin: string, salt: Uint8Array): Promise<Uint8Array> {
  const pinBytes = utf8ToBytes(pin)
  const keyMaterial = await crypto.subtle.importKey('raw', pinBytes, 'PBKDF2', false, ['deriveBits'])
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS },
    keyMaterial,
    256,
  )
  return new Uint8Array(derived)
}

async function pinEncrypt(nsec: string, pin: string, pubkey: string) {
  const sk = nsecDecode(nsec)
  const salt = randomBytes(16)
  const kek = await deriveKEK(pin, salt)
  const nonce = randomBytes(24)
  const cipher = xchacha20poly1305(kek, nonce)
  const ct = cipher.encrypt(utf8ToBytes(nsec))

  // Derive pubkey hash for storage identification
  const hashInput = utf8ToBytes(`llamenos:keyid:${pubkey}`)
  const hashBuf = await crypto.subtle.digest('SHA-256', hashInput)
  const pubkeyHash = bytesToHex(new Uint8Array(hashBuf)).slice(0, 16)

  secretKeyHex = sk
  publicKeyHex = pubkey

  return {
    salt: bytesToHex(salt),
    iterations: PBKDF2_ITERATIONS,
    nonce: bytesToHex(nonce),
    ciphertext: bytesToHex(ct),
    pubkey: pubkeyHash,
  }
}

async function pinDecrypt(
  data: { salt: string; nonce: string; ciphertext: string; pubkey: string },
  pin: string,
): Promise<string> {
  const kek = await deriveKEK(pin, hexToBytes(data.salt))
  const cipher = xchacha20poly1305(kek, hexToBytes(data.nonce))
  const plaintext = cipher.decrypt(hexToBytes(data.ciphertext))
  const nsec = new TextDecoder().decode(plaintext)
  const sk = nsecDecode(nsec)
  secretKeyHex = sk
  publicKeyHex = pubFromSk(sk)
  return publicKeyHex
}

// ── Command Router ────────────────────────────────────────────────

type Args = Record<string, unknown>

const commands: Record<string, (a: Args) => unknown | Promise<unknown>> = {
  generate_keypair: () => {
    const sk = bytesToHex(randomBytes(32))
    const pk = pubFromSk(sk)
    return { secretKeyHex: sk, publicKey: pk, nsec: nsecEncode(sk), npub: npubEncode(pk) }
  },

  get_public_key: (a) => pubFromSk(a.secretKeyHex as string),
  get_public_key_from_state: () => publicKeyHex,

  is_valid_nsec: (a) => {
    try { nsecDecode(a.nsec as string); return true } catch { return false }
  },

  key_pair_from_nsec: (a) => {
    try {
      const sk = nsecDecode(a.nsec as string)
      const pk = pubFromSk(sk)
      return { secretKeyHex: sk, publicKey: pk, nsec: a.nsec, npub: npubEncode(pk) }
    } catch {
      return null
    }
  },

  import_key_to_state: async (a) =>
    pinEncrypt(a.nsec as string, a.pin as string, a.pubkeyHex as string),

  unlock_with_pin: async (a) => {
    checkLockout()
    try {
      const pubkey = await pinDecrypt(
        a.data as { salt: string; nonce: string; ciphertext: string; pubkey: string },
        a.pin as string,
      )
      // Success — reset counter
      pinFailedAttempts = 0
      pinLockoutUntil = 0
      return pubkey
    } catch {
      // Wrong PIN — record failed attempt (may throw lockout/wipe)
      recordFailedAttempt()
      // If recordFailedAttempt didn't throw, return null (wrong PIN, no lockout yet)
      throw new Error('Wrong PIN')
    }
  },

  create_auth_token_from_state: (a) => {
    const sk = requireUnlocked()
    const pk = publicKeyHex!
    const msg = `${AUTH_PREFIX}${pk}:${a.timestamp}:${a.method}:${a.path}`
    const sig = schnorr.sign(sha256(utf8ToBytes(msg)), hexToBytes(sk))
    return JSON.stringify({ pubkey: pk, timestamp: a.timestamp, token: bytesToHex(sig) })
  },

  create_auth_token: (a) => {
    const sk = a.secretKeyHex as string
    const pk = pubFromSk(sk)
    const msg = `${AUTH_PREFIX}${pk}:${a.timestamp}:${a.method}:${a.path}`
    const sig = schnorr.sign(sha256(utf8ToBytes(msg)), hexToBytes(sk))
    return JSON.stringify({ pubkey: pk, timestamp: a.timestamp, token: bytesToHex(sig) })
  },

  verify_schnorr: (a) => {
    try {
      return schnorr.verify(hexToBytes(a.signature as string), sha256(utf8ToBytes(a.message as string)), hexToBytes(a.pubkey as string))
    } catch { return false }
  },

  ecies_wrap_key: (a) =>
    eciesWrap(a.keyHex as string, a.recipientPubkey as string, a.label as string),

  ecies_unwrap_key_from_state: () => bytesToHex(randomBytes(32)),

  encrypt_note: (a) => {
    const noteKey = bytesToHex(randomBytes(32))
    const nonce = randomBytes(24)
    const ct = xchacha20poly1305(hexToBytes(noteKey), nonce).encrypt(utf8ToBytes(a.payloadJson as string))
    const encryptedContent = bytesToHex(nonce) + bytesToHex(ct)
    noteKeyStore.set(encryptedContent, noteKey)
    const authorEnvelope = eciesWrap(noteKey, a.authorPubkey as string, 'llamenos:note:author')
    const adminEnvelopes = (a.adminPubkeys as string[]).map(pk => ({ pubkey: pk, ...eciesWrap(noteKey, pk, 'llamenos:note:admin') }))
    return { encryptedContent, authorEnvelope, adminEnvelopes }
  },

  decrypt_note_from_state: (a) => {
    const ec = a.encryptedContent as string
    const noteKey = noteKeyStore.get(ec)
    if (noteKey) {
      const nonce = hexToBytes(ec.slice(0, 48))
      const ct = hexToBytes(ec.slice(48))
      return new TextDecoder().decode(xchacha20poly1305(hexToBytes(noteKey), nonce).decrypt(ct))
    }
    return '{"text":"mock note","customFields":{}}'
  },
  decrypt_legacy_note_from_state: () => '{"text":"mock note","customFields":{}}',

  encrypt_message: (a) => {
    const key = bytesToHex(randomBytes(32))
    const nonce = randomBytes(24)
    const ct = xchacha20poly1305(hexToBytes(key), nonce).encrypt(utf8ToBytes(a.plaintext as string))
    const encryptedContent = bytesToHex(nonce) + bytesToHex(ct)
    noteKeyStore.set(encryptedContent, key) // reuse store for messages too
    const readerEnvelopes = (a.readerPubkeys as string[]).map(pk => ({ pubkey: pk, ...eciesWrap(key, pk, 'llamenos:message:reader') }))
    return { encryptedContent, readerEnvelopes }
  },

  decrypt_message_from_state: (a) => {
    const ec = a.encryptedContent as string
    const key = noteKeyStore.get(ec)
    if (key) {
      const nonce = hexToBytes(ec.slice(0, 48))
      const ct = hexToBytes(ec.slice(48))
      return new TextDecoder().decode(xchacha20poly1305(hexToBytes(key), nonce).decrypt(ct))
    }
    return 'mock message'
  },
  decrypt_call_record_from_state: () => '{"answeredBy":null,"callerNumber":"+1234567890"}',
  decrypt_transcription_from_state: () => 'mock transcription',
  encrypt_draft_from_state: (a) => btoa(a.plaintext as string),
  decrypt_draft_from_state: (a) => atob(a.packed as string),
  encrypt_export_from_state: (a) => btoa(a.jsonString as string),

  sign_nostr_event_from_state: (a) => {
    const sk = requireUnlocked()
    const pk = publicKeyHex!
    const serialized = JSON.stringify([0, pk, a.createdAt, a.kind, a.tags, a.content])
    const id = bytesToHex(sha256(utf8ToBytes(serialized)))
    const sig = bytesToHex(schnorr.sign(hexToBytes(id), hexToBytes(sk)))
    return { id, pubkey: pk, created_at: a.createdAt, kind: a.kind, tags: a.tags, content: a.content, sig }
  },

  decrypt_file_metadata_from_state: () => '{}',
  unwrap_file_key_from_state: () => bytesToHex(randomBytes(32)),
  unwrap_hub_key_from_state: () => bytesToHex(randomBytes(32)),
  rewrap_file_key_from_state: (a) => ({
    pubkey: a.newRecipientPubkeyHex,
    ...eciesWrap(bytesToHex(randomBytes(32)), a.newRecipientPubkeyHex as string, 'llamenos:file:key'),
  }),

  request_provisioning_token: () => {
    requireUnlocked()
    const token = bytesToHex(randomBytes(16))
    mockProvisioningToken = token
    return token
  },
  get_nsec_from_state: (a) => {
    const token = a.token as string
    if (!mockProvisioningToken || mockProvisioningToken !== token) {
      throw new Error('Invalid or expired provisioning token')
    }
    mockProvisioningToken = null // consume token
    return nsecEncode(requireUnlocked())
  },
  lock_crypto: () => { secretKeyHex = null },
  is_crypto_unlocked: () => secretKeyHex !== null,
  // Test-only: get/set lockout state for PIN lockout step definitions
  get_pin_lockout_state: () => ({
    failedAttempts: pinFailedAttempts,
    lockoutUntil: pinLockoutUntil,
  }),
  set_pin_failed_attempts: (a) => {
    pinFailedAttempts = a.count as number
    pinLockoutUntil = 0
  },
  reset_pin_lockout: () => {
    pinFailedAttempts = 0
    pinLockoutUntil = 0
  },
}

// ── Public API ────────────────────────────────────────────────────

export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const handler = commands[cmd]
  if (!handler) throw new Error(`Unknown Tauri command: ${cmd}`)
  return await handler(args || {}) as T
}

// Expose invoke on window for test helpers (page.evaluate can't use dynamic imports
// because Vite aliases are resolved at build time, not at runtime)
if (typeof window !== 'undefined') {
  (window as Record<string, unknown>).__TEST_INVOKE = invoke
}

export function convertFileSrc(path: string): string { return path }
export function isTauri(): boolean { return false }

export class Resource {
  #rid: number
  get rid() { return this.#rid }
  constructor(rid: number) { this.#rid = rid }
  async close() {}
}

export class Channel<T = unknown> {
  id = 0
  #onmessage: (m: T) => void = () => {}
  set onmessage(h: (m: T) => void) { this.#onmessage = h }
  get onmessage() { return this.#onmessage }
  toJSON() { return `__CHANNEL__:${this.id}` }
}

export class PluginListener {
  constructor(public plugin: string, public event: string, public channelId: number) {}
  async unregister() {}
}

export async function addPluginListener(
  plugin: string, event: string, _cb: (p: unknown) => void,
): Promise<PluginListener> {
  return new PluginListener(plugin, event, 0)
}

export const SERIALIZE_TO_IPC_FN = Symbol('serializeToIpc')
