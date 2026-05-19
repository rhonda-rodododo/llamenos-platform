/**
 * Mock @tauri-apps/api/core for Playwright test builds (v3 crypto API).
 *
 * Implements Ed25519/X25519/HPKE mock operations using @noble/curves
 * and @noble/hashes for test-mode crypto that mirrors the Rust desktop IPC.
 *
 * Aliased via vite.config.ts when PLAYWRIGHT_TEST=true.
 */

// Production guard: prevent test mocks from loading in production builds.
if (!import.meta.env.PLAYWRIGHT_TEST) {
  throw new Error('FATAL: Tauri IPC mock loaded outside test environment.')
}

import { ed25519 } from '@noble/curves/ed25519.js'
import { x25519 } from '@noble/curves/ed25519.js'
import { schnorr } from '@noble/curves/secp256k1.js'
import { hkdf } from '@noble/hashes/hkdf.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { hmac } from '@noble/hashes/hmac.js'
import { gcm } from '@noble/ciphers/aes.js'
import { randomBytes } from '@noble/hashes/utils.js'
import { argon2id } from '@noble/hashes/argon2.js'
import { utf8ToBytes, bytesToHex, hexToBytes } from '@noble/hashes/utils.js'

// ── Helpers ──────────────────────────────────────────────────────────

function base64urlEncode(bytes: Uint8Array): string {
  const b64 = btoa(String.fromCharCode(...bytes))
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64urlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice(0, (4 - (str.length % 4)) % 4)
  const binary = atob(padded)
  return Uint8Array.from(binary, c => c.charCodeAt(0))
}

// ── Label registry (matches Rust labels.rs) ─────────────────────────

// Labels must match packages/protocol/crypto-labels.json exactly.
// Index order matches LABEL_REGISTRY in packages/crypto/src/labels.rs.
const LABEL_MAP: Record<string, number> = {
  'llamenos:note-key': 0,
  'llamenos:file-key': 1,
  'llamenos:file-metadata': 2,
  'llamenos:hub-key-wrap': 3,
  'llamenos:transcription': 4,
  'llamenos:message': 5,
  'llamenos:call-meta': 6,
  'llamenos:shift-schedule': 7,
  'llamenos:puk:sign:v1': 41,
  'llamenos:puk:dh:v1': 42,
  'llamenos:puk:secretbox:v1': 43,
  'llamenos:puk:wrap:device:v1': 44,
  'llamenos:device-auth:v1': 46,
  'llamenos:sframe-call-secret:v1': 50,
  'llamenos:sframe-base-key:v1': 51,
  'llamenos:mls-provision:v1': 52,
  'llamenos:recovery-group:share-wrap:v1': 60,
  'llamenos:recovery-group:puk-seed-wrap:v1': 61,
  'llamenos:recovery-group:share-contribute:v1': 62,
  'llamenos:recovery-group:liveness-proof:v1': 63,
  'llamenos:sas-derive:v1': 80,
}

function labelToId(label: string): number {
  const id = LABEL_MAP[label]
  if (id === undefined) throw new Error(`Unknown label: ${label}`)
  return id
}

// ── Mock device key state ───────────────────────────────────────────

interface MockDeviceSecrets {
  signingSeed: Uint8Array    // 32 bytes
  encryptionSeed: Uint8Array // 32 bytes
}

interface MockDeviceKeyState {
  deviceId: string
  signingPubkeyHex: string
  encryptionPubkeyHex: string
}

let mockSecrets: MockDeviceSecrets | null = null
let mockDeviceState: MockDeviceKeyState | null = null
let mockEncryptedKeys: unknown = null

// Key type tracking for auth token generation
type KeyType = 'ed25519' | 'secp256k1'
let currentKeyType: KeyType = 'ed25519'
let schnorrSecretBytes: Uint8Array | null = null // secp256k1 secret for Schnorr auth

// ── Hub key mock state ───────────────────────────────────────────────
let mockHubKey: Uint8Array | null = null

// ── Recovery group key mock state ───────────────────────────────────
let mockRecoveryGroupKey: Uint8Array | null = null

// ── PIN lockout tracking ─────────────────────────────────────────────
// Mirrors Rust-side lockout logic: escalating lockouts at thresholds, wipe at 10.
// Persisted to localStorage to survive page reloads (simulates Rust-side vault storage).
interface PinLockoutState {
  failedAttempts: number
  lockoutUntil: number // ms timestamp, 0 = no lockout
}

const LOCKOUT_STORAGE_KEY = '__test_pin_lockout_state'

function loadLockoutState(): PinLockoutState {
  try {
    const raw = localStorage.getItem(LOCKOUT_STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return { failedAttempts: 0, lockoutUntil: 0 }
}

function saveLockoutState(): void {
  try {
    localStorage.setItem(LOCKOUT_STORAGE_KEY, JSON.stringify(pinLockoutState))
  } catch { /* ignore */ }
}

let pinLockoutState: PinLockoutState = loadLockoutState()

// Lockout thresholds: attempt count → lockout duration in ms
const LOCKOUT_THRESHOLDS: Array<{ attempts: number; durationMs: number }> = [
  { attempts: 5, durationMs: 30_000 },    // 30 seconds
  { attempts: 7, durationMs: 120_000 },   // 2 minutes
  { attempts: 9, durationMs: 600_000 },   // 10 minutes
]
const WIPE_THRESHOLD = 10

function checkPinLockout(): void {
  // Reload from storage (state may have been set before a page reload)
  pinLockoutState = loadLockoutState()
  if (pinLockoutState.lockoutUntil > Date.now()) {
    const remainingSec = Math.ceil((pinLockoutState.lockoutUntil - Date.now()) / 1000)
    throw new Error(`Locked out for ${remainingSec} seconds`)
  }
}

function recordFailedPinAttempt(): void {
  pinLockoutState.failedAttempts++

  if (pinLockoutState.failedAttempts >= WIPE_THRESHOLD) {
    // Wipe keys
    mockSecrets = null
    mockDeviceState = null
    mockEncryptedKeys = null
    pinLockoutState = { failedAttempts: 0, lockoutUntil: 0 }
    saveLockoutState()
    throw new Error('Keys wiped after too many failed attempts')
  }

  // Find the highest threshold that applies (tiered lockout)
  let lockoutDuration = 0
  for (const threshold of LOCKOUT_THRESHOLDS) {
    if (pinLockoutState.failedAttempts >= threshold.attempts) {
      lockoutDuration = threshold.durationMs
    }
  }

  if (lockoutDuration > 0) {
    pinLockoutState.lockoutUntil = Date.now() + lockoutDuration
    saveLockoutState()
    const remainingSec = Math.ceil(lockoutDuration / 1000)
    throw new Error(`Locked out for ${remainingSec} seconds`)
  }

  saveLockoutState()
}

function resetPinLockout(): void {
  pinLockoutState = { failedAttempts: 0, lockoutUntil: 0 }
  saveLockoutState()
}

function deriveEd25519Pubkey(seed: Uint8Array): Uint8Array {
  return ed25519.getPublicKey(seed)
}

function deriveX25519Pubkey(seed: Uint8Array): Uint8Array {
  return x25519.getPublicKey(seed)
}

function requireSecrets(): MockDeviceSecrets {
  if (!mockSecrets) throw new Error('Device key is locked. Enter PIN to unlock.')
  return mockSecrets
}

function requireDeviceState(): MockDeviceKeyState {
  if (!mockDeviceState) throw new Error('Device key is locked. Enter PIN to unlock.')
  return mockDeviceState
}

// ── Argon2id + AES-256-GCM for PIN/passphrase encryption ────────────
// Parameters match packages/crypto/src/device_keys.rs (KDF_VERSION=2).
// For test builds we use reduced memory (4 MiB) to keep Playwright fast.
// This is safe because the mock never interops with Rust ciphertext.
const ARGON2_M_COST_KIB = 4_096   // 4 MiB (production Rust uses 65_536)
const ARGON2_T_COST = 3
const ARGON2_P_COST = 4

async function deriveKek(pin: string, salt: Uint8Array): Promise<Uint8Array> {
  return argon2id(utf8ToBytes(pin), salt, {
    t: ARGON2_T_COST,
    m: ARGON2_M_COST_KIB,
    p: ARGON2_P_COST,
    dkLen: 32,
  })
}

async function encryptWithPin(
  signingSeed: Uint8Array,
  encryptionSeed: Uint8Array,
  pin: string,
): Promise<{
  kdfVersion: number; salt: string; nonce: string; ciphertext: string
  argon2MCost: number; argon2TCost: number; argon2PCost: number
}> {
  const salt = randomBytes(32)
  const nonce = randomBytes(12)
  const kek = await deriveKek(pin, salt)

  const plaintext = new Uint8Array(64)
  plaintext.set(signingSeed)
  plaintext.set(encryptionSeed, 32)

  const cipher = gcm(kek, nonce)
  const encrypted = cipher.encrypt(plaintext)

  return {
    kdfVersion: 2,
    salt: bytesToHex(salt),
    nonce: bytesToHex(nonce),
    ciphertext: bytesToHex(encrypted),
    argon2MCost: ARGON2_M_COST_KIB,
    argon2TCost: ARGON2_T_COST,
    argon2PCost: ARGON2_P_COST,
  }
}

async function decryptWithPin(
  encrypted: { salt: string; nonce: string; ciphertext: string },
  pin: string,
): Promise<{ signingSeed: Uint8Array; encryptionSeed: Uint8Array }> {
  const salt = hexToBytes(encrypted.salt)
  const nonce = hexToBytes(encrypted.nonce)
  const ciphertext = hexToBytes(encrypted.ciphertext)
  const kek = await deriveKek(pin, salt)

  const cipher = gcm(kek, nonce)
  const plaintext = cipher.decrypt(ciphertext)

  if (plaintext.length !== 64) throw new Error('Invalid decrypted device key blob')

  return {
    signingSeed: plaintext.slice(0, 32),
    encryptionSeed: plaintext.slice(32),
  }
}

// ── HPKE mock (X25519 + HKDF-SHA256 + AES-256-GCM) ─────────────────

function hpkeSealMock(
  plaintext: Uint8Array,
  recipientPubkeyHex: string,
  label: string,
  aad: Uint8Array,
): { v: number; labelId: number; enc: string; ct: string } {
  const labelId = labelToId(label)

  // Generate ephemeral X25519 keypair
  const ephSeed = randomBytes(32)
  const ephPub = x25519.getPublicKey(ephSeed)
  const recipientPub = hexToBytes(recipientPubkeyHex)

  // ECDH shared secret
  const sharedSecret = x25519.getSharedSecret(ephSeed, recipientPub)

  // HKDF extract + expand
  const info = utf8ToBytes(`hpke-v3:${label}`)
  const derived = hkdf(sha256, sharedSecret, new Uint8Array(0), info, 44)

  const aesKey = derived.slice(0, 32)
  const nonce = derived.slice(32, 44)

  // AES-256-GCM encrypt with AAD
  const cipher = gcm(aesKey, nonce, aad)
  const ct = cipher.encrypt(plaintext)

  return {
    v: 3,
    labelId,
    enc: base64urlEncode(ephPub),
    ct: base64urlEncode(ct),
  }
}

function hpkeOpenMock(
  envelope: { v: number; labelId: number; enc: string; ct: string },
  recipientSecretHex: string,
  expectedLabel: string,
  aad: Uint8Array,
): Uint8Array {
  if (envelope.v !== 3) throw new Error(`Unsupported HPKE version: ${envelope.v}`)
  const expectedId = labelToId(expectedLabel)
  if (envelope.labelId !== expectedId) {
    throw new Error(`Label mismatch: expected ${expectedId}, got ${envelope.labelId}`)
  }

  const ephPub = base64urlDecode(envelope.enc)
  const ct = base64urlDecode(envelope.ct)
  const recipientSecret = hexToBytes(recipientSecretHex)

  // ECDH shared secret
  const sharedSecret = x25519.getSharedSecret(recipientSecret, ephPub)

  // HKDF extract + expand
  const info = utf8ToBytes(`hpke-v3:${expectedLabel}`)
  const derived = hkdf(sha256, sharedSecret, new Uint8Array(0), info, 44)

  const aesKey = derived.slice(0, 32)
  const nonce = derived.slice(32, 44)

  // AES-256-GCM decrypt with AAD
  const cipher = gcm(aesKey, nonce, aad)
  return cipher.decrypt(ct)
}

// ── GF(2^8) helpers for Shamir SSS mock ──────────────────────────────

function gf256Mul(a: number, b: number): number {
  let result = 0
  let aa = a
  let bb = b
  for (let i = 0; i < 8; i++) {
    if (bb & 1) result ^= aa
    const carry = aa & 0x80
    aa = (aa << 1) & 0xff
    if (carry) aa ^= 0x1b // irreducible polynomial x^8 + x^4 + x^3 + x + 1
    bb >>= 1
  }
  return result
}

function gf256Inv(a: number): number {
  if (a === 0) throw new Error('Cannot invert zero in GF(256)')
  // a^254 = a^(-1) in GF(2^8) by Fermat's little theorem
  let result = a
  for (let i = 0; i < 6; i++) {
    result = gf256Mul(result, result)
    result = gf256Mul(result, a)
  }
  result = gf256Mul(result, result)
  return result
}

// ── Types ─────────────────────────────────────────────────────────────

type Args = Record<string, unknown>
type CommandHandler = (a: Args) => unknown | Promise<unknown>

// ── Command handlers ──────────────────────────────────────────────────

const commands: Record<string, CommandHandler> = {
  // --- Device key management ---

  device_generate_and_load: async (a) => {
    const pin = a.pin as string
    const deviceId = a.deviceId as string

    const signingSeed = randomBytes(32)
    const encryptionSeed = randomBytes(32)
    const signingPubkey = deriveEd25519Pubkey(signingSeed)
    const encryptionPubkey = deriveX25519Pubkey(encryptionSeed)

    const state: MockDeviceKeyState = {
      deviceId,
      signingPubkeyHex: bytesToHex(signingPubkey),
      encryptionPubkeyHex: bytesToHex(encryptionPubkey),
    }

    const encrypted = await encryptWithPin(signingSeed, encryptionSeed, pin)

    const result = { ...encrypted, state, _keyType: 'ed25519' as string }
    mockSecrets = { signingSeed, encryptionSeed }
    mockDeviceState = state
    mockEncryptedKeys = result
    currentKeyType = 'ed25519'
    schnorrSecretBytes = null

    return result
  },

  unlock_with_pin: async (a) => {
    const data = (mockEncryptedKeys ?? a.data) as {
      salt: string; nonce: string; ciphertext: string; state: MockDeviceKeyState; _keyType?: string
    }
    if (!data) throw new Error('No key stored. Complete onboarding first.')

    // Check lockout before attempting
    checkPinLockout()

    const pin = a.pin as string
    let signingSeed: Uint8Array
    let encryptionSeed: Uint8Array

    try {
      const result = await decryptWithPin(data, pin)
      signingSeed = result.signingSeed
      encryptionSeed = result.encryptionSeed
    } catch {
      // Wrong PIN — record failed attempt (may throw lockout/wipe)
      recordFailedPinAttempt()
      // If recordFailedPinAttempt didn't throw, it's a simple wrong PIN
      throw new Error('Wrong PIN')
    }

    // Success — reset lockout counter
    resetPinLockout()

    mockSecrets = { signingSeed, encryptionSeed }
    mockDeviceState = data.state

    // Restore key type for auth token generation
    if (data._keyType === 'secp256k1') {
      currentKeyType = 'secp256k1'
      schnorrSecretBytes = signingSeed
    } else {
      currentKeyType = 'ed25519'
      schnorrSecretBytes = null
    }

    return data.state
  },

  lock_crypto: () => {
    mockSecrets = null
    mockDeviceState = null
  },

  is_crypto_unlocked: () => mockSecrets !== null,

  get_device_pubkeys: () => {
    return requireDeviceState()
  },

  // --- Auth tokens (Ed25519) ---

  create_auth_token_from_state: (a) => {
    const timestamp = a.timestamp as number
    const method = a.method as string
    const path = a.path as string

    if (currentKeyType === 'secp256k1' && schnorrSecretBytes) {
      // Schnorr auth (secp256k1) for legacy nsec import
      const pubkey = bytesToHex(schnorr.getPublicKey(schnorrSecretBytes))
      const msgStr = `llamenos:auth:${pubkey}:${timestamp}:${method}:${path}`
      const msgHash = sha256(utf8ToBytes(msgStr))
      const sig = schnorr.sign(msgHash, schnorrSecretBytes)
      return JSON.stringify({ pubkey, timestamp, token: bytesToHex(sig) })
    }

    // Ed25519 auth (v3 device keys) — must match Rust build_auth_message() exactly:
    // Format: "llamenos:device-auth:v1:{pubkey}:{timestamp}:{method}:{path}"
    // Sign raw UTF-8 bytes (no SHA-256 pre-hash — Ed25519 internally uses SHA-512)
    const secrets = requireSecrets()
    const pubkey = bytesToHex(deriveEd25519Pubkey(secrets.signingSeed))
    const msgStr = `llamenos:device-auth:v1:${pubkey}:${timestamp}:${method}:${path}`
    const sig = ed25519.sign(utf8ToBytes(msgStr), secrets.signingSeed)
    return JSON.stringify({ pubkey, timestamp, token: bytesToHex(sig) })
  },

  // --- Ed25519 signing/verification ---

  ed25519_sign_from_state: (a) => {
    const secrets = requireSecrets()
    const message = hexToBytes(a.messageHex as string)
    const sig = ed25519.sign(message, secrets.signingSeed)
    return bytesToHex(sig)
  },

  ed25519_verify: (a) => {
    try {
      const message = hexToBytes(a.messageHex as string)
      const signature = hexToBytes(a.signatureHex as string)
      const pubkey = hexToBytes(a.pubkeyHex as string)
      return ed25519.verify(signature, message, pubkey)
    } catch {
      return false
    }
  },

  // --- HPKE envelope encryption ---

  hpke_seal: (a) => {
    const plaintext = hexToBytes(a.plaintextHex as string)
    const recipientPubkeyHex = a.recipientPubkeyHex as string
    const label = a.label as string
    const aad = hexToBytes(a.aadHex as string)
    return hpkeSealMock(plaintext, recipientPubkeyHex, label, aad)
  },

  hpke_open_from_state: (a) => {
    const secrets = requireSecrets()
    const envelope = a.envelope as { v: number; labelId: number; enc: string; ct: string }
    const expectedLabel = a.expectedLabel as string
    const aad = hexToBytes(a.aadHex as string)
    const secretHex = bytesToHex(secrets.encryptionSeed)
    const plaintext = hpkeOpenMock(envelope, secretHex, expectedLabel, aad)
    return bytesToHex(plaintext)
  },

  hpke_seal_key: (a) => {
    const keyBytes = hexToBytes(a.keyHex as string)
    if (keyBytes.length !== 32) throw new Error('Key must be 32 bytes')
    const recipientPubkeyHex = a.recipientPubkeyHex as string
    const label = a.label as string
    const aad = hexToBytes(a.aadHex as string)
    return hpkeSealMock(keyBytes, recipientPubkeyHex, label, aad)
  },

  hpke_open_key_from_state: (a) => {
    const secrets = requireSecrets()
    const envelope = a.envelope as { v: number; labelId: number; enc: string; ct: string }
    const expectedLabel = a.expectedLabel as string
    const aad = hexToBytes(a.aadHex as string)
    const secretHex = bytesToHex(secrets.encryptionSeed)
    const plaintext = hpkeOpenMock(envelope, secretHex, expectedLabel, aad)
    if (plaintext.length !== 32) throw new Error('Unwrapped key must be 32 bytes')
    return bytesToHex(plaintext)
  },

  // --- PUK (Per-User Key) ---

  puk_create_from_state: () => {
    const ds = requireDeviceState()

    // Generate random seed
    const seed = randomBytes(32)

    // Derive PUK subkeys (labels match crypto-labels.json)
    const signSubkey = hmac(sha256, seed, utf8ToBytes('llamenos:puk:sign:v1\x00\x00\x00\x01'))
    const dhSubkey = hmac(sha256, seed, utf8ToBytes('llamenos:puk:dh:v1\x00\x00\x00\x01'))

    const pukState = {
      generation: 1,
      signPubkeyHex: bytesToHex(deriveEd25519Pubkey(signSubkey)),
      dhPubkeyHex: bytesToHex(deriveX25519Pubkey(dhSubkey)),
    }

    // HPKE seal the seed to the device's encryption pubkey
    const envelope = hpkeSealMock(
      seed,
      ds.encryptionPubkeyHex,
      'llamenos:puk:wrap:device:v1',
      new Uint8Array(0),
    )

    return {
      pukState,
      seedHex: bytesToHex(seed),
      envelope,
    }
  },

  puk_rotate: (a) => {
    const oldSeedBytes = hexToBytes(a.oldSeedHex as string)
    const oldGen = a.oldGen as number
    const remainingDevices = JSON.parse(a.remainingDevicesJson as string) as Array<[string, string]>
    const newGen = oldGen + 1

    // Generate new seed
    const newSeed = randomBytes(32)

    // Derive new PUK subkeys
    const genBuf = new Uint8Array(4)
    new DataView(genBuf.buffer).setUint32(0, newGen, false) // big-endian

    const signLabel = new Uint8Array([...utf8ToBytes('llamenos:puk:sign:v1'), ...genBuf])
    const dhLabel = new Uint8Array([...utf8ToBytes('llamenos:puk:dh:v1'), ...genBuf])

    const signSubkey = hmac(sha256, newSeed, signLabel)
    const dhSubkey = hmac(sha256, newSeed, dhLabel)

    const state = {
      generation: newGen,
      signPubkeyHex: bytesToHex(deriveEd25519Pubkey(signSubkey)),
      dhPubkeyHex: bytesToHex(deriveX25519Pubkey(dhSubkey)),
    }

    // HPKE seal new seed to each remaining device
    const deviceEnvelopes = remainingDevices.map(([deviceId, encPubkeyHex]) => ({
      deviceId,
      envelope: hpkeSealMock(
        newSeed,
        encPubkeyHex,
        'llamenos:puk:wrap:device:v1',
        new Uint8Array(0),
      ),
    }))

    // CLKR: encrypt old seed under new generation's secretbox key
    const sbLabel = new Uint8Array([...utf8ToBytes('llamenos:puk:secretbox:v1'), ...genBuf])
    const secretboxKey = hmac(sha256, newSeed, sbLabel)
    const clkrNonce = randomBytes(12)
    const clkrCipher = gcm(secretboxKey, clkrNonce)
    const clkrCt = clkrCipher.encrypt(oldSeedBytes)

    const clkrChainLinkHex = bytesToHex(new Uint8Array([...clkrNonce, ...clkrCt]))

    return { state, deviceEnvelopes, clkrChainLinkHex }
  },

  puk_unwrap_seed_from_state: (a) => {
    const secrets = requireSecrets()
    const envelope = a.envelope as { v: number; labelId: number; enc: string; ct: string }
    const expectedLabel = a.expectedLabel as string
    const aad = hexToBytes(a.aadHex as string)
    const secretHex = bytesToHex(secrets.encryptionSeed)
    const seed = hpkeOpenMock(envelope, secretHex, expectedLabel, aad)
    if (seed.length !== 32) throw new Error('PUK seed must be 32 bytes')
    return bytesToHex(seed)
  },

  // --- Sigchain ---

  sigchain_create_link_from_state: (a) => {
    const secrets = requireSecrets()
    const ds = requireDeviceState()
    const id = a.id as string
    const seq = a.seq as number
    const prevHash = a.prevHash as string | null
    const timestamp = a.timestamp as string
    const payloadJson = a.payloadJson as string

    // Canonical hash: JSON with sorted keys
    const canonical: Record<string, unknown> = {
      payload: payloadJson,
      prevHash: prevHash ?? null,
      seq,
      signerDeviceId: ds.deviceId,
      signerPubkey: ds.signingPubkeyHex,
      timestamp,
    }
    const canonicalJson = JSON.stringify(canonical, Object.keys(canonical).sort())
    const entryHash = bytesToHex(sha256(utf8ToBytes(canonicalJson)))

    // Ed25519 sign the entry hash
    const sig = ed25519.sign(hexToBytes(entryHash), secrets.signingSeed)

    return {
      id,
      seq,
      prevHash: prevHash ?? null,
      entryHash,
      signerDeviceId: ds.deviceId,
      signerPubkey: ds.signingPubkeyHex,
      signature: bytesToHex(sig),
      timestamp,
      payloadJson,
    }
  },

  sigchain_verify: (a) => {
    const links = JSON.parse(a.linksJson as string) as Array<{
      seq: number
      prevHash: string | null
      entryHash: string
      signerDeviceId: string
      signerPubkey: string
      signature: string
      timestamp: string
      payloadJson: string
    }>

    if (links.length === 0) throw new Error('Empty sigchain')

    const activeDevicePubkeys = new Set<string>()

    for (let i = 0; i < links.length; i++) {
      const link = links[i]
      if (link.seq !== i + 1) throw new Error(`Sequence mismatch at index ${i}`)

      if (i === 0 && link.prevHash !== null) throw new Error('First link must have null prevHash')
      if (i > 0 && link.prevHash !== links[i - 1].entryHash) {
        throw new Error(`prevHash mismatch at seq ${link.seq}`)
      }

      // Verify Ed25519 signature
      const valid = ed25519.verify(
        hexToBytes(link.signature),
        hexToBytes(link.entryHash),
        hexToBytes(link.signerPubkey),
      )
      if (!valid) throw new Error(`Invalid signature at seq ${link.seq}`)

      // Process payload for device set
      try {
        const payload = JSON.parse(link.payloadJson)
        if (payload.type === 'user_init' || payload.type === 'device_add') {
          activeDevicePubkeys.add(payload.devicePubkey ?? link.signerPubkey)
        } else if (payload.type === 'device_remove') {
          activeDevicePubkeys.delete(payload.devicePubkey)
        }
      } catch { /* non-device payloads */ }
    }

    const last = links[links.length - 1]
    return {
      verifiedCount: links.length,
      headSeq: last.seq,
      headHash: last.entryHash,
      activeDevicePubkeys: Array.from(activeDevicePubkeys),
    }
  },

  sigchain_verify_link: (a) => {
    try {
      const link = JSON.parse(a.linkJson as string) as {
        entryHash: string; signature: string
      }
      const expectedPubkey = a.expectedSignerPubkey as string
      return ed25519.verify(
        hexToBytes(link.signature),
        hexToBytes(link.entryHash),
        hexToBytes(expectedPubkey),
      )
    } catch {
      return false
    }
  },

  // --- SFrame key derivation ---

  sframe_derive_key: (a) => {
    const exporterSecret = hexToBytes(a.exporterSecretHex as string)
    const callId = a.callId as string
    const participantIndex = a.participantIndex as number

    // derive_sframe_key: exporter → base_key → send_key
    const baseKey = hkdf(sha256, exporterSecret, new Uint8Array(0),
      utf8ToBytes(`llamenos:sframe-base-key:v1:${callId}`), 32)

    const indexBuf = new Uint8Array(4)
    new DataView(indexBuf.buffer).setUint32(0, participantIndex, false)
    const sendKey = hkdf(sha256, baseKey, new Uint8Array(0), indexBuf, 32)

    return bytesToHex(sendKey)
  },

  // --- Device import (known Ed25519 seed) ---

  device_import_and_load: async (a) => {
    const signingSecretHex = a.signingSecretHex as string
    const pin = a.pin as string
    const deviceId = a.deviceId as string

    const signingSeed = hexToBytes(signingSecretHex)
    // Derive encryption seed from signing seed via HKDF (matches Rust)
    const encryptionSeed = hkdf(sha256, signingSeed, new Uint8Array(0),
      utf8ToBytes('llamenos:device-encryption-seed:v1'), 32)

    const signingPubkey = deriveEd25519Pubkey(signingSeed)
    const encryptionPubkey = deriveX25519Pubkey(encryptionSeed)

    const state: MockDeviceKeyState = {
      deviceId,
      signingPubkeyHex: bytesToHex(signingPubkey),
      encryptionPubkeyHex: bytesToHex(encryptionPubkey),
    }

    const encrypted = await encryptWithPin(signingSeed, encryptionSeed, pin)
    const result = { ...encrypted, state, _keyType: 'ed25519' as string }

    mockSecrets = { signingSeed, encryptionSeed }
    mockDeviceState = state
    mockEncryptedKeys = result
    currentKeyType = 'ed25519'
    schnorrSecretBytes = null

    return result
  },

  // --- Legacy nsec import (secp256k1 secret for Schnorr auth) ---

  legacy_import_nsec: async (a) => {
    const nsecHex = a.nsecHex as string
    const pin = a.pin as string
    const deviceId = a.deviceId as string

    const secretBytes = hexToBytes(nsecHex)
    const xOnlyPubkey = schnorr.getPublicKey(secretBytes)

    // For secp256k1 legacy keys, we store the secret as "signingSeed"
    // and derive a dummy encryption seed (not used for HPKE in legacy mode)
    const encryptionSeed = hkdf(sha256, secretBytes, new Uint8Array(0),
      utf8ToBytes('llamenos:legacy-encryption-seed:v1'), 32)
    const encryptionPubkey = deriveX25519Pubkey(encryptionSeed)

    const state: MockDeviceKeyState = {
      deviceId,
      signingPubkeyHex: bytesToHex(xOnlyPubkey),
      encryptionPubkeyHex: bytesToHex(encryptionPubkey),
    }

    const encrypted = await encryptWithPin(secretBytes, encryptionSeed, pin)
    const result = { ...encrypted, state, _keyType: 'secp256k1' as string }

    mockSecrets = { signingSeed: secretBytes, encryptionSeed }
    mockDeviceState = state
    mockEncryptedKeys = result
    currentKeyType = 'secp256k1'
    schnorrSecretBytes = secretBytes

    return result
  },

  // --- Ephemeral Ed25519 keypair (for admin-created users) ---

  generate_ephemeral_ed25519: () => {
    const seed = randomBytes(32)
    const pubkey = deriveEd25519Pubkey(seed)
    return {
      signingPubkeyHex: bytesToHex(pubkey),
      seedHex: bytesToHex(seed),
    }
  },

  // --- Backup generation ---

  generate_backup_from_state: (_a) => {
    const secrets = requireSecrets()
    const state = requireDeviceState()
    // Return a mock backup JSON — real Rust would encrypt with recovery key
    return JSON.stringify({
      v: 3,
      deviceId: state.deviceId,
      signingPubkeyHex: state.signingPubkeyHex,
      encryptionPubkeyHex: state.encryptionPubkeyHex,
      encryptedPayload: bytesToHex(secrets.signingSeed), // Mock: not actually encrypted
    })
  },

  // --- Shamir secret sharing (GF(2^8)) ---

  shamir_split: (a) => {
    const secretHex = a.secretHex as string
    const total = a.total as number
    const threshold = a.threshold as number

    if (threshold < 2 || threshold > 5) throw new Error('Threshold must be 2-5')
    if (total < 3 || total > 5) throw new Error('Total must be 3-5')
    if (threshold > total) throw new Error('Threshold cannot exceed total')

    const secret = hexToBytes(secretHex)

    // Random polynomial coefficients (degree threshold-1, constant = secret)
    const coefficients: Uint8Array[] = []
    for (let c = 0; c < threshold - 1; c++) {
      coefficients.push(randomBytes(secret.length))
    }

    const shares: Array<{ x: number; y: string }> = []
    for (let i = 1; i <= total; i++) {
      const y = new Uint8Array(secret.length)
      for (let byteIdx = 0; byteIdx < secret.length; byteIdx++) {
        let val = secret[byteIdx]
        let xPow = i
        for (const coeff of coefficients) {
          val ^= gf256Mul(coeff[byteIdx], xPow)
          xPow = gf256Mul(xPow, i)
        }
        y[byteIdx] = val
      }
      shares.push({ x: i, y: bytesToHex(y) })
    }

    const commitments = shares.map(s => {
      const data = new Uint8Array([s.x, ...hexToBytes(s.y)])
      return bytesToHex(sha256(data))
    })

    return { shares, commitments }
  },

  shamir_combine: (a) => {
    const shareObjs = JSON.parse(a.sharesJson as string) as Array<{ x: number; y: string }>
    if (shareObjs.length < 2) throw new Error('Need at least 2 shares')

    const shares = shareObjs.map(s => ({ x: s.x, y: hexToBytes(s.y) }))
    const secretLen = shares[0].y.length
    const result = new Uint8Array(secretLen)

    for (let byteIdx = 0; byteIdx < secretLen; byteIdx++) {
      let val = 0
      for (let i = 0; i < shares.length; i++) {
        let lagrange = 1
        for (let j = 0; j < shares.length; j++) {
          if (i === j) continue
          const xi = shares[i].x
          const xj = shares[j].x
          const den = xi ^ xj
          if (den === 0) throw new Error('Duplicate share x values')
          lagrange = gf256Mul(lagrange, gf256Mul(xj, gf256Inv(den)))
        }
        val ^= gf256Mul(shares[i].y[byteIdx], lagrange)
      }
      result[byteIdx] = val
    }

    return bytesToHex(result)
  },

  shamir_commit: (a) => {
    const x = a.x as number
    const yHex = a.yHex as string
    const data = new Uint8Array([x, ...hexToBytes(yHex)])
    return bytesToHex(sha256(data))
  },

  shamir_verify: (a) => {
    const x = a.x as number
    const yHex = a.yHex as string
    const commitmentHex = a.commitmentHex as string
    const data = new Uint8Array([x, ...hexToBytes(yHex)])
    return bytesToHex(sha256(data)) === commitmentHex
  },

  recovery_group_generate_keypair: () => {
    const privateKey = randomBytes(32)
    const publicKey = x25519.getPublicKey(privateKey)
    return {
      publicKeyHex: bytesToHex(publicKey),
      privateKeyHex: bytesToHex(privateKey),
    }
  },

  // H16: Recovery group key isolation — create with immediate Shamir split
  recovery_group_create: (a) => {
    const total = a.total as number
    const threshold = a.threshold as number

    if (threshold < 2 || threshold > 5) throw new Error('Threshold must be 2-5')
    if (total < 3 || total > 5) throw new Error('Total must be 3-5')
    if (threshold > total) throw new Error('Threshold cannot exceed total')

    const privateKey = randomBytes(32)
    const publicKey = x25519.getPublicKey(privateKey)
    const secretHex = bytesToHex(privateKey)

    // Split immediately — private key never returned to JS
    const splitResult = commands.shamir_split({ secretHex, total, threshold }) as {
      shares: Array<{ x: number; y: string }>
      commitments: string[]
    }

    return {
      publicKeyHex: bytesToHex(publicKey),
      shares: splitResult.shares,
      commitments: splitResult.commitments,
    }
  },

  // H16: Reconstruct recovery group key from HPKE-encrypted share envelopes
  recovery_group_reconstruct_from_shares: (a) => {
    const envelopes = JSON.parse(a.envelopesJson as string) as Array<{
      envelope: { v: number; labelId: number; enc: string; ct: string }
    }>
    const label = a.label as string

    if (envelopes.length < 2) throw new Error('Need at least 2 share envelopes')

    const secrets = requireSecrets()
    const secretHex = bytesToHex(secrets.encryptionSeed)

    // Decrypt each envelope to get share bytes
    const shareObjs: Array<{ x: number; y: string }> = []
    for (const env of envelopes) {
      const plaintext = hpkeOpenMock(env.envelope, secretHex, label, new Uint8Array(0))
      const x = plaintext[0]
      const yHex = bytesToHex(plaintext.slice(1))
      shareObjs.push({ x, y: yHex })
    }

    // Combine via Shamir
    const recoveredHex = commands.shamir_combine({
      sharesJson: JSON.stringify(shareObjs),
    }) as string

    // Store in mock state (key never enters JS in real Tauri)
    mockRecoveryGroupKey = hexToBytes(recoveredHex)

    return { success: true }
  },

  // H16: Decrypt using stored recovery group key (one-shot, zeroized after)
  recovery_group_decrypt: (a) => {
    if (!mockRecoveryGroupKey) {
      throw new Error('No recovery group key loaded. Reconstruct from shares first.')
    }
    const ciphertextHex = a.ciphertextHex as string
    const label = a.label as string

    const envelope = JSON.parse(ciphertextHex) as { v: number; labelId: number; enc: string; ct: string }
    const secretHex = bytesToHex(mockRecoveryGroupKey)

    const plaintext = hpkeOpenMock(envelope, secretHex, label, new Uint8Array(0))

    // Zeroize after use
    mockRecoveryGroupKey = null

    return bytesToHex(plaintext)
  },

  // H17: Wipe all keys and vault
  wipe_keys: () => {
    mockSecrets = null
    mockDeviceState = null
    mockEncryptedKeys = null
    mockHubKey = null
    mockRecoveryGroupKey = null
    schnorrSecretBytes = null
    // In test mode, also clear lockout state
    resetPinLockout()
  },

  // --- SAS emoji verification ---

  derive_sas: (a) => {
    const pubkeyAHex = a.pubkeyAHex as string
    const pubkeyBHex = a.pubkeyBHex as string
    const nonceHex = a.nonceHex as string

    const pkA = hexToBytes(pubkeyAHex)
    const pkB = hexToBytes(pubkeyBHex)
    const nonceBuf = hexToBytes(nonceHex)

    if (pkA.length !== 32) throw new Error(`pubkey_a must be 32 bytes, got ${pkA.length}`)
    if (pkB.length !== 32) throw new Error(`pubkey_b must be 32 bytes, got ${pkB.length}`)
    if (nonceBuf.length !== 32) throw new Error(`nonce must be 32 bytes, got ${nonceBuf.length}`)

    // Canonical ordering: min first (matches Rust)
    let first: Uint8Array, second: Uint8Array
    let aFirst = true
    for (let i = 0; i < 32; i++) {
      if (pkA[i] < pkB[i]) { aFirst = true; break }
      if (pkA[i] > pkB[i]) { aFirst = false; break }
    }
    first = aFirst ? pkA : pkB
    second = aFirst ? pkB : pkA

    // Input key material: min_pubkey || max_pubkey || nonce
    const ikm = new Uint8Array(96)
    ikm.set(first, 0)
    ikm.set(second, 32)
    ikm.set(nonceBuf, 64)

    // HKDF-SHA256: extract then expand with LABEL_SAS_DERIVE
    const output = hkdf(sha256, ikm, new Uint8Array(0), utf8ToBytes('llamenos:sas-derive:v1'), 6)

    // Extract seven 6-bit values from 48 bits
    const bits = (BigInt(output[0]) << 40n) | (BigInt(output[1]) << 32n) |
      (BigInt(output[2]) << 24n) | (BigInt(output[3]) << 16n) |
      (BigInt(output[4]) << 8n) | BigInt(output[5])

    const indices: number[] = []
    for (let i = 0; i < 7; i++) {
      indices.push(Number((bits >> BigInt(42 - 6 * i)) & 0x3Fn))
    }

    const SAS_EMOJI_TABLE = [
      '\u{1F436}', '\u{1F431}', '\u{1F434}', '\u{1F437}',
      '\u{1F430}', '\u{1F43B}', '\u{1F42F}', '\u{1F428}',
      '\u{1F43C}', '\u{1F981}', '\u{1F984}', '\u{1F422}',
      '\u{1F420}', '\u{1F419}', '\u{1F98B}', '\u{1F33B}',
      '\u{1F332}', '\u{1F335}', '\u{1F344}', '\u{1F30D}',
      '\u{1F319}', '\u{2B50}',  '\u{26A1}',  '\u{1F525}',
      '\u{1F4A7}', '\u{2744}\u{FE0F}', '\u{1F308}', '\u{2600}\u{FE0F}',
      '\u{2601}\u{FE0F}', '\u{1F30A}', '\u{1F3D4}\u{FE0F}', '\u{1F3DD}\u{FE0F}',
      '\u{1F680}', '\u{2708}\u{FE0F}', '\u{1F6A2}', '\u{1F3E0}',
      '\u{1F3F0}', '\u{1F3A8}', '\u{1F3B5}', '\u{1F3B2}',
      '\u{1F3C6}', '\u{1F48E}', '\u{1F511}', '\u{1F6E1}\u{FE0F}',
      '\u{2764}\u{FE0F}', '\u{1F31F}', '\u{1F3AF}', '\u{1F52E}',
      '\u{1F9E9}', '\u{1F3C0}', '\u{26BD}',  '\u{1F3B3}',
      '\u{1F40C}', '\u{1F98A}', '\u{1F427}', '\u{1F989}',
      '\u{1F99C}', '\u{1F982}', '\u{1F980}', '\u{1F41D}',
      '\u{1F33F}', '\u{1F34E}', '\u{1F352}', '\u{1F349}',
    ]

    const emojis = indices.map(i => SAS_EMOJI_TABLE[i] ?? '\u{2753}')

    return { indices, emojis }
  },

  // --- Test-only commands (PIN lockout seeding) ---

  set_pin_failed_attempts: (a) => {
    const count = a.count as number
    pinLockoutState.failedAttempts = count
    // Never set lockout timer from seeding — the step "I have N failed attempts"
    // means N attempts were made and any lockout has already expired.
    // The next wrong PIN will trigger the appropriate lockout/wipe.
    pinLockoutState.lockoutUntil = 0
    saveLockoutState()
  },

  get_pin_lockout_state: () => {
    // Reload from storage in case of page reload
    pinLockoutState = loadLockoutState()
    return { failedAttempts: pinLockoutState.failedAttempts, lockoutUntil: pinLockoutState.lockoutUntil }
  },

  reset_pin_lockout: () => {
    resetPinLockout()
  },

  expire_pin_lockout: () => {
    pinLockoutState.lockoutUntil = 0
    saveLockoutState()
  },

  // --- Hub key management ---

  set_hub_key: (a) => {
    const hubKeyHex = a.hubKeyHex as string
    mockHubKey = hexToBytes(hubKeyHex)
  },

  encrypt_hub_field: (a) => {
    if (!mockHubKey) throw new Error('Hub key not loaded')
    const plaintext = a.plaintext as string
    const label = a.label as string
    const nonce = randomBytes(12)
    const aad = utf8ToBytes(label)
    const cipher = gcm(mockHubKey, nonce, aad)
    const ciphertext = cipher.encrypt(utf8ToBytes(plaintext))
    const packed = new Uint8Array(12 + ciphertext.length)
    packed.set(nonce)
    packed.set(ciphertext, 12)
    return bytesToHex(packed)
  },

  decrypt_hub_field: (a) => {
    if (!mockHubKey) throw new Error('Hub key not loaded')
    const ciphertextHex = a.ciphertextHex as string
    const label = a.label as string
    const data = hexToBytes(ciphertextHex)
    if (data.length < 28) throw new Error('Ciphertext too short')
    const nonce = data.slice(0, 12)
    const ciphertext = data.slice(12)
    const aad = utf8ToBytes(label)
    const cipher = gcm(mockHubKey, nonce, aad)
    const plaintext = cipher.decrypt(ciphertext)
    return new TextDecoder().decode(plaintext)
  },
}

// ── Public API ────────────────────────────────────────────────────────

export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const handler = commands[cmd]
  if (!handler) throw new Error(`Unknown Tauri command: ${cmd}`)
  return await handler(args || {}) as T
}

// Expose invoke on window using a Symbol key (not a guessable string).
export const __TEST_INVOKE_SYMBOL = Symbol.for('llamenos_test_invoke')

if (typeof window !== 'undefined' && import.meta.env.PLAYWRIGHT_TEST) {
  (window as Record<symbol, unknown>)[__TEST_INVOKE_SYMBOL] = invoke
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
