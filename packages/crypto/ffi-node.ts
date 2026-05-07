/**
 * Pure-TypeScript fallback for @llamenos/crypto/ffi in non-Bun environments.
 *
 * Used by Playwright (bddgen), vitest, and any other Node.js-based tooling
 * that imports code transitively depending on the crypto FFI.
 *
 * Implements the same contract as ffi-bun.ts using @noble/* (devDependencies).
 * HPKE is X25519-HKDF-SHA256-AES256GCM matching the Rust wire format.
 */
import { ed25519 } from '@noble/curves/ed25519.js'
import { x25519 } from '@noble/curves/ed25519.js'
import { hkdf } from '@noble/hashes/hkdf.js'
import { sha256 as sha256Noble } from '@noble/hashes/sha2.js'
import { hmac } from '@noble/hashes/hmac.js'
import { gcm } from '@noble/ciphers/aes.js'
import { concatBytes } from '@noble/hashes/utils.js'

export function randomBytes(len: number): Uint8Array {
  const out = new Uint8Array(len)
  crypto.getRandomValues(out)
  return out
}

export function sha256(data: Uint8Array): Uint8Array {
  return sha256Noble(data)
}

export function hmacSha256(key: Uint8Array, data: Uint8Array): Uint8Array {
  return hmac(sha256Noble, key, data)
}

export function hkdfSha256(ikm: Uint8Array, salt: Uint8Array, info: Uint8Array, len: number): Uint8Array {
  return hkdf(sha256Noble, ikm, salt.length > 0 ? salt : undefined, info.length > 0 ? info : undefined, len)
}

export function ed25519Sign(secretKey: Uint8Array, message: Uint8Array): Uint8Array {
  return ed25519.sign(message, secretKey)
}

export function ed25519Verify(pubkey: Uint8Array, message: Uint8Array, signature: Uint8Array): boolean {
  try {
    return ed25519.verify(signature, message, pubkey)
  } catch {
    return false
  }
}

export function ed25519PubkeyFromSeed(seed: Uint8Array): Uint8Array {
  return ed25519.getPublicKey(seed)
}

// ---------------------------------------------------------------------------
// HPKE Base Mode (X25519-HKDF-SHA256-AES256GCM)
// ---------------------------------------------------------------------------

export function hpkeSeal(recipientPk: Uint8Array, plaintext: Uint8Array, info: Uint8Array, aad: Uint8Array): Uint8Array {
  const ephSecretKey = randomBytes(32)
  const enc = x25519.getPublicKey(ephSecretKey)
  const sharedSecret = x25519.getSharedSecret(ephSecretKey, recipientPk)
  const kem_context = concatBytes(enc, recipientPk)
  const prk = hkdf(sha256Noble, sharedSecret, new Uint8Array(0), kem_context, 32)
  const symmetricKey = hkdf(sha256Noble, prk, new Uint8Array(0), info, 32)
  const nonce = randomBytes(12)
  const cipher = gcm(symmetricKey, nonce, aad)
  const ciphertext = cipher.encrypt(plaintext)
  return concatBytes(enc, nonce, ciphertext)
}

export function hpkeOpen(secretKey: Uint8Array, envelope: Uint8Array, info: Uint8Array, aad: Uint8Array): Uint8Array {
  const enc = envelope.subarray(0, 32)
  const nonce = envelope.subarray(32, 44)
  const ciphertext = envelope.subarray(44)
  const recipientPk = x25519.getPublicKey(secretKey)
  const sharedSecret = x25519.getSharedSecret(secretKey, enc)
  const kem_context = concatBytes(enc, recipientPk)
  const prk = hkdf(sha256Noble, sharedSecret, new Uint8Array(0), kem_context, 32)
  const symmetricKey = hkdf(sha256Noble, prk, new Uint8Array(0), info, 32)
  const cipher = gcm(symmetricKey, nonce, aad)
  return cipher.decrypt(ciphertext)
}

// ---------------------------------------------------------------------------
// Symmetric encryption (AES-256-GCM)
// ---------------------------------------------------------------------------

export function symmetricEncrypt(key: Uint8Array, plaintext: Uint8Array, aad: Uint8Array): Uint8Array {
  const nonce = randomBytes(12)
  const cipher = gcm(key, nonce, aad)
  const ciphertext = cipher.encrypt(plaintext)
  return concatBytes(nonce, ciphertext)
}

export function symmetricDecrypt(key: Uint8Array, data: Uint8Array, aad: Uint8Array): Uint8Array {
  const nonce = data.subarray(0, 12)
  const ciphertext = data.subarray(12)
  const cipher = gcm(key, nonce, aad)
  return cipher.decrypt(ciphertext)
}
