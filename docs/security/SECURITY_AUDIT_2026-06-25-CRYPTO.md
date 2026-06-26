# Crypto Crate Security Audit — Wave 3

**Date:** 2026-06-25
**Scope:** `packages/crypto/src/` (all 23 Rust source files, ~11,730 LOC)
**Auditor:** Automated deep audit (Claude Opus 4.6, 5-agent parallel review)
**Previous audit:** 2026-05-18 (wave 1), 2026-06-09 (wave 2)
**Commits since last audit:** 13 crypto-touching commits (HPKE changes, label enforcement, MLS updates, zeroize improvements, BIP-340 fix, FFI cleanup)

---

## Executive Summary

The crypto crate is well-architected with strong foundations: correct HPKE (RFC 9180), proper domain separation (Albrecht defense with 92 labels), handle-based FFI for private keys, and comprehensive test coverage including official BIP-340 vectors. No critical vulnerabilities were found.

The most actionable findings are:
1. **Device wipe commands have no replay protection** (HIGH) — a captured wipe can be replayed indefinitely
2. **SAS verification entropy is borderline** (HIGH) — 42 bits against a nation-state threat model
3. **PIN encryption lacks AAD binding** (MEDIUM) — ciphertext not bound to salt/identity metadata
4. **Stored Argon2 params ignored on unlock** (MEDIUM) — will brick all keys on first param upgrade
5. **test-kdf feature has no release build guard** (MEDIUM) — misconfigured CI could ship weak KDF

**Totals:** 0 CRITICAL, 2 HIGH, 15 MEDIUM, 14 LOW, 2 INFO

---

## HIGH Findings

### H-1: Device wipe command has no replay protection

**File:** `erasure.rs:120-133`
**Impact:** An attacker who captures a legitimate wipe command can replay it indefinitely against the same device, even after re-provisioning.

`verify_erasure_override` correctly checks `current_timestamp_ms` against `max_age_ms` (line 68), but `verify_device_wipe` has no timestamp freshness check at all:

```rust
// erasure.rs:120-133 — no staleness check
pub fn verify_device_wipe(
    admin_pubkey_hex: &str,
    device_id: &str,
    signature_hex: &str,
) -> Result<(), CryptoError> {
    let message = build_device_wipe_message(device_id);
    // No timestamp parameter, no max_age_ms check
    verify_admin_signature(admin_pubkey_hex, &message, signature_hex)
}
```

**Recommendation:** Add `timestamp_ms`, `current_timestamp_ms`, and `max_age_ms` parameters to `verify_device_wipe`, mirroring the `verify_erasure_override` pattern. Bind the timestamp into the signed message.

---

### H-2: SAS verification entropy borderline for nation-state threat model

**File:** `sas.rs:111-127`
**Impact:** The SAS derives 7 emoji indices from 42 bits of entropy (7 x 6-bit values from a 64-element table). A brute-force MITM attack requires ~2^42 (~4.4 trillion) operations to find a colliding key pair — computationally feasible for a well-funded adversary.

```rust
// sas.rs:111-127 — 6 bytes → 7 x 6-bit emoji indices = 42 bits
let mut okm = [0u8; 6];
hk.expand(SAS_INFO.as_bytes(), &mut okm)
    .map_err(|_| CryptoError::InvalidFormat("HKDF expand failed".into()))?;
// Extracts 7 six-bit values from 48 bits (uses 42 of 48)
```

This matches Matrix/TOFU (same 42-bit design), which is considered adequate for interactive verification where both parties compare simultaneously. However, the project's stated threat model includes nation states and private hacking firms.

**Recommendation:** If SAS is always synchronous and interactive, 42 bits is acceptable but borderline — document this limitation explicitly. For stronger protection, increase to 8+ emoji (48 bits) or use a larger emoji table (128 elements = 7 bits per position = 49 bits for 7 emoji).

---

## MEDIUM Findings

### M-1: PIN encryption omits AAD — ciphertext not bound to salt/identity

**File:** `encryption.rs:456-459, 503`
**Impact:** `encrypt_with_pin` calls `cipher.encrypt(nonce, key_material.as_bytes())` without AAD. The ciphertext is not bound to the salt, pubkey hash, or any other metadata in `EncryptedKeyData`. An attacker who can modify stored `EncryptedKeyData` could swap the `salt` field (changing which PIN decrypts) or `pubkey` field (rebinding to a different identity) without AEAD detecting tampering.

```rust
// encryption.rs:459 — no AAD
let ciphertext = cipher
    .encrypt(nonce, key_material.as_bytes())
    .map_err(|e| CryptoError::EncryptionFailed(e.to_string()))?;
```

Compare with `aes256gcm_encrypt` (line 103) which correctly uses `Payload { msg, aad }`.

**Recommendation:** Pass AAD binding salt and pubkey hash: `Payload { msg: key_material.as_bytes(), aad: format!("{}:{}", data.salt, pubkey_hash).as_bytes() }`. Update `decrypt_with_pin` (line 503) correspondingly.

---

### M-2: Stored Argon2 params ignored on unlock — latent data-loss bug

**File:** `device_keys.rs:182, 314-322`
**Impact:** `EncryptedDeviceKeys` serializes the Argon2 params used at encryption time (`argon2_m_cost`, `argon2_t_cost`, `argon2_p_cost`), but `unlock_device_keys` ignores them — `derive_kek` always uses compile-time constants. If params are ever upgraded, all previously-encrypted key blobs become permanently undecryptable.

```rust
// device_keys.rs:314-322 — always uses compile-time constants
fn derive_kek(credential: &str, salt: &[u8]) -> Zeroizing<[u8; 32]> {
    let params = Params::new(
        ARGON2_M_COST_KIB,  // Should use stored params for decryption
        ARGON2_T_COST,
        ARGON2_P_COST,
        Some(32),
    ).expect("valid Argon2 params");
    // ...
}
```

**Recommendation:** `derive_kek` (or `unlock_device_keys`) should accept and use the params from `EncryptedDeviceKeys` when decrypting. Compile-time constants should only govern encryption of new blobs.

---

### M-3: test-kdf feature has no release build guard

**File:** `Cargo.toml:74-78`, `device_keys.rs:37-42`
**Impact:** The `test-kdf` feature reduces Argon2id from 64MB/3iter/4lanes to 1MB/1iter/1lane. No compile-time guard prevents it from being enabled in `--release` builds. A misconfigured CI pipeline could ship release binaries with weak KDF.

**Recommendation:** Add compile-time check:
```rust
#[cfg(all(feature = "test-kdf", not(debug_assertions)))]
compile_error!("test-kdf must not be enabled in release builds");
```

---

### M-4: Deterministic HKDF key derivation for drafts relies solely on random nonce

**File:** `encryption.rs:332-338`
**Impact:** `derive_encryption_key` produces the same AES-256-GCM key for a given (secret_key, label) pair. Security relies entirely on 96-bit random nonce uniqueness. The birthday bound is ~2^48 encryptions before nonce collision becomes probable. While practically unreachable for draft saves, the design is fragile — no counter or key rotation mechanism exists.

**Recommendation:** Document the nonce-reuse bound. Consider adding a generation counter or periodic key rotation for long-lived draft encryption keys.

---

### M-5: Intermediate SigningKey/X25519Secret objects not zeroized on drop

**File:** `device_keys.rs:107-113, 233-234`; `auth.rs:86-91, 121`; `provisioning.rs:143`; `puk.rs:101`
**Impact:** `DeviceSecrets` correctly zeroizes its seed arrays, but calling `secrets.signing_key()` and `secrets.encryption_secret()` creates derived key objects on the caller's stack that are not automatically zeroized. If the function panics or the objects persist, key material remains in memory.

**Recommendation:** Enable the `zeroize` feature on `ed25519-dalek` and `x25519-dalek` in `Cargo.toml` (see M-13). This enables `ZeroizeOnDrop` on their key types.

---

### M-6: Hex-encoded secrets returned as non-zeroizing String across FFI

**File:** `ffi.rs:82-103`; `ffi_v3.rs:72-74, 231-234, 262-268, 297-302, 388-394`
**Impact:** Multiple functions return decrypted secret material as `String` (hex-encoded) across the FFI boundary. Rust `String` is not zeroized on drop. Once the string crosses into Swift/Kotlin managed memory (ARC/GC), there is no guarantee of timely erasure.

**Recommendation:** Use `Zeroizing<String>` on the Rust side. Document zeroize responsibility for all secret-returning FFI functions (not just `EphemeralKeyPair`, which is already documented).

---

### M-7: `mobile_shamir_split` exposes raw secret — bypasses handle pattern

**File:** `ffi.rs:581-589`
**Impact:** Unlike `mobile_recovery_group_split_private_key` (which uses the handle pattern to keep private keys in Rust), `mobile_shamir_split` accepts a raw secret hex string directly over FFI. The secret transits through managed memory before splitting.

**Recommendation:** Restrict `mobile_shamir_split` visibility or document it as for non-key-material use only. The handle-based `mobile_recovery_group_*` flow should be the only path for key secrets.

---

### M-8: `mobile_encrypt_draft` / `mobile_decrypt_draft` hub key hex not zeroized

**File:** `ffi_v3.rs:806-815, 820-829`
**Impact:** Both functions extract the hub key from state, hex-encode it into a plain `String`, then pass it to encrypt/decrypt. The `key_hex` local variable is not zeroized on drop.

**Recommendation:** Use `Zeroizing<String>` for `key_hex`, or pass raw `&[u8; 32]` directly to the encryption functions.

---

### M-9: ShamirShare (UniFFI export) lacks automatic zeroize-on-drop

**File:** `shamir.rs:157-165`
**Impact:** The internal `Share` type correctly implements `Drop` with zeroize, but the UniFFI-exported `ShamirShare` derives `Zeroize` without `ZeroizeOnDrop` (because `Drop` conflicts with `uniffi::Record`). Mobile callers must explicitly call `zeroize()` on shares — if they forget, share data lingers in memory.

**Recommendation:** Document this requirement prominently for mobile consumers. Explore UniFFI's `Disposable` pattern.

---

### M-10: Device can remove itself from sigchain, leaving zero authorized devices

**File:** `sigchain.rs:298-301`
**Impact:** A device can sign a `device_remove` entry removing its own pubkey. If it is the last device, `active_device_pubkeys` becomes empty — no device can sign further entries, leaving the sigchain in an unrecoverable state.

**Recommendation:** After processing `device_remove`, verify `active_pubkeys.len() > 0`.

---

### M-11: No timestamp monotonicity enforcement in sigchain

**File:** `sigchain.rs:254-308`
**Impact:** The verifier enforces `seq` monotonicity but not timestamp monotonicity. A compromised device key could backdate entries, creating confusion about when operations occurred (affecting key validity reasoning on other platforms).

**Recommendation:** Enforce `link.timestamp >= prev_timestamp` during chain verification.

---

### M-12: MLS uses 128-bit ciphersuite, inconsistent with 256-bit stance elsewhere

**File:** `mls.rs:27`
**Impact:** `MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519` provides 128-bit symmetric security. Every other crypto operation in the crate uses AES-256-GCM. While 128-bit is still secure, it is inconsistent with the project's security posture against well-funded adversaries.

**Recommendation:** Use a 256-bit MLS ciphersuite if available in OpenMLS, or document the rationale for the 128-bit choice.

---

### M-13: `ed25519-dalek` and `x25519-dalek` lack `zeroize` feature

**File:** `Cargo.toml:13-17`
**Impact:** Neither dependency has the `zeroize` feature enabled. This means `SigningKey` and `StaticSecret` types do not auto-zeroize on drop, leaving key material in memory.

**Recommendation:** Update Cargo.toml:
```toml
ed25519-dalek = { version = "2", features = ["rand_core", "zeroize"] }
x25519-dalek = { version = "2", features = ["static_secrets", "zeroize"] }
```

---

### M-14: MLS mutex poisoning causes panic

**File:** `mls.rs:122, 173, 239, 255` (multiple)
**Impact:** `self.groups.lock().unwrap()` panics if the mutex is poisoned. In a crypto module, a panic in one thread should not crash all other threads. Particularly relevant for mobile FFI where panics cross the boundary unpredictably.

**Recommendation:** Handle poisoned mutex gracefully by returning `CryptoError` instead of panicking.

---

### M-15: No SFrame counter replay protection in decrypt

**File:** `sframe.rs:300-332`
**Impact:** `sframe_decrypt` does not track or enforce counter monotonicity. An attacker who can replay or reorder encrypted frames can cause audio replay attacks.

**Recommendation:** Provide a stateful decrypt wrapper that maintains per-key_id counter state and rejects frames with counter <= last_seen. At minimum, document that callers must implement replay protection.

---

## LOW Findings

### L-1: HPKE envelope error types break opaque-error design

**File:** `hpke_envelope.rs:178-186`
Base64/key parse errors return `CryptoError::InvalidFormat` and `CryptoError::InvalidEphemeralKey`, distinguishable from `CryptoError::DecryptionFailed`. Minor information leak — violates the stated opaque-error goal at line 151.

### L-2: Manual zeroize on stack keys is not panic-safe

**File:** `encryption.rs:344-355`
`encrypt_draft`/`decrypt_draft`/`encrypt_export` manually call `.zeroize()` after fallible operations. If the operation panics (not just errors), zeroize is skipped. Should use `Zeroizing<[u8; 32]>` wrapper.

### L-3: `plaintext.to_vec()` copies decrypted data outside Zeroizing

**File:** `encryption.rs:216, 290, 326, 381`
Decrypted plaintext is wrapped in `Zeroizing<Vec<u8>>` but then `.to_vec()` creates an unprotected copy for `String::from_utf8()`. The returned `String` is never zeroized either.

### L-4: `ffi_server.rs` error messages include internal details

**File:** `ffi_server.rs:47-53, 94-101`
Error messages include library-internal details (e.g., `"AES-256-GCM init failed: {e}"`). Acceptable for server-side FFI used by trusted backend, but exposes implementation details.

### L-5: `ffi_server.rs` thread-local error buffer not zeroized

**File:** `ffi_server.rs:43-57`
`LAST_ERROR` buffer uses `buf.clear()` (sets length to 0) without zeroizing the underlying allocation. Error messages should not contain secrets, so risk is negligible.

### L-6: `compute_shared_x_hex` returns shared secret as hex String

**File:** `ffi.rs:171-199`
Returns ECDH shared secret as a hex string. The `shared_bytes` array is zeroized, but the returned `String` is not. Intended API behavior for provisioning — caller must clear.

### L-7: Shamir `combine` does not validate threshold lower bound

**File:** `shamir.rs:255-286`
`combine` checks `shares.len() < threshold` but does not validate `threshold >= 2`. A caller could pass `threshold = 1`, bypassing the security guarantee (single share reconstructs secret).

### L-8: Blind index `canonicalize` only strips U+0300..U+036F combining marks

**File:** `blind_index.rs:115-126`
Misses additional Unicode combining mark blocks (U+1AB0-U+1AFF, U+1DC0-U+1DFF, U+20D0-U+20FF, U+FE20-U+FE2F). For Spanish/Latin-script names, the common range suffices, but edge cases produce inconsistent blind indexes.

### L-9: Blind index key material not zeroized after use

**File:** `blind_index.rs:23-39`
`derive_blind_index_key` returns `[u8; 32]` (plain array, not `Zeroizing`). Neither the derived key nor the HMAC state is explicitly zeroized.

### L-10: Non-constant-time `unpad` — potential padding oracle if misused

**File:** `padding.rs:57-69`
`unpad` has data-dependent branches (length check, copy). Safe if only called on authenticated plaintext (post-AEAD), which is the current usage. Would be dangerous if ever called on unauthenticated data.

### L-11: `LABEL_DEVICE_PROVISION` lacks version suffix

**File:** `labels.rs` (label index 14)
Most labels follow `v1` suffix convention. `LABEL_DEVICE_PROVISION` is `"llamenos:device-provision"` without a version suffix, preventing clean protocol versioning.

### L-12: PUK functions return bare `[u8; 32]` seed without Zeroize wrapper

**File:** `puk.rs:123-142, 228-266`
`create_initial_puk` and `decrypt_clkr_link` return raw seed arrays. Callers must manually zeroize. Should return `Zeroizing<[u8; 32]>`.

### L-13: Sigchain payload parsed twice — potential inconsistency

**File:** `sigchain.rs:289`
If `serde_json::from_str` fails on `payload_json`, the `if let Ok(payload)` silently skips device-set updates. Should use the same parsed `Value` from `compute_entry_hash` or make parse failure an error.

### L-14: Erasure `build_erasure_override_message` uses unescaped colon delimiters

**File:** `erasure.rs:30-31`
Message format `{LABEL}:{target_user_id}:{timestamp_ms}:{justification}` uses `:` as delimiter without escaping. If inputs contain colons, messages become ambiguous. Risk is very low given domain constraints.

---

## INFO Findings

### I-1: ed25519-dalek v2 uses ZIP-215 verification (non-strict)

**File:** `sigchain.rs:195`
`verify()` in ed25519-dalek v2 accepts some non-canonical signatures. Not directly exploitable since sigchain signs hash bytes and signatures are stored alongside entries. For maximum security, consider `verify_strict()`.

### I-2: schnorr.rs may be dead code

**File:** `schnorr.rs`
CLAUDE.md states "Legacy secp256k1/Schnorr code has been fully removed" but `schnorr.rs` (BIP-340 over secp256k1) still exists. Verify whether actively used or should be removed to reduce attack surface.

---

## Positive Observations

The following areas demonstrate strong security engineering:

- **HPKE implementation** (`hpke_envelope.rs`): Correct RFC 9180 suite (DHKEM(X25519, HKDF-SHA256) + AES-256-GCM), label used as HPKE `info` parameter, Albrecht defense via `labelId` resolution before HPKE open
- **Domain separation** (`labels.rs`): 92 constants, tombstone handling, bidirectional lookup, CI guard tests enforce sync with `crypto-labels.json`
- **Handle-based FFI** (`ffi.rs:642-676`): Recovery group private key never crosses FFI boundary — stored internally with TTL eviction (5 min) and capacity cap (16 entries)
- **Server FFI validation** (`ffi_server.rs`): Thorough null checks, buffer size validation, 100 MiB input size limits, validated pointer+length pairs before all `unsafe` blocks
- **No `unsafe` in UniFFI layer**: `ffi.rs` and `ffi_v3.rs` contain zero `unsafe` blocks
- **Low-order point rejection** (`provisioning.rs:82-94`): Checks for all-zero DH output, rejects identity point
- **Auth token domain separation** (`auth.rs:46-48`): Method and path bound into signed message, random 16-byte nonces, 30-second clock skew tolerance
- **PUK CLKR AAD binding** (`puk.rs:205-206`): Generation number bound into AAD, preventing cross-generation replay
- **BIP-340 test vectors** (`schnorr.rs`): Official positive and negative test vectors included and passing
- **Argon2id parameters** (`device_keys.rs:30-35`): 64MB/3iter/4lanes — strong for mobile+desktop, properly `cfg`-gated for test builds

---

## Recommendations Priority

### Immediate (before next release)
1. **H-1**: Add replay protection to `verify_device_wipe`
2. **M-1**: Add AAD to PIN encryption/decryption
3. **M-2**: Use stored Argon2 params on unlock
4. **M-3**: Add compile-time guard for `test-kdf` in release builds
5. **M-13**: Enable `zeroize` feature on `ed25519-dalek` and `x25519-dalek`

### Short-term (next sprint)
6. **M-10**: Prevent sigchain self-removal leaving zero devices
7. **M-11**: Enforce timestamp monotonicity in sigchain
8. **M-12**: Evaluate 256-bit MLS ciphersuite
9. **M-15**: Add stateful SFrame counter replay protection
10. **M-14**: Handle MLS mutex poisoning gracefully

### Medium-term (next quarter)
11. **H-2**: Evaluate SAS entropy increase
12. **M-5/M-6**: Systematic zeroize audit across FFI boundary
13. **L-7**: Validate Shamir threshold lower bound in `combine`
14. **I-1**: Evaluate `verify_strict()` for sigchain
15. **I-2**: Determine if `schnorr.rs` is dead code

---

## Methodology

Five parallel audit agents reviewed the crate:
1. **HPKE & Encryption**: `hpke_envelope.rs`, `encryption.rs`, `labels.rs`
2. **Key Derivation & Auth**: `device_keys.rs`, `auth.rs`, `provisioning.rs`, `puk.rs`
3. **FFI Boundaries**: `ffi.rs`, `ffi_server.rs`, `ffi_v3.rs`
4. **Signatures & Protocols**: `schnorr.rs`, `sigchain.rs`, `mls.rs`, `sframe.rs`, `sas.rs`
5. **Supporting Modules**: `lib.rs`, `errors.rs`, `padding.rs`, `erasure.rs`, `shamir.rs`, `blind_index.rs`, `audit_key.rs`, `Cargo.toml`

Cross-cutting findings were deduplicated and severity was reconciled across agents. All findings include file:line references to the audited commit (`d076a731`).
