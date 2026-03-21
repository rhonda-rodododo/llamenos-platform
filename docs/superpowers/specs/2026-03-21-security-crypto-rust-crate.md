# Security Remediation — Epic 2: Crypto Rust Crate

**Date**: 2026-03-21
**Audit ref**: `docs/security/SECURITY_AUDIT_2026-03-21.md`
**Findings addressed**: CRIT-C1, CRIT-C2, CRIT-C3, HIGH-C1–C5, MED-C1–C3 (11 total; MED-C3 closed as N/A after investigation)
**Dependency order**: Must land before Desktop, iOS, and Android epics. All platforms use this crate.

---

## Context

`packages/crypto/` is the single auditable Rust crypto implementation compiled to native (Tauri), WASM (browser/test), and UniFFI (iOS/Android). Security defects here affect every platform simultaneously. Three critical findings were identified, all in the ECIES and provisioning key derivation paths.

**MED-C3 closed**: Investigation confirmed `derive_encryption_key` uses a static HKDF salt correctly — per-operation randomness is provided by XChaCha20's nonce (generated fresh per operation). This is not a vulnerability.

---

## Findings and Fixes

### CRIT-C1 — HKDF Extract uses `None` salt — fully deterministic PRK

**File**: `packages/crypto/src/ecies.rs:73-78`

Current code:
```rust
fn derive_ecies_key_v2(label: &str, shared_x: &[u8]) -> [u8; 32] {
    let hk = Hkdf::<Sha256>::new(None, shared_x);
    // ...
}
```

Per RFC 5869 §2.2, when salt is `None`, HKDF Extract uses a zero-filled block of `HashLen` bytes as the HMAC key. The resulting PRK is entirely a function of the ECDH x-coordinate with no additional randomness contribution. This affects all ECIES wrapping operations: note keys, message keys, hub keys, wake keys, and transcription payloads.

**Fix**: Replace `None` with a stable, domain-specific static salt:

```rust
const ECIES_V2_HKDF_SALT: &[u8] = b"llamenos:ecies:v2";

fn derive_ecies_key_v2(label: &str, shared_x: &[u8]) -> [u8; 32] {
    let hk = Hkdf::<Sha256>::new(Some(ECIES_V2_HKDF_SALT), shared_x);
    let mut okm = [0u8; 32];
    hk.expand(label.as_bytes(), &mut okm)
        .expect("HKDF expand should not fail for 32-byte output");
    okm
}
```

This exact byte string (`"llamenos:ecies:v2"`) must be used consistently across:
- The Rust crate (this file)
- The WASM build (same crate, compiled differently — no separate change needed)
- The UniFFI build (same crate — no separate change needed)

**Wire format impact**: This changes the derived key for all existing ECIES-wrapped envelopes. Since the project is pre-production with no persistent encrypted data, no migration is needed. Document this in a `CHANGELOG.md` entry.

**Verification**: Unit test that a wrap/unwrap round-trip with the salt change succeeds. Test that old-format ciphertext (derived without the salt) fails AEAD authentication after the change.

---

### CRIT-C2 — v1 legacy decryption path permanently active

**File**: `packages/crypto/src/ecies.rs:218-236`

The `ecies_unwrap_key_versioned` function performs content-sniffing version detection by checking `data[0] == ECIES_VERSION_V2` (0x02). Ciphertext from v1 whose first byte is `0x02` is misidentified as v2. The v1 path uses `derive_ecies_key_v1` (SHA-256 concatenation without HKDF), which is weaker than v2.

CLAUDE.md explicitly states the project is pre-production with no legacy data. The v1 path has no reason to exist.

**Scope**: Two functions in `ecies.rs` contain the v1 fallback path — both must be remediated:
1. `ecies_unwrap_key_versioned` (called by `ecies_unwrap_key`) — version-sniffing at line 218-236
2. `ecies_decrypt_content` (used by `ecies_decrypt_content_hex` in `ffi.rs`) — contains an identical v1 fallback at approximately lines 343-361

Both must be simplified to v2-only.

**Implementation note**: `ecies_unwrap_key` (the public function) currently delegates to `ecies_unwrap_key_versioned` (the private inner function containing the version-sniffing logic). The fix collapses them: delete `ecies_unwrap_key_versioned` and rewrite `ecies_unwrap_key` to be the single implementation with v2-only logic. The public signature remains unchanged.

**Fix**: Remove entirely:
- `derive_ecies_key_v1` function
- `ecies_unwrap_key_versioned` function — the v2-only logic moves directly into `ecies_unwrap_key`
- The v1 fallback branch inside `ecies_decrypt_content`

Keep `ECIES_VERSION_V2` as the hard-checked expected version byte. The updated `ecies_unwrap_key` retains its current public signature (`envelope: &KeyEnvelope, secret_key_hex: &str, label: &str`) but is now a direct implementation, not a wrapper:

```rust
pub fn ecies_unwrap_key(
    envelope: &KeyEnvelope,
    secret_key_hex: &str,
    label: &str,
) -> Result<[u8; 32], CryptoError> {
    // Decode the hex envelope and verify the version byte
    let data = hex::decode(&envelope.ciphertext_hex).map_err(CryptoError::HexError)?;
    if data.is_empty() || data[0] != ECIES_VERSION_V2 {
        return Err(CryptoError::InvalidFormat("unsupported ECIES version".into()));
    }
    // proceed with v2 derivation only, using derive_ecies_key_v2
}
```

Apply the same hard-fail pattern to `ecies_decrypt_content` — remove the v1 branch and return `Err(CryptoError::InvalidFormat(...))` for any non-v2 version byte.

**Test cleanup**: The following tests exercise v1 code paths and must all be deleted or converted to negative tests:

1. `v2_produces_different_key_than_v1` (approximately `ecies.rs:401`) — tests that v1 and v2 produce different keys; must become a compile-check that `derive_ecies_key_v1` no longer exists
2. `v1_ciphertext_decryptable_with_fallback` (approximately `ecies.rs:410`) — explicitly tests the v1 key-wrap fallback; must be converted to assert `Err(InvalidFormat)` for v1-format envelopes
3. `v1_content_decrypts_with_fallback` (approximately `ecies.rs:582`) — tests the v1 content fallback; must be converted to assert `Err(InvalidFormat)` for v1-format content
4. `ecies_decrypt_content_via_ffi` in `ffi.rs:467` — constructs a v1 envelope for the FFI path; must be updated to confirm that v1 FFI attempts now hard-fail. Also add a new positive FFI round-trip test that constructs v2 ciphertext (with version byte and HKDF derivation) and verifies successful decryption via `ecies_decrypt_content_hex`.

**Verification**:
- v1-format ciphertext → `ecies_unwrap_key` returns `Err(InvalidFormat)`
- v1-format ciphertext → `ecies_decrypt_content_hex` returns `Err(InvalidFormat)`
- v2 round-trip succeeds for both functions

---

### CRIT-C3 — Provisioning KDF mismatch: SHA-256 concat in `ffi.rs` vs HKDF in `provisioning.rs`

**File**: `packages/crypto/src/ffi.rs:188-193` vs `packages/crypto/src/provisioning.rs:81`

`decrypt_with_shared_key_hex` derives the provisioning symmetric key via:
```rust
// SHA-256(LABEL_DEVICE_PROVISION || shared_x)
let mut hasher = Sha256::new();
hasher.update(LABEL_DEVICE_PROVISION.as_bytes());
hasher.update(&shared_x);
```

But `derive_provisioning_key` in `provisioning.rs` uses:
```rust
let hk = Hkdf::<Sha256>::new(None, shared_x);
hk.expand(LABEL_DEVICE_PROVISION.as_bytes(), &mut okm)
```

These produce different keys from the same ECDH input. Device linking is currently broken — a secondary device calling `decrypt_with_shared_key_hex` cannot decrypt an envelope produced by `encrypt_nsec_for_provisioning`.

**Important**: `derive_provisioning_key` in `provisioning.rs:81` also uses `Hkdf::<Sha256>::new(None, shared_x)` — the same saltless pattern as CRIT-C1. It must receive its own domain-specific static salt as part of this fix. This salt must NOT reuse `ECIES_V2_HKDF_SALT` — provisioning is a distinct context:

```rust
const PROVISIONING_HKDF_SALT: &[u8] = b"llamenos:provisioning:v1";

pub(crate) fn derive_provisioning_key(shared_x: &[u8]) -> [u8; 32] {
    let hk = Hkdf::<Sha256>::new(Some(PROVISIONING_HKDF_SALT), shared_x);
    let mut okm = [0u8; 32];
    hk.expand(LABEL_DEVICE_PROVISION.as_bytes(), &mut okm)
        .expect("HKDF expand should not fail for 32-byte output");
    okm
}
```

**Fix**: Change `derive_provisioning_key` in `provisioning.rs` from `fn` to `pub(crate) fn` (it is currently private; `pub(crate)` restricts visibility to within the crate, which is correct since the only caller is `ffi.rs` in the same crate). Then replace the SHA-256 implementation in `ffi.rs:188-193` with a call to it:

```rust
// In ffi.rs decrypt_with_shared_key_hex:
let symmetric_key = crate::provisioning::derive_provisioning_key(&shared_x);
```

Both the `ffi.rs` unification and the `derive_provisioning_key` salt addition must happen together in the same commit, since they affect the same provisioning wire format.

**Cross-platform integration test**: Add a test in `packages/crypto/src/tests/` that:
1. Generates an ephemeral keypair on the "primary" side
2. Encrypts an nsec via `encrypt_nsec_for_provisioning`
3. Decrypts via `decrypt_with_shared_key_hex` (the FFI path)
4. Asserts the recovered nsec matches the original

This test must pass for both the native and WASM feature flags.

**Verification**: The integration test above must pass. Also add a negative test: encrypt with one KDF, attempt to decrypt with the other, expect failure.

---

### HIGH-C1 — `secret_key_hex` not zeroized in `KeyPair`

**File**: `packages/crypto/src/keys.rs:33,70,87`

`KeyPair.secret_key_hex` is a plain `String`. Intermediate byte buffers (`sk_bytes`, `data`) are dropped without zeroization.

**Fix**:

1. Change `secret_key_hex` field type to `Zeroizing<String>`:

```rust
use zeroize::Zeroizing;

pub struct KeyPair {
    pub secret_key_hex: Zeroizing<String>,
    // ...
}
```

Note: `Zeroizing<String>` derefs to `&str` so call sites using `kp.secret_key_hex.as_str()` or `&*kp.secret_key_hex` require no API change for internal callers. UniFFI imposes the constraint below (HIGH-C3).

2. Zeroize intermediate buffers immediately after last use:

```rust
let mut sk_bytes = sk.to_bytes();
// ... use sk_bytes ...
sk_bytes.zeroize();  // explicit, before function return
```

Use `Zeroizing::new()` wrappers for stack-allocated key material:

```rust
let sk_bytes = Zeroizing::new(sk.to_bytes());
```

**Verification**: Compile succeeds. Existing key generation tests pass. `cargo clippy` clean. **Required before merging: reviewer walkthrough confirming `Zeroizing::new()` wraps every intermediate byte buffer on every exit path in all three functions.** Add explicit checks that intermediate buffers are zeroized in all three `KeyPair`-generating functions:
- `generate_keypair`: `sk_bytes` (GenericArray from `sk.to_bytes()`) must be zeroized after hex encoding
- `keypair_from_nsec`: `data` (raw bytes from bech32 decode) must be zeroized after hex encoding
- `keypair_from_secret_key_hex`: `sk_bytes` (from `hex::decode(secret_key_hex)`) must be zeroized after use

Use `Zeroizing::new()` wrappers to ensure drop-based zeroization on all exit paths, not just on the happy path.

---

### HIGH-C2 — Note and message key not `ZeroizeOnDrop` — leaked on panic

**File**: `packages/crypto/src/encryption.rs:49,73-91,142-177`

`note_key` and `message_key` are plain `[u8; 32]` with a manually ordered `zeroize()` call. Panics between key creation and the explicit `zeroize()` leave the key in heap memory.

**Fix**: Use `Zeroizing::new()` which provides `ZeroizeOnDrop` automatically:

```rust
// Before:
let mut note_key = random_bytes_32();
// ...
note_key.zeroize();

// After:
let note_key = Zeroizing::new(random_bytes_32());
// note_key is zeroized on all exit paths (normal return, ?, panic)
```

Apply the same pattern to `message_key` in `encrypt_message`.

**Verification**: Existing note and message encryption/decryption tests pass. `cargo clippy` clean.

---

### HIGH-C3 — UniFFI exports `secret_key_hex` as plain string across the FFI boundary

**File**: `packages/crypto/src/keys.rs:15-25`

When `feature = "mobile"`, `KeyPair` derives `uniffi::Record` and serializes all fields — including `secret_key_hex` and `nsec` — to Swift/Kotlin `String`. CLAUDE.md requires that `nsecHex` is private and never leaves the service layer.

**Fix**: Create a separate mobile-safe return type that excludes key material:

```rust
#[cfg_attr(feature = "mobile", derive(uniffi::Record))]
pub struct PublicKeyPair {
    pub public_key: String,  // hex
    pub npub: String,        // bech32
}
```

Change ALL three mobile-facing FFI exports that currently return `KeyPair` to return `PublicKeyPair` when `feature = "mobile"`:
- `generate_keypair()`
- `keypair_from_nsec()`
- `keypair_from_secret_key_hex()` — also annotated with `#[cfg_attr(feature = "mobile", uniffi::export)]`; omitted from the original audit scope but confirmed present in `keys.rs`

**Return type note**: The mobile shim for `generate_keypair` changes the return type from `KeyPair` (infallible) to `Result<PublicKeyPair, CryptoError>` (fallible). This is a breaking change for mobile callers. iOS and Android code that currently calls `generateKeypair()` and uses the result directly will need to add error handling. Document this in the Epic 5 (iOS/Android) migration note. The `Result` wrapper is appropriate for UniFFI interop — even if key generation cannot fail, the FFI boundary uses `Result` for uniform error propagation.

```rust
#[cfg(feature = "mobile")]
#[uniffi::export]
pub fn generate_keypair() -> Result<PublicKeyPair, CryptoError> {
    let kp = internal_generate_keypair()?;
    Ok(PublicKeyPair { public_key: kp.public_key, npub: kp.npub })
}

#[cfg(feature = "mobile")]
#[uniffi::export]
pub fn keypair_from_secret_key_hex(secret_key_hex: &str) -> Result<PublicKeyPair, CryptoError> {
    let kp = internal_keypair_from_secret_key_hex(secret_key_hex)?;
    Ok(PublicKeyPair { public_key: kp.public_key, npub: kp.npub })
}
```

The internal `KeyPair` type (containing `secret_key_hex`) remains available to non-FFI Rust callers (WASM, native) but is never exposed over the UniFFI boundary.

**iOS/Android impact**: Any mobile code that currently reads `kp.secretKeyHex` from the FFI must be updated to use the stateful `loadKey(nsecHex:)` / `loadKeyFromNsec()` pattern where the nsec is passed into CryptoState and never returned.

**Verification**: `cargo build --features mobile` succeeds. `PublicKeyPair` has no key material fields. `KeyPair` internal type still compiles for native/WASM.

---

### HIGH-C4 — `derive_kek_hex` FFI export bypasses PIN validation

**File**: `packages/crypto/src/ffi.rs:115-121`

`#[uniffi::export] fn derive_kek_hex(pin: &str, salt_hex: &str)` accepts any string as a PIN with no validation. `is_valid_pin` (6-8 ASCII digits) is enforced only in `encrypt_with_pin`.

**Fix**: Option A (preferred) — remove the direct `derive_kek_hex` export. All PIN-based operations go through `encrypt_with_pin` / `decrypt_with_pin`, which already enforce `is_valid_pin`.

Option B (if `derive_kek_hex` must remain for some mobile use case) — add validation at the entry point:

```rust
#[uniffi::export]
pub fn derive_kek_hex(pin: &str, salt_hex: &str) -> Result<String, CryptoError> {
    if !is_valid_pin(pin) {
        return Err(CryptoError::InvalidPin);
    }
    // ...
}
```

Investigation found no mobile code calling `derive_kek_hex` directly, so Option A is correct.

**Verification**: `derive_kek_hex` is absent from the UniFFI generated bindings. Existing PIN tests pass via `encrypt_with_pin` / `decrypt_with_pin`.

---

### HIGH-C5 — `get_nsec()` returns raw nsec as unzeroizable JS string in WASM

**File**: `packages/crypto/src/wasm.rs:494-507`

`#[wasm_bindgen] pub fn get_nsec()` returns the nsec as a JavaScript string primitive — immutable, unzeroizable, potentially retained by V8. The function requires a one-time provisioning token (obtained via `requestProvisioningToken()`) which is consumed on use — it is not an unconditional accessor. However, even with token gating, the nsec materializes as an immutable JS string on each call; V8 may retain copies in the heap that cannot be zeroed. The function is marked `@deprecated` in `platform.ts`. The `encrypt_nsec_for_provisioning` function already handles the provisioning use case without materializing the nsec in JS.

**Fix**: Delete `get_nsec` from `wasm.rs`. There is no call site that cannot be replaced with `encrypt_nsec_for_provisioning` or the stateful CryptoState pattern.

Check for any remaining callers in `src/client/` and `tests/` — all must be removed or replaced.

**Verification**: `get_nsec` is absent from the compiled WASM exports. All provisioning flows use `encrypt_nsec_for_provisioning`. `bun run build` succeeds. Playwright tests pass.

---

### MED-C1 — `xonly_to_compressed` always uses even-y prefix

**File**: `packages/crypto/src/ecies.rs:97-106`

The function always prepends `0x02` (even-y). This is correct for BIP-340/Nostr x-only keys where even-y is canonical. However, the function name and signature give no indication of this constraint, and a caller using non-BIP-340 keys would silently get the wrong ECDH shared secret for ~50% of keypairs.

**Fix**: Add a `debug_assert` and a doc comment making the constraint explicit:

```rust
/// Converts a 32-byte x-only (BIP-340) public key to SEC1 compressed form.
///
/// # BIP-340 assumption
/// This function always uses the even-y (0x02) prefix, which is correct for
/// Nostr/BIP-340 x-only keys. Do NOT use this for arbitrary secp256k1 keys
/// where the y-coordinate may be odd.
fn xonly_to_compressed(xonly_hex: &str) -> Result<Vec<u8>, CryptoError> {
    // ...
}
```

This is a documentation fix, not a logic change. The existing behavior is correct for all current call sites.

---

### MED-C2 — Ephemeral SK crosses the WASM boundary as a string parameter

**File**: `packages/crypto/src/wasm.rs:457-477`

`decrypt_provisioned_nsec(ephemeral_sk_hex: &str, ...)` receives the ephemeral secret key from JavaScript as a string. This means the ephemeral SK (protecting the provisioned nsec) lives in the JS heap as a string before the WASM call.

**Fix**: Add a WASM-side ephemeral keypair generation function and store the ephemeral SK in WASM state:

```rust
// New function:
#[wasm_bindgen]
pub fn generate_provisioning_ephemeral() -> Result<String, JsValue> {
    // generates ephemeral keypair, stores SK in WasmCryptoState, returns only pubkey hex
}

// Updated function (SK no longer a parameter):
#[wasm_bindgen]
pub fn decrypt_provisioned_nsec(
    sender_pubkey_hex: &str,
    ciphertext_hex: &str,
) -> Result<(), JsValue> {
    // uses SK from WasmCryptoState
}
```

The JS side calls `generate_provisioning_ephemeral()` to get the ephemeral pubkey, sends it to the provisioning server, then calls `decrypt_provisioned_nsec(sender_pubkey, ciphertext)` — the SK never crosses the WASM boundary.

**Verification**: Provisioning round-trip test using the new WASM API succeeds. No `ephemeral_sk_hex` parameter exists in the compiled WASM exports.

---

### MED-C3 — Closed (N/A)

Investigation confirmed `derive_encryption_key` in `encryption.rs:302-309` uses a static HKDF salt (`"llamenos:hkdf-salt:v1"`) for draft and export encryption. This is correct — per-operation randomness is provided by XChaCha20's nonce (generated fresh per `encrypt_draft` / `encrypt_export` call). The static salt is appropriate for domain separation. No fix required.

---

## Implementation Sequence

Changes in this epic must be coordinated because CRIT-C1 changes the ECIES wire format — implement all three CRITs together in a single commit to avoid breaking intermediate states:

1. **CRIT-C1 + CRIT-C2 + CRIT-C3 together**: These three must land in a single commit. CRIT-C1 adds `ECIES_V2_HKDF_SALT` to `derive_ecies_key_v2` and `PROVISIONING_HKDF_SALT` to `derive_provisioning_key`. CRIT-C2 removes all v1 code paths in both `ecies_unwrap_key` and `ecies_decrypt_content` (and deletes `ecies_unwrap_key_versioned`). CRIT-C3 changes `derive_provisioning_key` to `pub(crate) fn`, then replaces the SHA-256 path in `ffi.rs` with a call to it. Together they produce a clean, single-path implementation with no intermediate broken states. Add the round-trip integration test as part of this commit.
2. **HIGH-C1 + HIGH-C2**: Zeroization fixes (additive, no API break).
3. **HIGH-C3**: `PublicKeyPair` type introduction + mobile FFI changes (requires iOS/Android callers to be updated — coordinate with Epic 5).
4. **HIGH-C4**: Remove `derive_kek_hex` export.
5. **HIGH-C5**: Remove `get_nsec` WASM export + remove callers in `platform.ts`.
6. **MED-C1**: Doc comment on `xonly_to_compressed`.
7. **MED-C2**: Ephemeral keypair generation in WASM state.

---

## Verification Checklist

- [ ] `cargo test --manifest-path packages/crypto/Cargo.toml` passes (all existing tests)
- [ ] `cargo test --manifest-path packages/crypto/Cargo.toml --features mobile` passes
- [ ] `cargo clippy` clean
- [ ] Round-trip test: wrap key with new HKDF salt → unwrap → plaintext matches
- [ ] Negative test: v1-format ciphertext → `ecies_unwrap_key` returns `Err(InvalidFormat)`
- [ ] Negative test: v1-format ciphertext → `ecies_decrypt_content_hex` returns `Err(InvalidFormat)`
- [ ] Test `v1_content_decrypts_with_fallback` removed or converted to a negative test
- [ ] Test `ecies_decrypt_content_via_ffi` updated to confirm v1 FFI attempts hard-fail
- [ ] Negative test: encrypt provisioning with HKDF → decrypt with SHA-256 concat → `Err(DecryptionFailed)`
- [ ] Positive test: encrypt provisioning with HKDF → decrypt with HKDF → plaintext matches
- [ ] `get_nsec` absent from WASM exports
- [ ] `derive_kek_hex` absent from UniFFI bindings
- [ ] `secret_key_hex` absent from UniFFI `PublicKeyPair` record
- [ ] `bun run build` succeeds (WASM compilation)
- [ ] `bun run test` passes (Playwright, which uses WASM crypto via mocks)
- [ ] `bun run crypto:test:mobile` passes
