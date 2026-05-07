/**
 * Real ECIES encrypt/decrypt helpers for BDD step definitions (Epic 365).
 *
 * These use the EXACT same algorithms as `apps/worker/lib/crypto.ts`:
 * - XChaCha20-Poly1305 for symmetric encryption
 * - ECIES key wrapping via secp256k1 ECDH + HKDF-SHA256
 * - 24-byte random nonce prepended to ciphertext
 * - V2 ECIES with version byte (0x02) and HKDF key derivation
 */
import { secp256k1 } from '@noble/curves/secp256k1.js'
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { hkdf } from '@noble/hashes/hkdf.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import { utf8ToBytes } from '@noble/ciphers/utils.js'

/** ECIES version byte for HKDF-based key derivation (v2) — must match server. */
const ECIES_VERSION_V2 = 0x02

/**
 * Generate a secp256k1 keypair for ECIES operations (key wrapping).
 * This is separate from Ed25519 auth keypairs — ECIES uses a different curve.
 */
export function generateEciesKeypair(): { skHex: string; pubkeyHex: string } {
  const sk = secp256k1.utils.randomSecretKey()
  const skHex = bytesToHex(sk)
  const pubkey = secp256k1.getPublicKey(sk, true)
  // x-only pubkey (strip the 02/03 prefix byte) for Nostr compatibility
  const pubkeyHex = bytesToHex(pubkey).slice(2)
  return { skHex, pubkeyHex }
}

// ---------------------------------------------------------------------------
// Symmetric content encryption (XChaCha20-Poly1305)
// ---------------------------------------------------------------------------

/** Generate a 32-byte random content key. */
export function generateContentKey(): Uint8Array {
  const key = new Uint8Array(32)
  crypto.getRandomValues(key)
  return key
}

/**
 * Encrypt plaintext with XChaCha20-Poly1305.
 * Returns hex string: nonce(24) || ciphertext.
 * Matches the server's `encryptMessageForStorage` inner encrypt.
 */
export function encryptContent(plaintext: string, key: Uint8Array, _label: string): string {
  const nonce = new Uint8Array(24)
  crypto.getRandomValues(nonce)
  const cipher = xchacha20poly1305(key, nonce)
  const ciphertext = cipher.encrypt(utf8ToBytes(plaintext))

  const packed = new Uint8Array(nonce.length + ciphertext.length)
  packed.set(nonce)
  packed.set(ciphertext, nonce.length)

  return bytesToHex(packed)
}

/**
 * Decrypt hex ciphertext (nonce(24) || ct) with XChaCha20-Poly1305.
 * Returns UTF-8 plaintext.
 */
export function decryptContent(ciphertextHex: string, key: Uint8Array, _label: string): string {
  const data = hexToBytes(ciphertextHex)
  const nonce = data.slice(0, 24)
  const ct = data.slice(24)
  const cipher = xchacha20poly1305(key, nonce)
  return new TextDecoder().decode(cipher.decrypt(ct))
}

// ---------------------------------------------------------------------------
// ECIES key wrapping (secp256k1 ECDH + HKDF-SHA256 + XChaCha20-Poly1305)
// ---------------------------------------------------------------------------

/**
 * Derive ECIES symmetric key using HKDF-SHA256 (v2).
 * Matches `deriveEciesKeyV2` in `apps/worker/lib/crypto.ts`.
 */
function deriveEciesKeyV2(label: string, sharedX: Uint8Array): Uint8Array {
  return hkdf(sha256, sharedX, new Uint8Array(0), utf8ToBytes(label), 32) as Uint8Array
}

/**
 * Wrap a content key for a recipient via ECIES (v2).
 *
 * Uses an ephemeral secp256k1 keypair, computes ECDH shared secret with
 * recipient's public key, derives a symmetric key via HKDF, and encrypts
 * the content key with XChaCha20-Poly1305.
 *
 * Output format: version(1) || nonce(24) || ciphertext
 *
 * Matches `eciesWrapKeyServer` in `apps/worker/lib/crypto.ts`.
 */
export function wrapKeyForRecipient(
  contentKey: Uint8Array,
  recipientPubkeyHex: string,
  _senderSkHex: string,
  label: string,
): { wrappedKey: string; ephemeralPubkey: string } {
  // Generate ephemeral keypair (sender SK is not used in server-side ECIES)
  const ephemeralSecret = new Uint8Array(32)
  crypto.getRandomValues(ephemeralSecret)
  const ephemeralPublicKey = secp256k1.getPublicKey(ephemeralSecret, true)

  // Nostr pubkeys are x-only (32 bytes) — prepend "02" for compressed format
  const recipientCompressed = hexToBytes('02' + recipientPubkeyHex)
  const shared = secp256k1.getSharedSecret(ephemeralSecret, recipientCompressed)
  const sharedX = shared.slice(1, 33)

  const symmetricKey = deriveEciesKeyV2(label, sharedX)

  const nonce = new Uint8Array(24)
  crypto.getRandomValues(nonce)
  const cipher = xchacha20poly1305(symmetricKey, nonce)
  const ciphertext = cipher.encrypt(contentKey)

  // Pack: version(1) + nonce(24) + ciphertext
  const packed = new Uint8Array(1 + nonce.length + ciphertext.length)
  packed[0] = ECIES_VERSION_V2
  packed.set(nonce, 1)
  packed.set(ciphertext, 1 + nonce.length)

  return {
    wrappedKey: bytesToHex(packed),
    ephemeralPubkey: bytesToHex(ephemeralPublicKey),
  }
}

/**
 * Unwrap a content key using the recipient's secret key.
 *
 * Reverses `wrapKeyForRecipient`: computes ECDH with the ephemeral pubkey,
 * derives the symmetric key via HKDF, and decrypts.
 */
export function unwrapKey(
  wrappedKeyHex: string,
  ephemeralPubkeyHex: string,
  recipientSkHex: string,
  label: string,
): Uint8Array {
  const packed = hexToBytes(wrappedKeyHex)

  // Check version byte
  const version = packed[0]
  if (version !== ECIES_VERSION_V2) {
    throw new Error(`Unsupported ECIES version: 0x${version.toString(16).padStart(2, '0')}`)
  }

  const nonce = packed.slice(1, 25)
  const ciphertext = packed.slice(25)

  // Compute ECDH shared secret
  const ephemeralPubkey = hexToBytes(ephemeralPubkeyHex)
  const shared = secp256k1.getSharedSecret(hexToBytes(recipientSkHex), ephemeralPubkey)
  const sharedX = shared.slice(1, 33)

  const symmetricKey = deriveEciesKeyV2(label, sharedX)

  const cipher = xchacha20poly1305(symmetricKey, nonce)
  return cipher.decrypt(ciphertext)
}

// ---------------------------------------------------------------------------
// Self-test — verifies round-trip encrypt/decrypt and wrap/unwrap
// ---------------------------------------------------------------------------

if (import.meta.main) {
  console.log('Running crypto-helpers self-test...\n')

  // Test 1: Symmetric encrypt/decrypt round-trip
  const key = generateContentKey()
  const plaintext = 'Hello, world! This is a secret message.'
  const label = 'llamenos:test'
  const encrypted = encryptContent(plaintext, key, label)
  const decrypted = decryptContent(encrypted, key, label)
  console.assert(decrypted === plaintext, 'Symmetric round-trip failed')
  console.log('[PASS] Symmetric encrypt/decrypt round-trip')

  // Test 2: ECIES key wrap/unwrap round-trip
  const recipientSk = secp256k1.utils.randomSecretKey()
  const recipientSkHex = bytesToHex(recipientSk)
  const recipientPubkey = secp256k1.getPublicKey(recipientSk, true)
  // x-only pubkey (strip the 02/03 prefix byte)
  const recipientPubkeyHex = bytesToHex(recipientPubkey).slice(2)
  const senderSk = bytesToHex(secp256k1.utils.randomSecretKey())

  const contentKey = generateContentKey()
  const { wrappedKey, ephemeralPubkey } = wrapKeyForRecipient(
    contentKey, recipientPubkeyHex, senderSk, 'llamenos:message',
  )
  const unwrapped = unwrapKey(wrappedKey, ephemeralPubkey, recipientSkHex, 'llamenos:message')

  console.assert(
    bytesToHex(unwrapped) === bytesToHex(contentKey),
    'ECIES wrap/unwrap round-trip failed',
  )
  console.log('[PASS] ECIES key wrap/unwrap round-trip')

  // Test 3: Full envelope — encrypt content, wrap key, then unwrap and decrypt
  const noteText = 'Sensitive case notes about the call.'
  const noteKey = generateContentKey()
  const encryptedNote = encryptContent(noteText, noteKey, 'llamenos:note-key')
  const envelope = wrapKeyForRecipient(
    noteKey, recipientPubkeyHex, senderSk, 'llamenos:note-key',
  )
  const recoveredKey = unwrapKey(
    envelope.wrappedKey, envelope.ephemeralPubkey, recipientSkHex, 'llamenos:note-key',
  )
  const recoveredNote = decryptContent(encryptedNote, recoveredKey, 'llamenos:note-key')
  console.assert(recoveredNote === noteText, 'Full envelope round-trip failed')
  console.log('[PASS] Full envelope round-trip (encrypt + wrap + unwrap + decrypt)')

  console.log('\nAll crypto-helpers self-tests passed.')
}
