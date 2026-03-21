# Crypto Rust Crate Security Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 10 security findings in the shared Rust crypto crate — eliminating weak key derivation, legacy ECIES paths, unzeroized key material, and unsafe FFI exports.

**Architecture:** All changes are in `packages/crypto/`. CRIT fixes must land atomically in a single commit. HIGH fixes are additive. The crate is compiled to native (Tauri), WASM (tests), and UniFFI (iOS/Android).

**Tech Stack:** Rust, `hkdf`, `sha2`, `zeroize`, `k256`, `wasm-bindgen`, `uniffi`

---

## File Map

| File | What changes |
|------|-------------|
| `packages/crypto/src/ecies.rs` | Add `ECIES_V2_HKDF_SALT`; rewrite `derive_ecies_key_v2` with salt; delete `derive_ecies_key_v1`, `ecies_unwrap_key_versioned`; collapse `ecies_unwrap_key` to v2-only; remove v1 branch from `ecies_decrypt_content`; delete/convert 3 tests |
| `packages/crypto/src/provisioning.rs` | Add `PROVISIONING_HKDF_SALT`; change `derive_provisioning_key` to `pub(crate)` with salt |
| `packages/crypto/src/ffi.rs` | Replace SHA-256 KDF in `decrypt_with_shared_key_hex` with call to `provisioning::derive_provisioning_key`; remove `derive_kek_hex`; update/replace `ecies_decrypt_content_via_ffi` test |
| `packages/crypto/src/keys.rs` | Add `Zeroizing<String>` for `secret_key_hex`; zeroize intermediate buffers in all 3 keygen fns; add `PublicKeyPair` type; add mobile FFI shim fns |
| `packages/crypto/src/encryption.rs` | Wrap `note_key` and `message_key` in `Zeroizing::new()` |
| `packages/crypto/src/wasm.rs` | Delete `get_nsec`; delete `request_provisioning_token`; add `generate_provisioning_ephemeral`; update `decrypt_provisioned_nsec` to remove `ephemeral_sk_hex` parameter |
| `src/client/lib/platform.ts` | Delete `getNsecFromState`; update `decryptProvisionedNsec` call site |
| `packages/crypto/src/ecies.rs` (doc) | Add doc comment + `debug_assert` to `xonly_to_compressed` |

---

## Task 1: CRIT-C1 + CRIT-C2 + CRIT-C3 — Atomic commit for ECIES salt, v1 removal, provisioning KDF unification

**Spec refs**: CRIT-C1, CRIT-C2, CRIT-C3

**Files:**
- Modify: `packages/crypto/src/ecies.rs`
- Modify: `packages/crypto/src/provisioning.rs`
- Modify: `packages/crypto/src/ffi.rs`

**Background**: These three findings are interdependent because CRIT-C1 changes the ECIES wire format (adding a salt to `derive_ecies_key_v2`). An intermediate commit that adds the salt without removing the v1 path would leave the crate in a state where old ciphertext (v1) appears to decrypt but produces wrong output with the new KDF. The fix must be atomic: add the salts, remove v1, unify the provisioning KDF — all in one commit.

**Key existing code to understand**:
- `ecies.rs:73-79` — `derive_ecies_key_v2` currently uses `Hkdf::<Sha256>::new(None, shared_x)` (saltless)
- `ecies.rs:81-94` — `derive_ecies_key_v1` uses SHA-256(label || shared_x) — must be deleted
- `ecies.rs:180-187` — `ecies_unwrap_key` currently delegates to `ecies_unwrap_key_versioned`
- `ecies.rs:190-259` — `ecies_unwrap_key_versioned` contains the v1/v2 branching — must be deleted
- `ecies.rs:316-374` — `ecies_decrypt_content` contains the v1 fallback branch — must be purged
- `provisioning.rs:80-86` — `derive_provisioning_key` uses `None` salt, is private — must get salt + `pub(crate)`
- `ffi.rs:188-193` — `decrypt_with_shared_key_hex` derives key via SHA-256 concat — must call `provisioning::derive_provisioning_key` instead
- `ecies.rs:400-407` — test `v2_produces_different_key_than_v1` calls both v1 and v2 fns — delete
- `ecies.rs:409-453` — test `v1_ciphertext_decryptable_with_fallback` tests v1 fallback — convert to negative test
- `ecies.rs:582-620` — test `v1_content_decrypts_with_fallback` tests v1 content fallback — convert to negative test
- `ffi.rs:467-520` — test `ecies_decrypt_content_via_ffi` uses SHA-256 derivation (v1 style) — must hard-fail + add v2 positive test

- [ ] **Step 1: Update `derive_ecies_key_v2` in `ecies.rs` to use the domain-specific static salt**

In `packages/crypto/src/ecies.rs`, at the top of the file (after existing `const ECIES_VERSION_V2`), add the salt constant and rewrite `derive_ecies_key_v2`:

```rust
// Add after: const ECIES_VERSION_V2: u8 = 0x02;
const ECIES_V2_HKDF_SALT: &[u8] = b"llamenos:ecies:v2";
```

Replace the body of `derive_ecies_key_v2` (lines 73–79):

```rust
// Before:
fn derive_ecies_key_v2(label: &str, shared_x: &[u8]) -> [u8; 32] {
    let hk = Hkdf::<Sha256>::new(None, shared_x);
    let mut okm = [0u8; 32];
    hk.expand(label.as_bytes(), &mut okm)
        .expect("HKDF expand should not fail for 32-byte output");
    okm
}

// After:
fn derive_ecies_key_v2(label: &str, shared_x: &[u8]) -> [u8; 32] {
    let hk = Hkdf::<Sha256>::new(Some(ECIES_V2_HKDF_SALT), shared_x);
    let mut okm = [0u8; 32];
    hk.expand(label.as_bytes(), &mut okm)
        .expect("HKDF expand should not fail for 32-byte output");
    okm
}
```

- [ ] **Step 2: Delete `derive_ecies_key_v1` entirely from `ecies.rs`**

Delete lines 81–94 (the entire `derive_ecies_key_v1` function including its doc comment). After deletion, the `Sha256` import from `sha2` may become unused — remove it from the import list at the top of the file if so:

```rust
// Before (line 24):
use sha2::{Digest, Sha256};

// After (only if Sha256 no longer used elsewhere in this file):
use sha2::Digest;
```

Check if `Sha256` is used anywhere else in `ecies.rs` before removing — it may be used in test code.

- [ ] **Step 3: Collapse `ecies_unwrap_key` to v2-only, deleting `ecies_unwrap_key_versioned`**

In `ecies.rs`, delete the entire `ecies_unwrap_key_versioned` function (lines 189–259). Rewrite `ecies_unwrap_key` (lines 180–187) as a direct v2-only implementation:

```rust
/// Unwrap a 32-byte symmetric key from an ECIES envelope (v2 only).
///
/// Returns `Err(CryptoError::InvalidFormat)` for any non-v2 ciphertext.
pub fn ecies_unwrap_key(
    envelope: &KeyEnvelope,
    secret_key_hex: &str,
    label: &str,
) -> Result<[u8; 32], CryptoError> {
    // Parse secret key
    let mut sk_bytes = hex::decode(secret_key_hex).map_err(CryptoError::HexError)?;
    if sk_bytes.len() != 32 {
        sk_bytes.zeroize();
        return Err(CryptoError::InvalidSecretKey);
    }
    let secret_key = SecretKey::from_slice(&sk_bytes).map_err(|_| {
        sk_bytes.zeroize();
        CryptoError::InvalidSecretKey
    })?;
    sk_bytes.zeroize();

    // Parse ephemeral public key (compressed SEC1, 33 bytes)
    let ephemeral_bytes =
        hex::decode(&envelope.ephemeral_pubkey).map_err(CryptoError::HexError)?;
    let ephemeral_pubkey = PublicKey::from_sec1_bytes(&ephemeral_bytes)
        .map_err(|_| CryptoError::InvalidEphemeralKey)?;

    // ECDH: compute shared x-coordinate
    let mut shared_x = ecdh_shared_x(&secret_key, &ephemeral_pubkey)?;

    // Unpack: require v2 version byte
    let data = hex::decode(&envelope.wrapped_key).map_err(CryptoError::HexError)?;
    if data.is_empty() || data[0] != ECIES_VERSION_V2 {
        shared_x.zeroize();
        return Err(CryptoError::InvalidFormat("unsupported ECIES version".into()));
    }
    let payload = &data[1..];

    if payload.len() < 24 {
        shared_x.zeroize();
        return Err(CryptoError::InvalidCiphertext);
    }
    let nonce = XNonce::from_slice(&payload[..24]);
    let ciphertext = &payload[24..];

    // Derive symmetric key (v2 only)
    let mut symmetric_key = derive_ecies_key_v2(label, &shared_x);

    // Decrypt
    let cipher = XChaCha20Poly1305::new_from_slice(&symmetric_key)
        .map_err(|e| CryptoError::EncryptionFailed(e.to_string()))?;
    let result = cipher.decrypt(nonce, ciphertext);

    // Zero out sensitive material
    symmetric_key.zeroize();
    shared_x.zeroize();

    let plaintext = result.map_err(|_| CryptoError::DecryptionFailed)?;

    if plaintext.len() != 32 {
        return Err(CryptoError::DecryptionFailed);
    }

    let mut key = [0u8; 32];
    key.copy_from_slice(&plaintext);
    Ok(key)
}
```

Note: `CryptoError::InvalidFormat` requires a `String` argument. Check `packages/crypto/src/errors.rs` — if the variant doesn't exist or uses a different signature, add it or adjust accordingly.

- [ ] **Step 4: Verify `CryptoError::InvalidFormat` exists in `errors.rs`**

Check `packages/crypto/src/errors.rs` for an `InvalidFormat` variant:

```bash
grep -n "InvalidFormat" packages/crypto/src/errors.rs
```

If it doesn't exist, add it:

```rust
/// Unsupported or invalid format (e.g., wrong ECIES version byte)
InvalidFormat(String),
```

Also add a `Display` impl arm if the file implements `Display` manually:

```rust
CryptoError::InvalidFormat(msg) => write!(f, "invalid format: {}", msg),
```

- [ ] **Step 5: Remove the v1 branch from `ecies_decrypt_content`**

Replace the version-detection block in `ecies_decrypt_content` (lines 342–361):

```rust
// Before:
let (version, payload) = if !data.is_empty() && data[0] == ECIES_VERSION_V2 {
    (2, &data[1..])
} else {
    (1, &data[..])
};

if payload.len() < 24 {
    shared_x.zeroize();
    return Err(CryptoError::InvalidCiphertext);
}
let nonce = XNonce::from_slice(&payload[..24]);
let ciphertext = &payload[24..];

let mut symmetric_key = if version == 2 {
    derive_ecies_key_v2(label, &shared_x)
} else {
    derive_ecies_key_v1(label, &shared_x)
};

// After:
if data.is_empty() || data[0] != ECIES_VERSION_V2 {
    shared_x.zeroize();
    return Err(CryptoError::InvalidFormat("unsupported ECIES version".into()));
}
let payload = &data[1..];

if payload.len() < 24 {
    shared_x.zeroize();
    return Err(CryptoError::InvalidCiphertext);
}
let nonce = XNonce::from_slice(&payload[..24]);
let ciphertext = &payload[24..];

let mut symmetric_key = derive_ecies_key_v2(label, &shared_x);
```

Also update the doc comment on `ecies_decrypt_content` to remove the mention of v1 support.

- [ ] **Step 6: Update `derive_provisioning_key` in `provisioning.rs` — add salt and `pub(crate)`**

In `packages/crypto/src/provisioning.rs`, add the salt constant after the existing imports/use declarations:

```rust
const PROVISIONING_HKDF_SALT: &[u8] = b"llamenos:provisioning:v1";
```

Change `fn derive_provisioning_key` (line 80) to `pub(crate) fn` and add the salt:

```rust
// Before:
fn derive_provisioning_key(shared_x: &[u8]) -> [u8; 32] {
    let hk = Hkdf::<Sha256>::new(None, shared_x);
    let mut okm = [0u8; 32];
    hk.expand(LABEL_DEVICE_PROVISION.as_bytes(), &mut okm)
        .expect("HKDF expand should not fail for 32-byte output");
    okm
}

// After:
pub(crate) fn derive_provisioning_key(shared_x: &[u8]) -> [u8; 32] {
    let hk = Hkdf::<Sha256>::new(Some(PROVISIONING_HKDF_SALT), shared_x);
    let mut okm = [0u8; 32];
    hk.expand(LABEL_DEVICE_PROVISION.as_bytes(), &mut okm)
        .expect("HKDF expand should not fail for 32-byte output");
    okm
}
```

- [ ] **Step 7: Replace SHA-256 derivation in `ffi.rs::decrypt_with_shared_key_hex` with `provisioning::derive_provisioning_key`**

In `packages/crypto/src/ffi.rs`, update `decrypt_with_shared_key_hex` (lines 183–209).

Remove the internal `use sha2::{Digest, Sha256};` (the `use` block inside the function body at line 181) and the SHA-256 derivation block (lines 188–193). Replace with the unified call:

```rust
// Before (inside decrypt_with_shared_key_hex):
use chacha20poly1305::{
    aead::{Aead, KeyInit},
    XChaCha20Poly1305, XNonce,
};
use sha2::{Digest, Sha256};

let shared_x = hex::decode(shared_x_hex).map_err(CryptoError::HexError)?;
if shared_x.len() != 32 {
    return Err(CryptoError::InvalidSecretKey);
}

// Derive symmetric key: SHA-256(LABEL_DEVICE_PROVISION || shared_x)
let mut hasher = Sha256::new();
hasher.update(LABEL_DEVICE_PROVISION.as_bytes());
hasher.update(&shared_x);
let mut symmetric_key = [0u8; 32];
symmetric_key.copy_from_slice(&hasher.finalize());

// After:
use chacha20poly1305::{
    aead::{Aead, KeyInit},
    XChaCha20Poly1305, XNonce,
};

let shared_x = hex::decode(shared_x_hex).map_err(CryptoError::HexError)?;
if shared_x.len() != 32 {
    return Err(CryptoError::InvalidSecretKey);
}

// Derive symmetric key via HKDF (matches provisioning.rs — CRIT-C3 fix)
let mut symmetric_key = crate::provisioning::derive_provisioning_key(&shared_x);
```

Also remove the `use crate::labels::LABEL_DEVICE_PROVISION;` from the top-level imports in `ffi.rs` if it is now unused (check whether any other function in `ffi.rs` still uses it).

- [ ] **Step 8: Clean up tests — delete `v2_produces_different_key_than_v1` (ecies.rs ~line 401)**

Delete the test function `v2_produces_different_key_than_v1` (lines 400–407 of `ecies.rs`) entirely. It calls `derive_ecies_key_v1` which no longer exists.

- [ ] **Step 9: Convert `v1_ciphertext_decryptable_with_fallback` to a negative test**

Replace the test at `ecies.rs:409-453` with a test that asserts v1-format envelopes now hard-fail:

```rust
#[test]
fn v1_ciphertext_rejected() {
    use k256::ecdh::EphemeralSecret;
    use rand::rngs::OsRng;

    // Create a v1-format envelope: no version byte prefix
    let sk = SecretKey::random(&mut OsRng);
    let pk = sk.public_key();
    let pk_encoded = pk.to_encoded_point(true);
    let xonly_hex = hex::encode(&pk_encoded.as_bytes()[1..]);
    let sk_hex = hex::encode(sk.to_bytes());

    let ephemeral_secret = EphemeralSecret::random(&mut OsRng);
    let ephemeral_public = ephemeral_secret.public_key();

    let recipient_compressed = xonly_to_compressed(&xonly_hex).unwrap();
    let recipient_pubkey = PublicKey::from_sec1_bytes(&recipient_compressed).unwrap();
    let shared_point = ephemeral_secret.diffie_hellman(&recipient_pubkey);
    let mut shared_x = [0u8; 32];
    shared_x.copy_from_slice(shared_point.raw_secret_bytes());

    // Simulate v1 ciphertext: nonce + encrypted payload, NO version byte
    let some_key = random_bytes_32();
    let nonce_bytes = random_nonce();
    let nonce = XNonce::from_slice(&nonce_bytes);
    // Use dummy key (v1-style SHA-256 derived) — doesn't matter, version byte is checked first
    let dummy_key = [0x42u8; 32];
    let cipher = XChaCha20Poly1305::new_from_slice(&dummy_key).unwrap();
    let ciphertext = cipher.encrypt(nonce, some_key.as_ref()).unwrap();
    let mut packed = Vec::with_capacity(24 + ciphertext.len());
    packed.extend_from_slice(&nonce_bytes);
    packed.extend_from_slice(&ciphertext);

    let ephemeral_encoded = ephemeral_public.to_encoded_point(true);
    let v1_envelope = KeyEnvelope {
        wrapped_key: hex::encode(&packed),
        ephemeral_pubkey: hex::encode(ephemeral_encoded.as_bytes()),
    };

    let result = ecies_unwrap_key(&v1_envelope, &sk_hex, LABEL_NOTE_KEY);
    assert!(
        matches!(result, Err(CryptoError::InvalidFormat(_))),
        "Expected InvalidFormat for v1 envelope, got: {:?}",
        result
    );
}
```

- [ ] **Step 10: Convert `v1_content_decrypts_with_fallback` to a negative test**

Replace the test at `ecies.rs:582-620` with a test that asserts v1-format content now hard-fails:

```rust
#[test]
fn v1_content_rejected() {
    use k256::ecdh::EphemeralSecret;
    use rand::rngs::OsRng;

    let recipient_sk = SecretKey::random(&mut OsRng);
    let recipient_pk = recipient_sk.public_key();
    let recipient_pk_encoded = recipient_pk.to_encoded_point(true);
    let recipient_xonly_hex = hex::encode(&recipient_pk_encoded.as_bytes()[1..]);
    let recipient_sk_hex = hex::encode(recipient_sk.to_bytes());
    let label = "llamenos:transcription";

    let ephemeral_secret = EphemeralSecret::random(&mut OsRng);
    let ephemeral_public = ephemeral_secret.public_key();
    let recipient_compressed = xonly_to_compressed(&recipient_xonly_hex).unwrap();
    let recipient_pubkey = PublicKey::from_sec1_bytes(&recipient_compressed).unwrap();

    let shared_point = ephemeral_secret.diffie_hellman(&recipient_pubkey);
    let mut shared_x = [0u8; 32];
    shared_x.copy_from_slice(shared_point.raw_secret_bytes());

    // Produce v1-format content: nonce + ciphertext, NO version byte
    let dummy_key = [0x42u8; 32];
    let nonce_bytes = random_nonce();
    let nonce = XNonce::from_slice(&nonce_bytes);
    let cipher = XChaCha20Poly1305::new_from_slice(&dummy_key).unwrap();
    let ciphertext = cipher.encrypt(nonce, b"Legacy content".as_ref()).unwrap();
    let mut packed = Vec::with_capacity(24 + ciphertext.len());
    packed.extend_from_slice(&nonce_bytes);
    packed.extend_from_slice(&ciphertext);
    let packed_hex = hex::encode(&packed);

    let ephemeral_encoded = ephemeral_public.to_encoded_point(true);
    let ephemeral_hex = hex::encode(ephemeral_encoded.as_bytes());

    let result =
        ecies_decrypt_content(&packed_hex, &ephemeral_hex, &recipient_sk_hex, label);
    assert!(
        matches!(result, Err(CryptoError::InvalidFormat(_))),
        "Expected InvalidFormat for v1 content, got: {:?}",
        result
    );
}
```

- [ ] **Step 11: Update `ecies_decrypt_content_via_ffi` test in `ffi.rs` — make it confirm v1 hard-fails and add v2 positive test**

The existing test at `ffi.rs:467-520` constructs ciphertext using `Sha256::digest(label || shared_x)` (v1-style KDF, no version byte). Replace it with two tests:

```rust
#[test]
fn ecies_decrypt_content_via_ffi_v1_hard_fails() {
    use chacha20poly1305::{
        aead::{Aead, KeyInit},
        XChaCha20Poly1305, XNonce,
    };
    use k256::{ecdh::EphemeralSecret, elliptic_curve::sec1::ToEncodedPoint};
    use rand::rngs::OsRng;

    let recipient = generate_keypair();
    let label = crate::labels::LABEL_PUSH_WAKE;
    let content = r#"{"type":"call","callId":"abc123"}"#;

    // Construct v1-style ciphertext (no version byte) using SHA-256 KDF
    let ephemeral = EphemeralSecret::random(&mut OsRng);
    let ephemeral_pub = ephemeral.public_key();
    let compressed = {
        let mut c = vec![0x02u8];
        c.extend_from_slice(&hex::decode(&recipient.public_key).unwrap());
        c
    };
    let recipient_pk = k256::PublicKey::from_sec1_bytes(&compressed).unwrap();
    let shared_point = ephemeral.diffie_hellman(&recipient_pk);
    let mut shared_x = [0u8; 32];
    shared_x.copy_from_slice(shared_point.raw_secret_bytes());

    // v1 KDF: SHA-256(label || shared_x)
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(label.as_bytes());
    hasher.update(&shared_x);
    let sym_key: [u8; 32] = hasher.finalize().into();

    let mut nonce_bytes = [0u8; 24];
    getrandom::getrandom(&mut nonce_bytes).unwrap();
    let nonce = XNonce::from_slice(&nonce_bytes);
    let cipher = XChaCha20Poly1305::new_from_slice(&sym_key).unwrap();
    let ct = cipher.encrypt(nonce, content.as_bytes()).unwrap();

    // Pack WITHOUT version byte (v1 format)
    let mut packed = Vec::with_capacity(24 + ct.len());
    packed.extend_from_slice(&nonce_bytes);
    packed.extend_from_slice(&ct);
    let packed_hex = hex::encode(&packed);

    let eph_encoded = ephemeral_pub.to_encoded_point(true);
    let eph_hex = hex::encode(eph_encoded.as_bytes());

    let result =
        ecies_decrypt_content_hex(&packed_hex, &eph_hex, &recipient.secret_key_hex, label);
    assert!(
        matches!(result, Err(CryptoError::InvalidFormat(_))),
        "Expected v1 FFI content to hard-fail, got: {:?}",
        result
    );
}

#[test]
fn ecies_decrypt_content_via_ffi_v2_roundtrip() {
    use crate::ecies::ecies_encrypt_content;
    use k256::SecretKey;
    use rand::rngs::OsRng;

    let sk = SecretKey::random(&mut OsRng);
    let pk = sk.public_key();
    let pk_encoded = pk.to_encoded_point(true);
    let xonly_hex = hex::encode(&pk_encoded.as_bytes()[1..]);
    let sk_hex = hex::encode(sk.to_bytes());

    let label = crate::labels::LABEL_PUSH_WAKE;
    let content = r#"{"type":"call","callId":"abc123"}"#;

    let (packed_hex, eph_hex) = ecies_encrypt_content(content, &xonly_hex, label).unwrap();
    let decrypted =
        ecies_decrypt_content_hex(&packed_hex, &eph_hex, &sk_hex, label).unwrap();
    assert_eq!(decrypted, content);
}
```

Note: `ecies_encrypt_content` must be accessible from `ffi.rs` tests. Check its visibility in `ecies.rs` — if it's `pub`, it's available via `crate::ecies::ecies_encrypt_content`. If not, make it `pub` or add `pub(crate)`.

- [ ] **Step 12: Add the cross-platform integration test for CRIT-C3 provisioning round-trip**

Add a new test in `packages/crypto/src/provisioning.rs` (in the existing `#[cfg(test)] mod tests` block, or create it):

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::keys::generate_keypair;

    /// CRIT-C3 integration test: encrypt_nsec_for_provisioning → decrypt_with_shared_key_hex
    /// (i.e., provisioning.rs HKDF path → ffi.rs HKDF path, same KDF, same result)
    #[test]
    fn provisioning_round_trip_unified_kdf() {
        use crate::ffi::{compute_shared_x_hex, decrypt_with_shared_key_hex};
        use k256::{ecdh::EphemeralSecret, elliptic_curve::sec1::ToEncodedPoint};
        use rand::rngs::OsRng;

        // Primary device: has the nsec
        let primary = generate_keypair();

        // New device: generates ephemeral keypair
        let ephemeral_sk = EphemeralSecret::random(&mut OsRng);
        let ephemeral_pk = ephemeral_sk.public_key();
        let ephemeral_pk_encoded = ephemeral_pk.to_encoded_point(true);
        let ephemeral_pk_hex = hex::encode(ephemeral_pk_encoded.as_bytes());

        // Primary encrypts nsec for provisioning
        let result = encrypt_nsec_for_provisioning(
            &primary.nsec,
            &primary.secret_key_hex,
            &ephemeral_pk_hex,
        )
        .unwrap();

        // New device computes shared_x via FFI (same path as mobile would use)
        let ephemeral_sk_hex = hex::encode(ephemeral_sk.to_bytes());
        let shared_x_hex = compute_shared_x_hex(&ephemeral_sk_hex, &primary.public_key).unwrap();

        // New device decrypts via FFI path (must use same HKDF KDF now)
        let decrypted_nsec =
            decrypt_with_shared_key_hex(&result.encrypted_hex, &shared_x_hex).unwrap();
        assert_eq!(decrypted_nsec, primary.nsec, "Recovered nsec must match original");
    }

    /// Negative: encrypt with HKDF (provisioning.rs), attempt decrypt with SHA-256 concat → Err
    #[test]
    fn provisioning_kdf_mismatch_fails() {
        use k256::{ecdh::EphemeralSecret, elliptic_curve::sec1::ToEncodedPoint};
        use rand::rngs::OsRng;
        use sha2::{Digest, Sha256};
        use chacha20poly1305::{aead::{Aead, KeyInit}, XChaCha20Poly1305, XNonce};
        use crate::labels::LABEL_DEVICE_PROVISION;

        let primary = generate_keypair();
        let ephemeral_sk = EphemeralSecret::random(&mut OsRng);
        let ephemeral_pk = ephemeral_sk.public_key();
        let ephemeral_pk_encoded = ephemeral_pk.to_encoded_point(true);
        let ephemeral_pk_hex = hex::encode(ephemeral_pk_encoded.as_bytes());

        // Encrypt using provisioning HKDF
        let result = encrypt_nsec_for_provisioning(
            &primary.nsec,
            &primary.secret_key_hex,
            &ephemeral_pk_hex,
        )
        .unwrap();

        // Attempt decrypt using SHA-256 concat (old incorrect KDF)
        let ephemeral_sk_hex = hex::encode(ephemeral_sk.to_bytes());
        let sk_bytes = hex::decode(&ephemeral_sk_hex).unwrap();
        let primary_pk_bytes = {
            let mut c = vec![0x02u8];
            c.extend_from_slice(&hex::decode(&primary.public_key).unwrap());
            c
        };
        let primary_pubkey = k256::PublicKey::from_sec1_bytes(&primary_pk_bytes).unwrap();
        let primary_sk = k256::SecretKey::from_slice(&sk_bytes).unwrap();

        use k256::Secp256k1;
        use elliptic_curve::ecdh::SharedSecret;
        let shared: SharedSecret<Secp256k1> = k256::ecdh::diffie_hellman(
            primary_sk.to_nonzero_scalar(),
            primary_pubkey.as_affine(),
        );
        let mut shared_x = [0u8; 32];
        shared_x.copy_from_slice(shared.raw_secret_bytes());

        // Derive key with SHA-256 concat (wrong KDF)
        let mut hasher = Sha256::new();
        hasher.update(LABEL_DEVICE_PROVISION.as_bytes());
        hasher.update(&shared_x);
        let wrong_key: [u8; 32] = hasher.finalize().into();

        let data = hex::decode(&result.encrypted_hex).unwrap();
        let nonce = XNonce::from_slice(&data[..24]);
        let cipher = XChaCha20Poly1305::new_from_slice(&wrong_key).unwrap();
        let decrypt_result = cipher.decrypt(nonce, &data[24..]);
        assert!(decrypt_result.is_err(), "SHA-256 KDF must NOT decrypt HKDF-encrypted ciphertext");
    }
}
```

Note: `encrypt_nsec_for_provisioning` must be importable here. Check its visibility in `provisioning.rs` — if it's `pub`, use `use super::encrypt_nsec_for_provisioning;` inside the test module. If it's `pub(crate)`, it's accessible from within the crate.

- [ ] **Step 13: Run all tests to confirm everything compiles and passes**

```bash
cargo test --manifest-path packages/crypto/Cargo.toml
```

Expected: All tests pass. No `derive_ecies_key_v1` or `ecies_unwrap_key_versioned` references remain.

```bash
cargo clippy --manifest-path packages/crypto/Cargo.toml -- -D warnings
```

Expected: No warnings.

- [ ] **Step 14: Commit the atomic CRIT fix**

```bash
git add packages/crypto/src/ecies.rs packages/crypto/src/provisioning.rs packages/crypto/src/ffi.rs packages/crypto/src/errors.rs
git commit -m "$(cat <<'EOF'
security(crypto): CRIT-C1/C2/C3 — ECIES salt, v1 removal, provisioning KDF unification

- CRIT-C1: derive_ecies_key_v2 now uses ECIES_V2_HKDF_SALT ("llamenos:ecies:v2")
  instead of None (zero-block) — eliminates fully deterministic PRK
- CRIT-C2: delete derive_ecies_key_v1 and ecies_unwrap_key_versioned; collapse
  ecies_unwrap_key to v2-only; remove v1 fallback from ecies_decrypt_content;
  v1-format ciphertext now returns Err(InvalidFormat) in all paths
- CRIT-C3: derive_provisioning_key is pub(crate) with PROVISIONING_HKDF_SALT
  ("llamenos:provisioning:v1"); decrypt_with_shared_key_hex in ffi.rs calls
  provisioning::derive_provisioning_key instead of SHA-256 concat — device
  linking is now functional
- Add cross-platform provisioning round-trip integration test + KDF mismatch
  negative test
- Convert v1 fallback tests to negative tests asserting Err(InvalidFormat)

Pre-production: no encrypted data migration needed.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: HIGH-C1 + HIGH-C2 — Zeroize intermediate key material in `keys.rs` and `encryption.rs`

**Spec refs**: HIGH-C1, HIGH-C2

**Files:**
- Modify: `packages/crypto/src/keys.rs`
- Modify: `packages/crypto/src/encryption.rs`

**Background**: `KeyPair.secret_key_hex` is a plain `String` — it must become `Zeroizing<String>`. Intermediate byte buffers (`sk_bytes`, `data`) in the three keygen functions are dropped without explicit zeroization. In `encryption.rs`, `note_key` and `message_key` are manually zeroized at the end of their functions — panics between allocation and the `zeroize()` call leave key material in memory. `Zeroizing::new()` provides drop-based zeroization on all exit paths including panics.

- [ ] **Step 1: Add `Zeroizing` import to `keys.rs`**

In `packages/crypto/src/keys.rs`, add to the existing use declarations:

```rust
use zeroize::Zeroizing;
```

- [ ] **Step 2: Change `KeyPair.secret_key_hex` to `Zeroizing<String>`**

Change the struct field (line 18):

```rust
// Before:
pub secret_key_hex: String,

// After:
pub secret_key_hex: Zeroizing<String>,
```

Note: `Zeroizing<String>` derefs to `&str` via `Deref<Target = String>` → `Deref<Target = str>`. Call sites that use `kp.secret_key_hex.as_str()`, `&*kp.secret_key_hex`, or `&kp.secret_key_hex` (as `&String`) require no API change for internal Rust callers. However, the `uniffi::Record` derive for the `mobile` feature will fail because UniFFI cannot serialize `Zeroizing<String>` — this is intentional: Task 3 replaces the mobile-facing return type entirely with `PublicKeyPair`. For now, simply remove the `#[cfg_attr(feature = "mobile", derive(uniffi::Record))]` from `KeyPair` if it exists; Task 3 adds `PublicKeyPair` as the mobile return type.

- [ ] **Step 3: Zeroize intermediate buffers in `generate_keypair`**

Current code (lines 30–52): `sk_bytes` is a `GenericArray` from `sk.to_bytes()`, used to encode `secret_key_hex` and `nsec`, then implicitly dropped without zeroization.

Wrap with `Zeroizing::new()`:

```rust
pub fn generate_keypair() -> KeyPair {
    let sk = SecretKey::random(&mut OsRng);
    let pk = sk.public_key();

    let sk_bytes = Zeroizing::new(sk.to_bytes()); // zeroized on drop
    let pk_point = pk.to_encoded_point(true);
    let pk_compressed = pk_point.as_bytes();
    let pk_xonly = &pk_compressed[1..];

    let secret_key_hex = Zeroizing::new(hex::encode(&*sk_bytes));
    let public_key = hex::encode(pk_xonly);

    let nsec = bech32::encode::<Bech32>(Hrp::parse("nsec").unwrap(), &*sk_bytes)
        .expect("bech32 encode nsec");
    let npub = bech32::encode::<Bech32>(Hrp::parse("npub").unwrap(), pk_xonly)
        .expect("bech32 encode npub");

    KeyPair {
        secret_key_hex,
        public_key,
        nsec,
        npub,
    }
}
```

- [ ] **Step 4: Zeroize intermediate buffers in `keypair_from_nsec`**

Current code (lines 57–82): `data` (raw decoded bech32 bytes) is used to create `sk` and encode `secret_key_hex`, then dropped without zeroization.

```rust
pub fn keypair_from_nsec(nsec: &str) -> Result<KeyPair, CryptoError> {
    let (hrp, data) = bech32::decode(nsec).map_err(|_| CryptoError::InvalidNsec)?;
    if hrp.as_str() != "nsec" || data.len() != 32 {
        return Err(CryptoError::InvalidNsec);
    }
    let data = Zeroizing::new(data); // zeroize the decoded key bytes on drop

    let sk = SecretKey::from_slice(&*data).map_err(|_| CryptoError::InvalidSecretKey)?;
    let pk = sk.public_key();

    let pk_point = pk.to_encoded_point(true);
    let pk_compressed = pk_point.as_bytes();
    let pk_xonly = &pk_compressed[1..];

    let secret_key_hex = Zeroizing::new(hex::encode(&*data));
    let public_key = hex::encode(pk_xonly);

    let npub = bech32::encode::<Bech32>(Hrp::parse("npub").unwrap(), pk_xonly)
        .expect("bech32 encode npub");

    Ok(KeyPair {
        secret_key_hex,
        public_key,
        nsec: nsec.to_string(),
        npub,
    })
}
```

- [ ] **Step 5: Zeroize intermediate buffers in `keypair_from_secret_key_hex`**

Current code (lines 86–113): `sk_bytes` from `hex::decode` is used for `SecretKey::from_slice` and re-encoded into `secret_key_hex`, then dropped without zeroization.

```rust
pub fn keypair_from_secret_key_hex(secret_key_hex: &str) -> Result<KeyPair, CryptoError> {
    let sk_bytes = Zeroizing::new(hex::decode(secret_key_hex).map_err(CryptoError::HexError)?);
    if sk_bytes.len() != 32 {
        return Err(CryptoError::InvalidSecretKey);
    }

    let sk = SecretKey::from_slice(&*sk_bytes).map_err(|_| CryptoError::InvalidSecretKey)?;
    let pk = sk.public_key();

    let pk_point = pk.to_encoded_point(true);
    let pk_compressed = pk_point.as_bytes();
    let pk_xonly = &pk_compressed[1..];

    let secret_key_hex = Zeroizing::new(hex::encode(&*sk_bytes));
    let public_key = hex::encode(pk_xonly);

    let nsec = bech32::encode::<Bech32>(Hrp::parse("nsec").unwrap(), &*sk_bytes)
        .expect("bech32 encode nsec");
    let npub = bech32::encode::<Bech32>(Hrp::parse("npub").unwrap(), pk_xonly)
        .expect("bech32 encode npub");

    Ok(KeyPair {
        secret_key_hex,
        public_key,
        nsec,
        npub,
    })
}
```

- [ ] **Step 6: Update existing `keys.rs` tests that access `secret_key_hex`**

The existing tests compare `kp.secret_key_hex` as a `&str` or `String`. `Zeroizing<String>` implements `PartialEq<String>` and `PartialEq<str>` through deref, so assertions like `assert_eq!(kp.secret_key_hex, restored.secret_key_hex)` should compile. Run the tests to verify:

```bash
cargo test --manifest-path packages/crypto/Cargo.toml keys
```

Expected: All `keys` module tests pass. Fix any type mismatch errors (e.g., add `&*` or `.as_str()` where needed).

- [ ] **Step 7: Wrap `note_key` in `encryption.rs::encrypt_note` with `Zeroizing::new()`**

In `packages/crypto/src/encryption.rs`, `encrypt_note` currently (lines 49–93):

```rust
// Before:
let mut note_key = random_bytes_32();
// ... use note_key ...
note_key.zeroize(); // at line 86

// After:
let note_key = Zeroizing::new(random_bytes_32());
// note_key zeroizes on all exit paths (normal, ?, panic)
// Remove the explicit note_key.zeroize() call — drop handles it
```

Update the ECIES wrap calls to use `&*note_key` (dereferences `Zeroizing<[u8; 32]>` to `[u8; 32]`):

```rust
let author_envelope = ecies_wrap_key(&*note_key, author_pubkey, LABEL_NOTE_KEY)?;
// and in the map closure:
let env = ecies_wrap_key(&*note_key, pk, LABEL_NOTE_KEY)?;
```

Remove the explicit `note_key.zeroize()` call — `Zeroizing` handles zeroization on drop.

Also add `use zeroize::Zeroizing;` to the imports in `encryption.rs` if not already present.

- [ ] **Step 8: Wrap `message_key` in `encryption.rs::encrypt_message` with `Zeroizing::new()`**

Same pattern as Step 7, in `encrypt_message` (lines 138–178):

```rust
// Before:
let mut message_key = random_bytes_32();
// ... use message_key ...
message_key.zeroize(); // at line 172

// After:
let message_key = Zeroizing::new(random_bytes_32());
// Remove the explicit message_key.zeroize() call
```

Update the wrap calls:

```rust
let env = ecies_wrap_key(&*message_key, pk, LABEL_MESSAGE)?;
```

- [ ] **Step 9: Run full test suite**

```bash
cargo test --manifest-path packages/crypto/Cargo.toml
```

Expected: All tests pass.

```bash
cargo clippy --manifest-path packages/crypto/Cargo.toml -- -D warnings
```

Expected: Clean. If clippy warns about unused `mut` on `note_key` or `message_key`, that's expected — remove the `mut` binding.

- [ ] **Step 10: Commit**

```bash
git add packages/crypto/src/keys.rs packages/crypto/src/encryption.rs
git commit -m "$(cat <<'EOF'
security(crypto): HIGH-C1/C2 — zeroize key material in KeyPair and encryption fns

- HIGH-C1: secret_key_hex changed to Zeroizing<String>; sk_bytes/data intermediate
  buffers in generate_keypair, keypair_from_nsec, keypair_from_secret_key_hex
  wrapped in Zeroizing::new() for drop-based zeroization on all exit paths
- HIGH-C2: note_key and message_key wrapped in Zeroizing::new() — eliminates
  window where a panic between allocation and explicit .zeroize() call would
  leave key material in heap memory

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: HIGH-C3 — `PublicKeyPair` type — remove `secret_key_hex` from UniFFI FFI boundary

**Spec refs**: HIGH-C3

**Files:**
- Modify: `packages/crypto/src/keys.rs`

**Background**: When `feature = "mobile"`, `KeyPair` derives `uniffi::Record` and exposes `secret_key_hex` and `nsec` to Swift/Kotlin as plain strings. CLAUDE.md requires the nsec to never leave the service layer. The fix creates a separate `PublicKeyPair` type with only public fields, and replaces the three UniFFI-exported keygen functions with mobile shims that return `PublicKeyPair`.

**Epic 5 coordination note (HIGH-D3)**: This is a breaking change for iOS and Android callers. Any Swift/Kotlin code that currently reads `kp.secretKeyHex` or `kp.nsec` from these FFI functions will no longer compile after this change. Coordinate with Epic 5 (iOS/Android mobile client security remediation) before merging to a branch that iOS/Android builds against. The internal `KeyPair` type continues to exist for non-FFI callers (WASM, native Tauri).

- [ ] **Step 1: Add `PublicKeyPair` struct to `keys.rs`**

Add after the existing `KeyPair` struct definition:

```rust
/// Mobile-safe keypair type — excludes secret key material.
///
/// Returned by UniFFI-exported keygen functions. The secret key never crosses
/// the FFI boundary; callers use the stateful loadKey/loadKeyFromNsec pattern.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "mobile", derive(uniffi::Record))]
pub struct PublicKeyPair {
    /// hex-encoded 32-byte x-only public key
    pub public_key: String,
    /// bech32-encoded public key (npub1...)
    pub npub: String,
}
```

- [ ] **Step 2: Remove `uniffi::Record` from `KeyPair` and add mobile shim functions**

Remove `#[cfg_attr(feature = "mobile", derive(uniffi::Record))]` from `KeyPair` — it should no longer be exported over UniFFI. The internal `KeyPair` type is still used by WASM and native code.

Rename the three internal keygen functions to `internal_*` variants, then add `cfg`-gated public shims that keep the original names:

```rust
// Internal versions — no FFI, used by WASM and native callers:
fn internal_generate_keypair() -> Result<KeyPair, CryptoError> { /* existing body */ }
fn internal_keypair_from_nsec(nsec: &str) -> Result<KeyPair, CryptoError> { /* existing body */ }
fn internal_keypair_from_secret_key_hex(secret_key_hex: &str) -> Result<KeyPair, CryptoError> { /* existing body */ }

// Mobile FFI exports — same original names, return PublicKeyPair (no secret material):
#[cfg(feature = "mobile")]
#[uniffi::export]
pub fn generate_keypair() -> Result<PublicKeyPair, CryptoError> {
    let kp = internal_generate_keypair()?;
    Ok(PublicKeyPair { public_key: kp.public_key, npub: kp.npub })
}

#[cfg(not(feature = "mobile"))]
pub fn generate_keypair() -> Result<KeyPair, CryptoError> {
    internal_generate_keypair()
}

#[cfg(feature = "mobile")]
#[uniffi::export]
pub fn keypair_from_nsec(nsec: &str) -> Result<PublicKeyPair, CryptoError> {
    let kp = internal_keypair_from_nsec(nsec)?;
    Ok(PublicKeyPair { public_key: kp.public_key, npub: kp.npub })
}

#[cfg(not(feature = "mobile"))]
pub fn keypair_from_nsec(nsec: &str) -> Result<KeyPair, CryptoError> {
    internal_keypair_from_nsec(nsec)
}

#[cfg(feature = "mobile")]
#[uniffi::export]
pub fn keypair_from_secret_key_hex(
    secret_key_hex: &str,
) -> Result<PublicKeyPair, CryptoError> {
    let kp = internal_keypair_from_secret_key_hex(secret_key_hex)?;
    Ok(PublicKeyPair { public_key: kp.public_key, npub: kp.npub })
}

#[cfg(not(feature = "mobile"))]
pub fn keypair_from_secret_key_hex(secret_key_hex: &str) -> Result<KeyPair, CryptoError> {
    internal_keypair_from_secret_key_hex(secret_key_hex)
}
```

The spec requires the original function names at the UniFFI boundary so that Swift/Kotlin callers see `generateKeypair`, `keypairFromNsec`, and `keypairFromSecretKeyHex` — not `_mobile`-suffixed names. The `internal_*` rename is purely crate-internal; all existing callers within the crate (tests, WASM path, native path) must be updated to call `internal_generate_keypair()` etc.

Also remove the `#[cfg_attr(feature = "mobile", uniffi::export)]` attributes from the original function definitions — the `cfg`-gated shims above replace them at the mobile FFI boundary.

- [ ] **Step 3: Build with `mobile` feature to verify**

```bash
cargo build --manifest-path packages/crypto/Cargo.toml --features mobile
```

Expected: Compiles cleanly. `PublicKeyPair` has no `secret_key_hex` or `nsec` fields. The internal `KeyPair` type still compiles.

- [ ] **Step 4: Confirm `secret_key_hex` is absent from UniFFI-exported types**

The UniFFI bindings are checked-in at `packages/crypto/bindings/`. After this change you should regenerate them if the project has a codegen step, or at minimum verify the existing bindings don't compile against `KeyPair` with `secret_key_hex`. Run:

```bash
cargo test --manifest-path packages/crypto/Cargo.toml --features mobile
```

Expected: All tests pass. If UniFFI checksums in the generated bindings need updating, follow the project's binding regeneration process (check `packages/crypto/scripts/` or project `bun run` scripts).

- [ ] **Step 5: Run full test suite**

```bash
cargo test --manifest-path packages/crypto/Cargo.toml
cargo test --manifest-path packages/crypto/Cargo.toml --features mobile
```

Expected: All tests pass in both feature configurations.

- [ ] **Step 6: Commit**

```bash
git add packages/crypto/src/keys.rs
git commit -m "$(cat <<'EOF'
security(crypto): HIGH-C3 — PublicKeyPair type hides secret_key_hex from UniFFI boundary

Introduce PublicKeyPair (public_key + npub only) as the mobile FFI return type.
Add generate_keypair_mobile, keypair_from_nsec_mobile, and
keypair_from_secret_key_hex_mobile shims that return PublicKeyPair.
Remove uniffi::Record from KeyPair — secret_key_hex never crosses the FFI
boundary to Swift/Kotlin callers.

NOTE: Breaking change for iOS/Android. Coordinate with Epic 5 before
merging to a branch iOS/Android builds against.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: HIGH-C4 — Remove `derive_kek_hex` UniFFI export

**Spec refs**: HIGH-C4

**Files:**
- Modify: `packages/crypto/src/ffi.rs`

**Background**: `derive_kek_hex` is exported via `#[uniffi::export]` and accepts any string as a PIN with no validation. `is_valid_pin` (6–8 ASCII digits) is only called inside `encrypt_with_pin`. No mobile code calls `derive_kek_hex` directly (confirmed in the spec). Option A: remove the export entirely.

- [ ] **Step 1: Remove `#[uniffi::export]` from `derive_kek_hex`**

In `packages/crypto/src/ffi.rs`, at line 114, change:

```rust
// Before:
#[uniffi::export]
pub fn derive_kek_hex(pin: &str, salt_hex: &str) -> Result<String, CryptoError> {

// After:
pub(crate) fn derive_kek_hex(pin: &str, salt_hex: &str) -> Result<String, CryptoError> {
```

Making it `pub(crate)` (rather than deleting) preserves its availability for tests in `ffi.rs`. The function's test coverage (tests that call `derive_kek_hex("1234", ...)` around line 374) will still compile.

Note: Alternatively, if the tests should be updated to call `encrypt_with_pin`/`decrypt_with_pin` instead, convert them — but preserving as `pub(crate)` with the existing tests is the minimal safe change.

- [ ] **Step 2: Verify `derive_kek_hex` is absent from UniFFI exports**

```bash
cargo build --manifest-path packages/crypto/Cargo.toml --features mobile 2>&1 | grep -i "derive_kek"
```

Expected: No output (function no longer exported).

Also verify the existing Kotlin/Swift bindings at `packages/crypto/bindings/` no longer reference `derive_kek_hex` after a binding regeneration — or note that the checked-in bindings are stale and will be regenerated by the build pipeline.

- [ ] **Step 3: Run tests to confirm existing PIN tests still pass**

```bash
cargo test --manifest-path packages/crypto/Cargo.toml
```

Expected: All tests pass. The PIN-related tests using `derive_kek_hex` directly (as a `pub(crate)` function) still compile.

- [ ] **Step 4: Commit**

```bash
git add packages/crypto/src/ffi.rs
git commit -m "$(cat <<'EOF'
security(crypto): HIGH-C4 — remove derive_kek_hex from UniFFI export

Change derive_kek_hex from pub fn with #[uniffi::export] to pub(crate) fn.
All PIN-based operations on mobile go through encrypt_with_pin / decrypt_with_pin,
which enforce is_valid_pin. No mobile code called derive_kek_hex directly.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: HIGH-C5 — Remove `get_nsec` WASM export and update callers in `platform.ts`

**Spec refs**: HIGH-C5

**Files:**
- Modify: `packages/crypto/src/wasm.rs`
- Modify: `src/client/lib/platform.ts`

**Background**: `get_nsec()` returns the nsec as a JavaScript string primitive — immutable, unzeroizable, potentially retained by V8. The function is marked `@deprecated` in `platform.ts`. The `encrypt_nsec_for_provisioning` function handles the provisioning use case without materializing the nsec in JS. The `requestProvisioningToken` function only exists to gate `get_nsec` — it can be removed as well when `get_nsec` goes.

- [ ] **Step 1: Find all callers of `getNsecFromState` in the client code**

```bash
grep -rn "getNsecFromState\|get_nsec_from_state\|getNsec\|request_provisioning_token\|requestProvisioningToken" src/client/
```

Review the output. Based on the codebase search, `getNsecFromState` is exported from `platform.ts` but no active client routes call it (the only references are in old epic docs and the `platform.ts` definition itself). Confirm this before deleting.

- [ ] **Step 2: Delete `get_nsec` and `request_provisioning_token` methods from `wasm.rs`**

In `packages/crypto/src/wasm.rs`, delete the two methods from the `WasmCryptoState` impl block:

- Delete `request_provisioning_token` (lines 481–488, the `#[wasm_bindgen(js_name = "requestProvisioningToken")]` method)
- Delete `get_nsec` (lines 490–507, the `#[wasm_bindgen(js_name = "getNsec")]` method)

Also remove the `provisioning_token` field from `WasmCryptoState` if it's only used by these two methods. Search for all uses of `self.provisioning_token` in `wasm.rs`:

```bash
grep -n "provisioning_token" packages/crypto/src/wasm.rs
```

If only used by the deleted methods, remove the field from the struct definition.

- [ ] **Step 3: Delete `getNsecFromState` from `platform.ts`**

In `src/client/lib/platform.ts`, delete the `getNsecFromState` function (lines 591–602):

```typescript
// Delete this entire function:
/**
 * Get nsec from CryptoState for device provisioning/backup ONLY.
 * @deprecated Use encryptNsecForProvisioning instead — this leaks the nsec into JS.
 */
export async function getNsecFromState(): Promise<string> {
  if (useTauri) {
    const token = await tauriInvoke<string>('request_provisioning_token')
    return tauriInvoke<string>('get_nsec_from_state', { token })
  }
  const state = await getWasmState()
  const token = state.requestProvisioningToken()
  return state.getNsec(token)
}
```

- [ ] **Step 4: Build and typecheck**

```bash
bun run typecheck
```

Expected: No TypeScript errors. If any component imports `getNsecFromState`, it must be updated to use `encryptNsecForProvisioning` instead.

```bash
bun run build
```

Expected: Vite build succeeds (WASM compilation included).

- [ ] **Step 5: Verify `get_nsec` is absent from WASM exports**

```bash
cargo build --manifest-path packages/crypto/Cargo.toml 2>&1 | grep -i "get_nsec"
```

Also run the Playwright test suite to verify provisioning flows still work:

```bash
bun run test
```

Expected: All Playwright tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/crypto/src/wasm.rs src/client/lib/platform.ts
git commit -m "$(cat <<'EOF'
security(crypto): HIGH-C5 — remove get_nsec WASM export and getNsecFromState

Delete get_nsec and requestProvisioningToken from WasmCryptoState. Remove
provisioning_token field from WasmCryptoState. Delete getNsecFromState from
platform.ts. Provisioning flows use encryptNsecForProvisioning instead —
the nsec never materializes as an immutable JS string.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: MED-C1 — Doc comment on `xonly_to_compressed`

**Spec refs**: MED-C1

**Files:**
- Modify: `packages/crypto/src/ecies.rs`

**Background**: `xonly_to_compressed` always prepends `0x02` (even-y). This is correct for BIP-340/Nostr x-only keys. The function name gives no indication of this constraint — a caller using non-BIP-340 keys would silently get the wrong ECDH shared secret for ~50% of keypairs. This is a documentation fix only; no logic change.

- [ ] **Step 1: Add doc comment and `debug_assert` to `xonly_to_compressed`**

In `packages/crypto/src/ecies.rs`, replace the existing function signature/doc for `xonly_to_compressed` (line 96–106):

```rust
// Before:
/// Parse an x-only pubkey hex (32 bytes) into a compressed SEC1 pubkey (prepend 0x02).
fn xonly_to_compressed(xonly_hex: &str) -> Result<Vec<u8>, CryptoError> {
    let x_bytes = hex::decode(xonly_hex).map_err(CryptoError::HexError)?;
    if x_bytes.len() != 32 {
        return Err(CryptoError::InvalidPublicKey);
    }
    let mut compressed = Vec::with_capacity(33);
    compressed.push(0x02);
    compressed.extend_from_slice(&x_bytes);
    Ok(compressed)
}

// After:
/// Converts a 32-byte x-only (BIP-340) public key to SEC1 compressed form.
///
/// # BIP-340 assumption
/// This function always uses the even-y (`0x02`) prefix, which is correct for
/// Nostr/BIP-340 x-only keys where even-y is the canonical form. Do NOT use
/// this function for arbitrary secp256k1 keys where the y-coordinate may be
/// odd — the resulting ECDH shared secret would be wrong for ~50% of such keys.
fn xonly_to_compressed(xonly_hex: &str) -> Result<Vec<u8>, CryptoError> {
    let x_bytes = hex::decode(xonly_hex).map_err(CryptoError::HexError)?;
    debug_assert_eq!(x_bytes.len(), 32, "BIP-340 x-only keys must be exactly 32 bytes");
    if x_bytes.len() != 32 {
        return Err(CryptoError::InvalidPublicKey);
    }
    let mut compressed = Vec::with_capacity(33);
    compressed.push(0x02); // BIP-340 canonical even-y
    compressed.extend_from_slice(&x_bytes);
    Ok(compressed)
}
```

- [ ] **Step 2: Run tests to confirm no regression**

```bash
cargo test --manifest-path packages/crypto/Cargo.toml
```

Expected: All tests pass (doc-only change).

- [ ] **Step 3: Commit**

```bash
git add packages/crypto/src/ecies.rs
git commit -m "$(cat <<'EOF'
docs(crypto): MED-C1 — document BIP-340 even-y assumption in xonly_to_compressed

Add explicit doc comment warning that the 0x02 prefix is correct only for
Nostr/BIP-340 x-only keys. Prevents misuse with arbitrary secp256k1 keys
where y may be odd.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: MED-C2 — Move ephemeral keypair generation into WASM state

**Spec refs**: MED-C2

**Files:**
- Modify: `packages/crypto/src/wasm.rs`
- Modify: `src/client/lib/platform.ts`

**Background**: `decrypt_provisioned_nsec` currently accepts `ephemeral_sk_hex` from JavaScript — the ephemeral secret key protecting the provisioned nsec lives in the JS heap as a string before the WASM call. The fix moves ephemeral keypair generation into WASM and stores the SK in `WasmCryptoState`, so the SK never crosses the WASM boundary.

- [ ] **Step 1: Add `ephemeral_sk` field to `WasmCryptoState`**

In `packages/crypto/src/wasm.rs`, in the `WasmCryptoState` struct definition, add:

```rust
/// Ephemeral secret key for device provisioning — generated in WASM, never exported.
ephemeral_sk: Option<k256::SecretKey>,
```

Also initialize it to `None` in the struct constructor/`new()` function.

- [ ] **Step 2: Add `generateProvisioningEphemeral` WASM method**

Add a new method to the `WasmCryptoState` impl block:

```rust
/// Generate an ephemeral keypair for device provisioning.
///
/// Stores the secret key in WASM state (never exported to JS).
/// Returns only the ephemeral public key hex — send this to the primary device
/// to initiate the provisioning flow.
#[wasm_bindgen(js_name = "generateProvisioningEphemeral")]
pub fn generate_provisioning_ephemeral(&mut self) -> Result<String, JsError> {
    use k256::elliptic_curve::sec1::ToEncodedPoint;
    use rand::rngs::OsRng;

    // Generate a single keypair: store the SK, return only the pubkey hex.
    // A single key is generated — its pubkey is returned, its SK is stored.
    // No EphemeralSecret involved (EphemeralSecret cannot be stored).
    let sk = k256::SecretKey::random(&mut OsRng);
    let pk_bytes = sk.public_key().to_encoded_point(true);
    let pk_hex = hex::encode(pk_bytes.as_bytes());
    self.ephemeral_sk = Some(sk);
    Ok(pk_hex)
}
```

**Implementation note**: `k256::ecdh::EphemeralSecret` does not expose its raw bytes and cannot be stored — and critically, using `EphemeralSecret` to derive the pubkey and then generating a *separate* `k256::SecretKey` for storage would mean the stored SK and the returned pubkey come from two different keypairs, which is cryptographically broken. Always generate a single `k256::SecretKey`, derive the pubkey from it, store the SK, and return the pubkey. The method stores the SK and returns the compressed pubkey hex.

- [ ] **Step 3: Update `decrypt_provisioned_nsec` to remove `ephemeral_sk_hex` parameter**

Replace the existing `decrypt_provisioned_nsec` method (lines 456–477) with a version that reads the SK from state:

```rust
/// Decrypt an nsec provisioned by a primary device.
///
/// Requires `generateProvisioningEphemeral()` to have been called first —
/// the ephemeral SK is read from WASM state (never passed from JS).
///
/// `primary_pubkey_hex`: the primary device's x-only pubkey (hex)
/// `encrypted_hex`: hex(nonce_24 + ciphertext) from the primary device
#[wasm_bindgen(js_name = "decryptProvisionedNsec")]
pub fn decrypt_provisioned_nsec(
    &mut self,
    encrypted_hex: &str,
    primary_pubkey_hex: &str,
) -> Result<JsValue, JsError> {
    let ephemeral_sk = self
        .ephemeral_sk
        .take() // consume: one-time use
        .ok_or_else(|| JsError::new("No ephemeral key — call generateProvisioningEphemeral first"))?;

    let sk_bytes = ephemeral_sk.to_bytes();

    let result = provisioning::decrypt_provisioned_nsec(
        encrypted_hex,
        primary_pubkey_hex,
        &sk_bytes,
    )
    .map_err(to_js_err)?;

    let json = serde_json::json!({
        "nsec": *result.nsec,
        "sasCode": result.sas_code,
    });
    serde_wasm_bindgen::to_value(&json).map_err(to_js_err)
}
```

- [ ] **Step 4: Update `platform.ts` — update `decryptProvisionedNsec` call site**

In `src/client/lib/platform.ts`, find the `decryptProvisionedNsec` wrapper function (around line 568–588). Update it to:

1. Call `generateProvisioningEphemeral()` to get the ephemeral pubkey (no longer passed in from JS)
2. Remove the `ephemeralSkHex` parameter from the function signature

The platform function's callers (provisioning flows in route components) must be updated accordingly — they should call `generateProvisioningEphemeral` separately to get the pubkey to send to the primary device, then call `decryptProvisionedNsec` with only the ciphertext and primary pubkey.

Check current callers:

```bash
grep -rn "decryptProvisionedNsec\|decryptProvisioningNsec" src/client/
```

Update each call site to remove the ephemeral SK argument.

- [ ] **Step 5: Build and typecheck**

```bash
bun run typecheck
bun run build
```

Expected: No TypeScript errors. Vite build succeeds.

- [ ] **Step 6: Verify no `ephemeral_sk_hex` in WASM exports**

Build the WASM target and check the exports:

```bash
cargo build --manifest-path packages/crypto/Cargo.toml
```

Confirm `decryptProvisionedNsec` no longer has an `ephemeral_sk_hex` parameter in the compiled output (check `wasm.rs` directly — the function signature is the source of truth).

- [ ] **Step 7: Run tests**

```bash
cargo test --manifest-path packages/crypto/Cargo.toml
bun run test
```

Expected: All tests pass. Provisioning round-trip tests (from Task 1) still pass via the unified KDF.

- [ ] **Step 8: Commit**

```bash
git add packages/crypto/src/wasm.rs src/client/lib/platform.ts
git commit -m "$(cat <<'EOF'
security(crypto): MED-C2 — ephemeral keypair generation moved into WASM state

Add generateProvisioningEphemeral() to WasmCryptoState — generates ephemeral SK,
stores it in state, returns only the pubkey hex to JS. Update decryptProvisionedNsec
to take the SK from state instead of as a JS string parameter. Ephemeral SK for
device provisioning never crosses the WASM boundary.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Final Verification Checklist

Run these after all tasks are complete:

- [ ] `cargo test --manifest-path packages/crypto/Cargo.toml` — all tests pass
- [ ] `cargo test --manifest-path packages/crypto/Cargo.toml --features mobile` — all tests pass including UniFFI feature
- [ ] `bun run crypto:test:mobile` — Rust crypto tests with mobile FFI
- [ ] `cargo clippy --manifest-path packages/crypto/Cargo.toml -- -D warnings` — no warnings
- [ ] `bun run typecheck` — no TypeScript errors
- [ ] `bun run build` — Vite build succeeds
- [ ] `bun run test` — Playwright E2E tests pass

**Behavioral assertions:**
- [ ] v1-format `wrapped_key` → `ecies_unwrap_key` returns `Err(InvalidFormat)`
- [ ] v1-format content → `ecies_decrypt_content_hex` returns `Err(InvalidFormat)`
- [ ] v2 wrap/unwrap round-trip succeeds with new HKDF salt
- [ ] `encrypt_nsec_for_provisioning` → `decrypt_with_shared_key_hex` round-trip succeeds (CRIT-C3 integration test)
- [ ] `derive_kek_hex` absent from UniFFI bindings (`grep derive_kek_hex packages/crypto/bindings/`)
- [ ] `get_nsec`/`getNsec` absent from WASM exports and `platform.ts`
- [ ] `secret_key_hex` absent from `PublicKeyPair` (the mobile-facing UniFFI type)
- [ ] `grep -rn "getNsecFromState\|get_nsec_from_state" src/client/` returns no results
