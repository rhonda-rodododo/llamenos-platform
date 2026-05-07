# Plan: Rust FFI Server Crypto Bridge

**Spec**: `docs/superpowers/specs/2026-05-05-rust-ffi-server-crypto-design.md`

## Prerequisites

- `packages/crypto/` Rust crate with existing native/mobile/WASM targets
- `packages/crypto/Cargo.toml` already has `crate-type = ["lib", "cdylib", "staticlib"]`
- Bun runtime with `bun:ffi` support
- Ed25519, X25519, HPKE, AES-256-GCM, SHA-256, HMAC, HKDF already implemented in Rust crate

## Implementation Steps

### Step 1: Add `server` Feature Flag and FFI Module Skeleton

**Files**:
- `packages/crypto/Cargo.toml`
- `packages/crypto/src/ffi_server.rs` (new)
- `packages/crypto/src/lib.rs`

**Changes**:
1. Add `server = []` feature to `Cargo.toml` `[features]` section (alongside existing `mobile`, `wasm`)
2. Create `packages/crypto/src/ffi_server.rs` with `#[cfg(feature = "server")]` module gate
3. Add thread-local error buffer: `thread_local! { static LAST_ERROR: RefCell<Vec<u8>> = RefCell::new(Vec::new()) }`
4. Implement `ffi_last_error(out: *mut u8, out_len: usize) -> i32`
5. Implement a `check_null!` macro and `set_error()` helper for consistent null/bounds checking across all FFI functions
6. Add `#[cfg(feature = "server")] pub mod ffi_server;` to `lib.rs`

**Verification**: `cargo check --features server` compiles

---

### Step 2: Implement Core FFI Functions (Hash, HMAC, HKDF, Random)

**Files**:
- `packages/crypto/src/ffi_server.rs`

**Changes**:
1. `ffi_random_bytes(out, len)` — fill buffer with `rand::thread_rng().fill_bytes()`
2. `ffi_sha256(data, data_len, out, out_len)` — validate out_len >= 32, compute SHA-256 via `sha2::Sha256`
3. `ffi_hmac_sha256(key, key_len, data, data_len, out, out_len)` — validate out_len >= 32, compute via `hmac::Hmac<Sha256>`
4. `ffi_hkdf_sha256(ikm, ikm_len, salt, salt_len, info, info_len, out, out_len)` — use existing `hkdf::Hkdf<Sha256>`
5. All functions: null pointer check → buffer size check → input size limit (100 MiB) → compute → zeroize locals → return 0
6. All functions: on error, call `set_error(msg)` before returning error code

**Verification**: `cargo test --features server` — unit tests for each function with known test vectors

---

### Step 3: Implement Symmetric Encryption FFI Functions (AES-256-GCM)

**Files**:
- `packages/crypto/src/ffi_server.rs`

**Changes**:
1. `ffi_aes256gcm_encrypt(key, key_len, plaintext, pt_len, aad, aad_len, out, out_len)`:
   - Validate key_len == 32, out_len >= 12 + pt_len + 16
   - Generate random 12-byte nonce
   - Encrypt via `aes_gcm::Aes256Gcm`
   - Write nonce(12) || ciphertext || tag(16) to out
2. `ffi_aes256gcm_decrypt(key, key_len, ciphertext, ct_len, aad, aad_len, out, out_len)`:
   - Validate key_len == 32, ct_len >= 28 (12 nonce + 16 tag min), out_len >= ct_len - 28
   - Split input into nonce(12) || ciphertext+tag
   - Decrypt and verify tag
   - Return -1 on authentication failure

**Verification**: `cargo test --features server` — round-trip encrypt/decrypt, bad key/aad rejection, truncated ciphertext rejection

---

### Step 4: Implement Asymmetric FFI Functions (HPKE, Ed25519)

**Files**:
- `packages/crypto/src/ffi_server.rs`

**Changes**:
1. `ffi_hpke_seal(recipient_pk, pk_len, plaintext, pt_len, info, info_len, aad, aad_len, out, out_len)`:
   - Validate pk_len == 32, out_len >= 32 + pt_len + 16
   - Call existing `hpke_envelope::seal()` internally
   - Write enc(32) || ciphertext+tag to out
2. `ffi_hpke_open(secret_key, sk_len, envelope, env_len, info, info_len, aad, aad_len, out, out_len)`:
   - Validate sk_len == 32, env_len >= 48 (32 enc + 16 tag min)
   - Call existing `hpke_envelope::open()` internally
   - Return -1 on decryption failure
3. `ffi_ed25519_sign(secret_key, sk_len, message, msg_len, out, out_len)`:
   - Validate sk_len == 32, out_len >= 64
   - Use `ed25519_dalek::SigningKey::from_bytes()`, sign message, write 64-byte sig
   - Zeroize signing key copy
4. `ffi_ed25519_verify(pubkey, pk_len, message, msg_len, signature, sig_len)`:
   - Validate pk_len == 32, sig_len == 64
   - Return 0 (valid) or -1 (invalid)
5. `ffi_ed25519_pubkey_from_seed(seed, seed_len, out, out_len)`:
   - Validate seed_len == 32, out_len >= 32
   - Derive public key from seed, write to out

**Verification**: `cargo test --features server` — HPKE seal/open round-trip with label enforcement, Ed25519 sign/verify with RFC 8032 test vectors, cross-verify with existing `hpke_envelope.rs` and `auth.rs` tests

---

### Step 5: Build Script and `.so` Output

**Files**:
- `packages/crypto/scripts/build-server.sh` (new)
- `package.json` (root)

**Changes**:
1. Create `packages/crypto/scripts/build-server.sh`:
   ```bash
   #!/usr/bin/env bash
   set -euo pipefail
   cd "$(dirname "$0")/.."
   cargo build --release --features server
   mkdir -p dist/server
   cp ../../target/release/libllamenoscore.so dist/server/
   echo "Built: dist/server/libllamenoscore.so"
   ```
2. `chmod +x packages/crypto/scripts/build-server.sh`
3. Add to root `package.json` scripts: `"crypto:build:server": "packages/crypto/scripts/build-server.sh"`
4. Add `packages/crypto/dist/server/` to `.gitignore` (build artifact)

**Verification**: `bun run crypto:build:server` produces `packages/crypto/dist/server/libllamenoscore.so`

---

### Step 6: TypeScript FFI Wrapper

**Files**:
- `packages/crypto/ffi.ts` (new)

**Changes**:
1. Import `dlopen`, `FFIType`, `ptr`, `toBuffer` from `bun:ffi`
2. Load `.so` from `process.env.LLAMENOS_CRYPTO_LIB ?? 'packages/crypto/dist/server/libllamenoscore.so'`
3. Declare FFI symbols for all 12 functions with correct arg/return types
4. Export typed wrapper functions:
   - `sha256(data: Uint8Array): Uint8Array`
   - `hmacSha256(key: Uint8Array, data: Uint8Array): Uint8Array`
   - `hkdfSha256(ikm: Uint8Array, salt: Uint8Array, info: Uint8Array, len: number): Uint8Array`
   - `symmetricEncrypt(key: Uint8Array, plaintext: Uint8Array, aad: Uint8Array): Uint8Array`
   - `symmetricDecrypt(key: Uint8Array, ciphertext: Uint8Array, aad: Uint8Array): Uint8Array`
   - `hpkeSeal(recipientPk: Uint8Array, plaintext: Uint8Array, info: Uint8Array, aad: Uint8Array): Uint8Array`
   - `hpkeOpen(secretKey: Uint8Array, envelope: Uint8Array, info: Uint8Array, aad: Uint8Array): Uint8Array`
   - `ed25519Sign(secretKey: Uint8Array, message: Uint8Array): Uint8Array`
   - `ed25519Verify(pubkey: Uint8Array, message: Uint8Array, signature: Uint8Array): boolean`
   - `ed25519PubkeyFromSeed(seed: Uint8Array): Uint8Array`
   - `randomBytes(len: number): Uint8Array`
5. Each wrapper: allocate output buffer → call FFI → check return code → if error, read `ffi_last_error()` synchronously → throw or return
6. Export the module as `@llamenos/crypto/ffi` (add to workspace package.json exports)

**Verification**: `bun run typecheck` passes

---

### Step 7: Encoding Utilities

**Files**:
- `packages/shared/encoding.ts` (new)
- `packages/shared/index.ts` (or barrel export)

**Changes**:
1. Implement pure TypeScript encoding functions (~30 lines):
   - `hexToBytes(hex: string): Uint8Array`
   - `bytesToHex(bytes: Uint8Array): string`
   - `utf8ToBytes(str: string): Uint8Array` — uses `TextEncoder`
   - `bytesToUtf8(bytes: Uint8Array): string` — uses `TextDecoder`
2. Export from `packages/shared` barrel

**Verification**: Unit tests for round-trip encoding with edge cases (empty, odd-length hex rejection)

---

### Step 8: Delete WASM Target

**Files**:
- `packages/crypto/src/wasm.rs` (delete)
- `packages/crypto/src/lib.rs`
- `packages/crypto/Cargo.toml`
- `tests/mocks/wasm-crypto-state.ts` (delete)

**Changes**:
1. Delete `packages/crypto/src/wasm.rs` (~500 lines)
2. Remove `pub mod wasm;` and any `#[cfg(feature = "wasm")]` from `lib.rs`
3. Remove `wasm` feature from `Cargo.toml` features section
4. Remove `wasm-bindgen`, `js-sys`, `web-sys` dependencies from `Cargo.toml`
5. Delete `tests/mocks/wasm-crypto-state.ts`
6. Remove any WASM build scripts (check `packages/crypto/scripts/` for wasm-related scripts)

**Verification**: `cargo check --all-features` still compiles. `bun run typecheck` passes.

---

### Step 9: Integration Test — TypeScript ↔ Rust Round-Trip

**Files**:
- `packages/crypto/tests/ffi-integration.test.ts` (new)

**Changes**:
1. Test each FFI function with known test vectors:
   - SHA-256: NIST test vectors
   - HMAC-SHA256: RFC 4231 test vectors
   - HKDF: RFC 5869 test vectors
   - AES-256-GCM: encrypt → decrypt round-trip, bad key rejection, bad AAD rejection
   - HPKE: seal → open round-trip, wrong key rejection, wrong info/aad rejection (label enforcement)
   - Ed25519: sign → verify, wrong key rejection, RFC 8032 test vectors
2. Cross-verify: TypeScript FFI produces same output as `cargo test` Rust-side tests for identical inputs

**Verification**: `bun test packages/crypto/tests/ffi-integration.test.ts` passes

---

### Step 10: CI Integration

**Files**:
- `.github/workflows/test-desktop.yml` (or equivalent CI config)

**Changes**:
1. Add `bun run crypto:build:server` step before backend test steps
2. Add `cargo test --features server` to crypto test matrix
3. Add `cargo clippy --features server` to lint step

**Verification**: CI pipeline builds `.so` and runs FFI tests

---

## Dependency Chain

This plan has NO upstream dependencies. All subsequent plans (Auth, HPKE, WebSocket, Cleanup) depend on it.

## Risk Notes

- `cdylib` is already in crate-type list — verify it doesn't break existing mobile builds. If linker warnings appear, gate cdylib output behind a build script that checks for `--features server`
- `bun:ffi` pointer handling requires careful testing — off-by-one in buffer sizes cause UB
- Thread-local error buffer is not async-safe — document that `ffi_last_error()` must be read in same microtask as the failing call
