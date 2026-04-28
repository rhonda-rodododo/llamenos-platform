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

// ── PBKDF2 + AES-256-GCM for PIN encryption ────────────────────────

async function deriveKek(pin: string, salt: Uint8Array): Promise<Uint8Array> {
  // Use WebCrypto PBKDF2 (faster than pure JS for 600K iterations)
  const pinKey = await crypto.subtle.importKey(
    'raw', utf8ToBytes(pin), 'PBKDF2', false, ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 600_000, hash: 'SHA-256' },
    pinKey,
    256,
  )
  return new Uint8Array(bits)
}

async function encryptWithPin(
  signingSeed: Uint8Array,
  encryptionSeed: Uint8Array,
  pin: string,
): Promise<{ salt: string; iterations: number; nonce: string; ciphertext: string }> {
  const salt = randomBytes(32)
  const nonce = randomBytes(12)
  const kek = await deriveKek(pin, salt)

  const plaintext = new Uint8Array(64)
  plaintext.set(signingSeed)
  plaintext.set(encryptionSeed, 32)

  const cipher = gcm(kek, nonce)
  const encrypted = cipher.encrypt(plaintext)

  return {
    salt: bytesToHex(salt),
    iterations: 600_000,
    nonce: bytesToHex(nonce),
    ciphertext: bytesToHex(encrypted),
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

    const pin = a.pin as string
    const { signingSeed, encryptionSeed } = await decryptWithPin(data, pin)

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

    // Ed25519 auth (v3 device keys)
    const secrets = requireSecrets()
    const pubkey = bytesToHex(deriveEd25519Pubkey(secrets.signingSeed))
    const msgStr = `llamenos:auth:${pubkey}:${timestamp}:${method}:${path}`
    const msgHash = sha256(utf8ToBytes(msgStr))
    const sig = ed25519.sign(msgHash, secrets.signingSeed)
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
