/**
 * Pure-TypeScript test mock for @llamenos/crypto/ffi.
 *
 * The real ffi.ts uses bun:ffi to call the Rust native library (.so),
 * which is unavailable in the Vitest (Node) environment. This mock
 * re-implements the same contract using @noble/curves and @noble/hashes
 * so unit tests can import any code that transitively imports auth.ts
 * or server-identity.ts without loading the native library.
 */
import { ed25519 } from '@noble/curves/ed25519.js'
import { hkdf } from '@noble/hashes/hkdf.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { hmac } from '@noble/hashes/hmac.js'

export function randomBytes(len: number): Uint8Array {
  const out = new Uint8Array(len)
  crypto.getRandomValues(out)
  return out
}

export function sha256Hash(data: Uint8Array): Uint8Array {
  return sha256(data)
}

export function hmacSha256(key: Uint8Array, data: Uint8Array): Uint8Array {
  return hmac(sha256, key, data)
}

export function hkdfSha256(ikm: Uint8Array, salt: Uint8Array, info: Uint8Array, len: number): Uint8Array {
  return hkdf(sha256, ikm, salt.length > 0 ? salt : undefined, info.length > 0 ? info : undefined, len)
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

// Stub for HPKE operations — not needed in unit tests
export function hpkeSeal(_recipientPk: Uint8Array, _plaintext: Uint8Array, _info: Uint8Array, _aad: Uint8Array): Uint8Array {
  throw new Error('hpkeSeal not available in unit test mock')
}

export function hpkeOpen(_secretKey: Uint8Array, _envelope: Uint8Array, _info: Uint8Array, _aad: Uint8Array): Uint8Array {
  throw new Error('hpkeOpen not available in unit test mock')
}

export function symmetricEncrypt(_key: Uint8Array, _plaintext: Uint8Array, _aad: Uint8Array): Uint8Array {
  throw new Error('symmetricEncrypt not available in unit test mock')
}

export function symmetricDecrypt(_key: Uint8Array, _ciphertext: Uint8Array, _aad: Uint8Array): Uint8Array {
  throw new Error('symmetricDecrypt not available in unit test mock')
}
