/**
 * TypeScript wrapper around the Rust crypto FFI (.so) loaded via bun:ffi.
 *
 * All consumers work with Uint8Array. Buffer marshaling is internal.
 * Error details are read immediately after failure via ffi_last_error().
 */
import { dlopen, FFIType, ptr, read } from 'bun:ffi'
import { resolve } from 'path'

// Resolve library path — configurable via LLAMENOS_CRYPTO_LIB env var
const LIB_PATH = process.env.LLAMENOS_CRYPTO_LIB ??
  resolve(import.meta.dir, 'dist/server/libllamenos_core.so')

const lib = dlopen(LIB_PATH, {
  ffi_last_error: {
    args: [FFIType.ptr, FFIType.u64],
    returns: FFIType.i32,
  },
  ffi_random_bytes: {
    args: [FFIType.ptr, FFIType.u64],
    returns: FFIType.i32,
  },
  ffi_sha256: {
    args: [FFIType.ptr, FFIType.u64, FFIType.ptr, FFIType.u64],
    returns: FFIType.i32,
  },
  ffi_hmac_sha256: {
    args: [FFIType.ptr, FFIType.u64, FFIType.ptr, FFIType.u64, FFIType.ptr, FFIType.u64],
    returns: FFIType.i32,
  },
  ffi_hkdf_sha256: {
    args: [FFIType.ptr, FFIType.u64, FFIType.ptr, FFIType.u64, FFIType.ptr, FFIType.u64, FFIType.ptr, FFIType.u64],
    returns: FFIType.i32,
  },
  ffi_aes256gcm_encrypt: {
    args: [FFIType.ptr, FFIType.u64, FFIType.ptr, FFIType.u64, FFIType.ptr, FFIType.u64, FFIType.ptr, FFIType.u64],
    returns: FFIType.i32,
  },
  ffi_aes256gcm_decrypt: {
    args: [FFIType.ptr, FFIType.u64, FFIType.ptr, FFIType.u64, FFIType.ptr, FFIType.u64, FFIType.ptr, FFIType.u64],
    returns: FFIType.i32,
  },
  ffi_hpke_seal: {
    args: [FFIType.ptr, FFIType.u64, FFIType.ptr, FFIType.u64, FFIType.ptr, FFIType.u64, FFIType.ptr, FFIType.u64, FFIType.ptr, FFIType.u64],
    returns: FFIType.i32,
  },
  ffi_hpke_open: {
    args: [FFIType.ptr, FFIType.u64, FFIType.ptr, FFIType.u64, FFIType.ptr, FFIType.u64, FFIType.ptr, FFIType.u64, FFIType.ptr, FFIType.u64],
    returns: FFIType.i32,
  },
  ffi_ed25519_sign: {
    args: [FFIType.ptr, FFIType.u64, FFIType.ptr, FFIType.u64, FFIType.ptr, FFIType.u64],
    returns: FFIType.i32,
  },
  ffi_ed25519_verify: {
    args: [FFIType.ptr, FFIType.u64, FFIType.ptr, FFIType.u64, FFIType.ptr, FFIType.u64],
    returns: FFIType.i32,
  },
  ffi_ed25519_pubkey_from_seed: {
    args: [FFIType.ptr, FFIType.u64, FFIType.ptr, FFIType.u64],
    returns: FFIType.i32,
  },
})

class CryptoError extends Error {
  constructor(public code: number, message: string) {
    super(message)
    this.name = 'CryptoError'
  }
}

function getLastError(): string {
  const buf = new Uint8Array(512)
  const len = lib.symbols.ffi_last_error(ptr(buf), 512)
  if (len <= 0) return 'unknown error'
  return new TextDecoder().decode(buf.subarray(0, len))
}

function checkResult(code: number): void {
  if (code !== 0) {
    const msg = getLastError()
    throw new CryptoError(code, msg)
  }
}

export function randomBytes(len: number): Uint8Array {
  const out = new Uint8Array(len)
  checkResult(lib.symbols.ffi_random_bytes(ptr(out), len))
  return out
}

export function sha256(data: Uint8Array): Uint8Array {
  const out = new Uint8Array(32)
  checkResult(lib.symbols.ffi_sha256(ptr(data), data.length, ptr(out), 32))
  return out
}

export function hmacSha256(key: Uint8Array, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(32)
  checkResult(lib.symbols.ffi_hmac_sha256(
    ptr(key), key.length,
    ptr(data), data.length,
    ptr(out), 32,
  ))
  return out
}

export function hkdfSha256(ikm: Uint8Array, salt: Uint8Array, info: Uint8Array, len: number): Uint8Array {
  const out = new Uint8Array(len)
  checkResult(lib.symbols.ffi_hkdf_sha256(
    ptr(ikm), ikm.length,
    salt.length > 0 ? ptr(salt) : null, salt.length,
    info.length > 0 ? ptr(info) : null, info.length,
    ptr(out), len,
  ))
  return out
}

export function symmetricEncrypt(key: Uint8Array, plaintext: Uint8Array, aad: Uint8Array): Uint8Array {
  const outLen = 12 + plaintext.length + 16
  const out = new Uint8Array(outLen)
  checkResult(lib.symbols.ffi_aes256gcm_encrypt(
    ptr(key), key.length,
    plaintext.length > 0 ? ptr(plaintext) : null, plaintext.length,
    aad.length > 0 ? ptr(aad) : null, aad.length,
    ptr(out), outLen,
  ))
  return out
}

export function symmetricDecrypt(key: Uint8Array, ciphertext: Uint8Array, aad: Uint8Array): Uint8Array {
  const ptLen = ciphertext.length - 28
  if (ptLen < 0) throw new CryptoError(-5, 'ciphertext too short')
  const out = new Uint8Array(ptLen)
  checkResult(lib.symbols.ffi_aes256gcm_decrypt(
    ptr(key), key.length,
    ptr(ciphertext), ciphertext.length,
    aad.length > 0 ? ptr(aad) : null, aad.length,
    ptr(out), ptLen,
  ))
  return out
}

export function hpkeSeal(recipientPk: Uint8Array, plaintext: Uint8Array, info: Uint8Array, aad: Uint8Array): Uint8Array {
  const outLen = 32 + plaintext.length + 16
  const out = new Uint8Array(outLen)
  checkResult(lib.symbols.ffi_hpke_seal(
    ptr(recipientPk), recipientPk.length,
    plaintext.length > 0 ? ptr(plaintext) : null, plaintext.length,
    info.length > 0 ? ptr(info) : null, info.length,
    aad.length > 0 ? ptr(aad) : null, aad.length,
    ptr(out), outLen,
  ))
  return out
}

export function hpkeOpen(secretKey: Uint8Array, envelope: Uint8Array, info: Uint8Array, aad: Uint8Array): Uint8Array {
  const ptLen = envelope.length - 48
  if (ptLen < 0) throw new CryptoError(-5, 'envelope too short')
  const out = new Uint8Array(ptLen)
  checkResult(lib.symbols.ffi_hpke_open(
    ptr(secretKey), secretKey.length,
    ptr(envelope), envelope.length,
    info.length > 0 ? ptr(info) : null, info.length,
    aad.length > 0 ? ptr(aad) : null, aad.length,
    ptr(out), ptLen,
  ))
  return out
}

export function ed25519Sign(secretKey: Uint8Array, message: Uint8Array): Uint8Array {
  const out = new Uint8Array(64)
  checkResult(lib.symbols.ffi_ed25519_sign(
    ptr(secretKey), secretKey.length,
    ptr(message), message.length,
    ptr(out), 64,
  ))
  return out
}

export function ed25519Verify(pubkey: Uint8Array, message: Uint8Array, signature: Uint8Array): boolean {
  const code = lib.symbols.ffi_ed25519_verify(
    ptr(pubkey), pubkey.length,
    ptr(message), message.length,
    ptr(signature), signature.length,
  )
  if (code === 0) return true
  if (code === -1) return false
  // Other error codes (null pointer, wrong sizes, etc.)
  const msg = getLastError()
  throw new CryptoError(code, msg)
}

export function ed25519PubkeyFromSeed(seed: Uint8Array): Uint8Array {
  const out = new Uint8Array(32)
  checkResult(lib.symbols.ffi_ed25519_pubkey_from_seed(
    ptr(seed), seed.length,
    ptr(out), 32,
  ))
  return out
}
