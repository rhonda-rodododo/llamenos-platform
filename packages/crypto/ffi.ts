/**
 * Runtime-dispatched crypto FFI module.
 *
 * In Bun: loads the native Rust .so via bun:ffi (ffi-bun.ts)
 * In Node.js: uses @noble/* pure-JS fallback (ffi-node.ts) for test tooling
 *   (Playwright, bddgen, vitest)
 *
 * Uses top-level await with dynamic import so Node.js never encounters
 * the 'bun:' protocol scheme that its ESM loader cannot resolve.
 */

const mod = typeof Bun !== 'undefined'
  ? await import('./ffi-bun')
  : await import('./ffi-node')

export const randomBytes: (len: number) => Uint8Array = mod.randomBytes
export const sha256: (data: Uint8Array) => Uint8Array = mod.sha256
export const hmacSha256: (key: Uint8Array, data: Uint8Array) => Uint8Array = mod.hmacSha256
export const hkdfSha256: (ikm: Uint8Array, salt: Uint8Array, info: Uint8Array, len: number) => Uint8Array = mod.hkdfSha256
export const symmetricEncrypt: (key: Uint8Array, plaintext: Uint8Array, aad: Uint8Array) => Uint8Array = mod.symmetricEncrypt
export const symmetricDecrypt: (key: Uint8Array, ciphertext: Uint8Array, aad: Uint8Array) => Uint8Array = mod.symmetricDecrypt
export const hpkeSeal: (recipientPk: Uint8Array, plaintext: Uint8Array, info: Uint8Array, aad: Uint8Array) => Uint8Array = mod.hpkeSeal
export const hpkeOpen: (secretKey: Uint8Array, envelope: Uint8Array, info: Uint8Array, aad: Uint8Array) => Uint8Array = mod.hpkeOpen
export const ed25519Sign: (secretKey: Uint8Array, message: Uint8Array) => Uint8Array = mod.ed25519Sign
export const ed25519Verify: (pubkey: Uint8Array, message: Uint8Array, signature: Uint8Array) => boolean = mod.ed25519Verify
export const ed25519PubkeyFromSeed: (seed: Uint8Array) => Uint8Array = mod.ed25519PubkeyFromSeed
