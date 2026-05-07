# Rust FFI Server Crypto Bridge

**Date:** 2026-05-05
**Status:** Draft
**Depends on:** Nothing (foundation layer)
**Depended on by:** All other specs in this series

## Context

Llamenos currently uses three separate JavaScript crypto libraries (`@noble/curves`, `@noble/ciphers`, `@noble/hashes`) for server-side cryptographic operations in the Bun backend. The shared Rust crypto crate (`packages/crypto`) already compiles to native (Tauri desktop), XCFramework (iOS UniFFI), and JNI `.so` (Android). This spec adds a server build target: a Linux `cdylib` loaded by the Bun server via `bun:ffi`.

**Goal:** One Rust crate, one audit surface. Every cryptographic operation on every platform — desktop, iOS, Android, server, browser — executes the same Rust code. Zero JS crypto dependencies in production.

## Architecture

### Build Target

`packages/crypto/Cargo.toml` gains a `cdylib` crate-type (alongside existing `staticlib` + `lib`) gated behind a `server` feature flag:

```toml
[lib]
crate-type = ["lib", "staticlib", "cdylib"]

[features]
server = []          # Enables C ABI exports for bun:ffi
mobile = ["uniffi"]  # Existing UniFFI for iOS/Android
```

**Note:** `cdylib` in the default crate-type list means it always builds. If this causes issues for desktop/mobile builds (e.g., linker warnings), gate it via a build script that only emits the cdylib when `--features server` is active. Alternatively, use a separate `[[example]]` or workspace member for the cdylib target. Evaluate during implementation.

Build command: `cargo build --release --features server` produces `target/release/libllamenoscore.so`.

New script: `bun run crypto:build:server` wraps this and copies the `.so` to `packages/crypto/dist/server/libllamenoscore.so`.

### C ABI Surface

All functions use `#[no_mangle] extern "C"` with simple pointer+length arguments. No heap allocation across the FFI boundary. Caller allocates output buffers, Rust writes into them.

**Safety contract (MANDATORY for every FFI function):**
1. **Null pointer check:** If any pointer argument is null, return `-3` immediately
2. **Buffer size validation:** If `out_len < required_output_size`, return `-2` immediately (never write past buffer)
3. **Input size limit:** Reject inputs > 100 MiB (`-4`) to prevent DoS
4. **Use `std::slice::from_raw_parts()`** with validated lengths, never raw pointer arithmetic
5. **Zero sensitive stack data:** Use `zeroize` crate for any local copies of key material

**Required output buffer sizes:**
- `ffi_sha256`: 32 bytes
- `ffi_hmac_sha256`: 32 bytes
- `ffi_hkdf_sha256`: caller-specified `out_len`
- `ffi_aes256gcm_encrypt`: 12 (nonce) + `pt_len` + 16 (tag)
- `ffi_aes256gcm_decrypt`: `ct_len` - 12 (nonce) - 16 (tag)
- `ffi_hpke_seal`: 32 (enc) + `pt_len` + 16 (tag)
- `ffi_hpke_open`: `env_len` - 32 (enc) - 16 (tag)
- `ffi_ed25519_sign`: 64 bytes
- `ffi_ed25519_pubkey_from_seed`: 32 bytes
- `ffi_random_bytes`: caller-specified `len`

**Error codes:**
- `0` — success
- `-1` — cryptographic error (decryption failed, signature invalid, etc.)
- `-2` — output buffer too small
- `-3` — null pointer
- `-4` — input too large
- `-5` — invalid input (wrong key length, malformed data)

**Error details:** Each function writes error details to a thread-local buffer retrievable via `ffi_last_error()`. **IMPORTANT:** The TypeScript wrapper MUST read the error immediately after a failing FFI call, before any subsequent FFI call (which would overwrite the thread-local). The wrapper enforces this by reading `ffi_last_error()` synchronously in the same microtask as the failing call.

```rust
// packages/crypto/src/ffi.rs

#[cfg(feature = "server")]

#[no_mangle]
pub extern "C" fn ffi_random_bytes(out: *mut u8, len: usize) -> i32;

#[no_mangle]
pub extern "C" fn ffi_sha256(
    data: *const u8, data_len: usize,
    out: *mut u8, out_len: usize,  // must be 32
) -> i32;

#[no_mangle]
pub extern "C" fn ffi_hmac_sha256(
    key: *const u8, key_len: usize,
    data: *const u8, data_len: usize,
    out: *mut u8, out_len: usize,  // must be 32
) -> i32;

#[no_mangle]
pub extern "C" fn ffi_hkdf_sha256(
    ikm: *const u8, ikm_len: usize,
    salt: *const u8, salt_len: usize,
    info: *const u8, info_len: usize,
    out: *mut u8, out_len: usize,
) -> i32;

#[no_mangle]
pub extern "C" fn ffi_aes256gcm_encrypt(
    key: *const u8, key_len: usize,       // 32 bytes
    plaintext: *const u8, pt_len: usize,
    aad: *const u8, aad_len: usize,
    out: *mut u8, out_len: usize,          // nonce(12) + ciphertext + tag(16)
) -> i32;

#[no_mangle]
pub extern "C" fn ffi_aes256gcm_decrypt(
    key: *const u8, key_len: usize,
    ciphertext: *const u8, ct_len: usize,  // nonce(12) + ciphertext + tag(16)
    aad: *const u8, aad_len: usize,
    out: *mut u8, out_len: usize,
) -> i32;

#[no_mangle]
pub extern "C" fn ffi_hpke_seal(
    recipient_pk: *const u8, pk_len: usize,  // 32-byte X25519
    plaintext: *const u8, pt_len: usize,
    info: *const u8, info_len: usize,
    aad: *const u8, aad_len: usize,
    out: *mut u8, out_len: usize,            // enc(32) + ciphertext + tag(16)
) -> i32;

#[no_mangle]
pub extern "C" fn ffi_hpke_open(
    secret_key: *const u8, sk_len: usize,    // 32-byte X25519
    envelope: *const u8, env_len: usize,     // enc(32) + ciphertext + tag(16)
    info: *const u8, info_len: usize,
    aad: *const u8, aad_len: usize,
    out: *mut u8, out_len: usize,
) -> i32;

#[no_mangle]
pub extern "C" fn ffi_ed25519_sign(
    secret_key: *const u8, sk_len: usize,    // 32-byte seed
    message: *const u8, msg_len: usize,
    out: *mut u8, out_len: usize,            // 64-byte signature
) -> i32;

#[no_mangle]
pub extern "C" fn ffi_ed25519_verify(
    pubkey: *const u8, pk_len: usize,        // 32 bytes
    message: *const u8, msg_len: usize,
    signature: *const u8, sig_len: usize,    // 64 bytes
) -> i32;  // 0 = valid, -1 = invalid

#[no_mangle]
pub extern "C" fn ffi_ed25519_pubkey_from_seed(
    seed: *const u8, seed_len: usize,        // 32 bytes
    out: *mut u8, out_len: usize,            // 32-byte public key
) -> i32;

#[no_mangle]
pub extern "C" fn ffi_last_error(
    out: *mut u8, out_len: usize,
) -> i32;  // returns bytes written, 0 if no error
```

### TypeScript Wrapper

`packages/crypto/ffi.ts` loads the shared library and provides typed functions:

```typescript
import { dlopen, FFIType, ptr, toBuffer } from 'bun:ffi'

const lib = dlopen('packages/crypto/dist/server/libllamenoscore.so', {
  ffi_sha256: { args: [FFIType.ptr, FFIType.u64, FFIType.ptr, FFIType.u64], returns: FFIType.i32 },
  // ... all functions
})

export function sha256(data: Uint8Array): Uint8Array { ... }
export function hmacSha256(key: Uint8Array, data: Uint8Array): Uint8Array { ... }
export function hkdfSha256(ikm: Uint8Array, salt: Uint8Array, info: Uint8Array, len: number): Uint8Array { ... }
export function symmetricEncrypt(key: Uint8Array, plaintext: Uint8Array, aad: Uint8Array): Uint8Array { ... }
export function symmetricDecrypt(key: Uint8Array, ciphertext: Uint8Array, aad: Uint8Array): Uint8Array { ... }
export function hpkeSeal(recipientPk: Uint8Array, plaintext: Uint8Array, info: Uint8Array, aad: Uint8Array): Uint8Array { ... }
export function hpkeOpen(secretKey: Uint8Array, envelope: Uint8Array, info: Uint8Array, aad: Uint8Array): Uint8Array { ... }
export function ed25519Sign(secretKey: Uint8Array, message: Uint8Array): Uint8Array { ... }
export function ed25519Verify(pubkey: Uint8Array, message: Uint8Array, signature: Uint8Array): boolean { ... }
export function ed25519PubkeyFromSeed(seed: Uint8Array): Uint8Array { ... }
export function randomBytes(len: number): Uint8Array { ... }
```

Buffer marshaling is internal to this module. All consumers work with `Uint8Array`.

### Encoding Utilities

Hex/bytes/utf8 conversion utilities currently imported from `@noble/hashes/utils` and `@noble/ciphers/utils` move to `packages/shared/encoding.ts`. Pure TypeScript, no crypto, ~30 lines:

```typescript
export function hexToBytes(hex: string): Uint8Array { ... }
export function bytesToHex(bytes: Uint8Array): string { ... }
export function utf8ToBytes(str: string): Uint8Array { ... }
export function bytesToUtf8(bytes: Uint8Array): string { ... }
```

## AEAD Standardization

The entire codebase standardizes on **AES-256-GCM** as the single AEAD cipher:
- HPKE uses AES-256-GCM internally (RFC 9180 AEAD ID 0x0002)
- Server-side symmetric encryption uses AES-256-GCM (replacing XChaCha20-Poly1305)
- Hub event encryption uses AES-256-GCM
- Nonce: 12 bytes (GCM standard), randomly generated per encryption

XChaCha20-Poly1305 (24-byte nonce) is removed entirely. No production data exists, so no backward compatibility needed.

### Nonce Safety Analysis

AES-256-GCM with random 12-byte nonces has a birthday bound of ~2^48 encryptions per key. To stay well within NIST's recommendation of 2^32 invocations per key with random nonces:

- **HPKE envelopes:** Safe — each `hpke_seal` generates a fresh ephemeral key, so the nonce space resets per operation.
- **Server-encrypted tier (Tier 1):** Keys are now **epoch-rotated** — derived as `HKDF(SERVER_SECRET, salt=empty, info="{label}:{utc_day_number}", len=32)`. With daily rotation, even at 1M encryptions/day, the nonce collision probability is negligible (~2^-28).
- **Hub event encryption:** Already epoch-rotated (24h). Same analysis — safe.

The UTC day number (`floor(unix_seconds / 86400)`) is used as epoch to eliminate clock skew concerns across servers.

### WASM Build Target — Removed

The existing `wasm.rs` build target is **deleted**. It is no longer needed because:
- Desktop crypto routes through Tauri IPC → native Rust (not WASM)
- There is no browser/PWA mode
- Playwright tests use the real `.so` via `bun:ffi` (no JS crypto mocks)
- Client-side Whisper uses `@huggingface/transformers` ONNX (separate from our crypto crate)

## Build Integration

- `bun run crypto:build:server` — build the `.so` for the current platform
- CI builds the `.so` as a prerequisite before backend tests
- `.so` path configurable via `LLAMENOS_CRYPTO_LIB` env var (defaults to `packages/crypto/dist/server/libllamenoscore.so`)
- The `.so` is gitignored (build artifact), like generated codegen output

## Quality Gates

- `cargo test --features server` — FFI function tests
- `cargo clippy --features server`
- Integration test: TypeScript calls each FFI function, verifies round-trip with known test vectors
- Cross-compile check: CI builds for `x86_64-unknown-linux-gnu` (server) and `aarch64-unknown-linux-gnu` (ARM server)

## Decisions to Review

| Decision | Chosen | Alternative | Rationale |
|----------|--------|-------------|-----------|
| FFI vs WASM for server | `bun:ffi` native `.so` | `wasm-pack` WASM module | Native perf, no 4GB memory limit, same build toolchain as mobile |
| AES-256-GCM everywhere | Single AEAD | Keep XChaCha20 for symmetric | One cipher, aligns with HPKE internal AEAD, simpler audit. Epoch-rotated keys keep nonce space safe (2^20 ops/day << 2^32 NIST limit) |
| Caller-allocated buffers | Caller allocs output | Rust allocs + returns pointer | No cross-boundary heap management, simpler FFI |
| Thread-local error buffer | `ffi_last_error()` | Return error struct | Simpler C ABI, avoids struct marshaling. Wrapper reads immediately after failure (documented constraint) |
| Feature-gated FFI module | `#[cfg(feature = "server")] pub mod ffi` | Always compile FFI | The `server` feature gates the FFI module (C ABI exports), not the crate-type. `cdylib` is already in crate-type unconditionally and works fine for mobile builds |
| Delete WASM target | Remove `wasm.rs` entirely | Keep for browser fallback | No browser mode. Desktop uses Tauri IPC. Tests use real `.so`. WASM was only a transition artifact |
| Mandatory bounds checks | Every function validates buffer sizes | Trust the caller | Raw pointers bypass Rust safety. Buffer overflow is UB. Defensive checks are non-negotiable at FFI boundary |
