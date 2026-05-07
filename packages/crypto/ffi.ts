/**
 * Crypto FFI entry point — dispatches to Rust native FFI (Bun) or pure-JS
 * fallback (Node.js / Playwright / bddgen).
 *
 * Bun: loads libllamenos_core.so via bun:ffi for production performance.
 * Node.js: uses @noble/curves + @noble/hashes for test compatibility.
 */

// @ts-ignore — Bun global detection
const isBun = typeof globalThis.Bun !== 'undefined'

const impl = isBun
  ? await import('./ffi-bun.js')
  : await import('./ffi-mock.js')

export const randomBytes = impl.randomBytes
export const sha256 = impl.sha256
export const hmacSha256 = impl.hmacSha256
export const hkdfSha256 = impl.hkdfSha256
export const symmetricEncrypt = impl.symmetricEncrypt
export const symmetricDecrypt = impl.symmetricDecrypt
export const hpkeSeal = impl.hpkeSeal
export const hpkeOpen = impl.hpkeOpen
export const ed25519Sign = impl.ed25519Sign
export const ed25519Verify = impl.ed25519Verify
export const ed25519PubkeyFromSeed = impl.ed25519PubkeyFromSeed
