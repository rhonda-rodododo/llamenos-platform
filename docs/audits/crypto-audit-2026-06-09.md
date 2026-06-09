# Cryptographic Security Audit — `packages/crypto/`

**Date**: 2026-06-09
**Auditor**: Claude Opus 4.6 (automated deep review)
**Scope**: All source files in `packages/crypto/src/` (20+ modules, ~4,500 LOC Rust)
**Branch**: `audit-crypto`
**Severity Scale**: Critical / High / Medium / Low / Informational

---

## Executive Summary

The `packages/crypto/` crate demonstrates **strong cryptographic engineering** overall. The codebase uses well-vetted primitives (ed25519-dalek, x25519-dalek, hpke 0.13, aes-gcm 0.10, argon2 0.5), enforces domain separation via a label registry, applies Zeroize-on-drop for key material, and avoids `unsafe` blocks entirely. Test coverage is extensive, including edge cases, tampered inputs, cross-language vectors, and official BIP-340 test vectors.

**No critical vulnerabilities were found.** Several medium and low severity observations are documented below for hardening.

### Finding Summary

| Severity | Count | Areas |
|----------|-------|-------|
| Critical | 0 | — |
| High | 1 | MLS ciphersuite mismatch with project security level |
| Medium | 4 | Argon2id constant duplication, timing side-channel in version check, encryption seed FFI exposure, sigchain JSON canonicalization |
| Low | 4 | Padding minimum bucket size, SFrame counter overflow, recovery key store capacity, label tombstone documentation |
| Informational | 5 | General observations and commendations |

---

## 1. HPKE Envelope Encryption (`hpke_envelope.rs`)

### 1.1 RFC 9180 Compliance — PASS

The implementation correctly uses:
- **Suite**: DHKEM(X25519, HKDF-SHA256) + HKDF-SHA256 + AES-256-GCM
- **Mode**: Base mode (no PSK, no Auth)
- **Info parameter**: Domain separation label string from the label registry
- **Wire format**: `{v:3, labelId:u8, enc:base64url, ct:base64url}` — clean, versioned

The `OsRng09` adapter correctly bridges `getrandom` 0.2 to `hpke`'s `rand_core` 0.9 interface by implementing `RngCore` and `CryptoRng`. This is a sound approach given the crate version mismatch.

### 1.2 Label Enforcement (Albrecht Defense) — PASS

`hpke_open` enforces that the label used at decryption matches the label embedded in the envelope (`labelId` field). Mismatched labels produce `DecryptionFailed` — preventing cross-context key reuse attacks. This is correctly tested in `test_label_mismatch_rejected`.

### 1.3 Error Opacity — PASS

All decryption failures return the same opaque `CryptoError::DecryptionFailed` regardless of cause (wrong key, tampered ciphertext, tampered enc, wrong AAD, label mismatch). This prevents error-oracle attacks.

### 1.4 Finding: Timing Leak on Version Check — Medium

**Location**: `hpke_envelope.rs`, `hpke_open` function

The version field is checked before attempting decryption, and a version mismatch returns `UnsupportedVersion` (a distinct error from `DecryptionFailed`). While the version field (currently always `3`) is not secret information, this creates a distinguishable error path that breaks the otherwise uniform error handling.

**Recommendation**: Return `DecryptionFailed` for all error paths including version mismatch, or document that the version field is considered public metadata not requiring opaque error handling.

### 1.5 Zeroization — PASS

Secret key bytes extracted via `sk.to_bytes()` are explicitly zeroized after use in `hpke_seal` (line ~95). The `Zeroize` trait is correctly applied.

### 1.6 Test Coverage — PASS

18 tests covering: roundtrip, label mismatch, wrong key, wrong AAD, tampered ciphertext, tampered enc bytes, version checks, empty plaintext, large plaintext (1MB), deterministic output verification.

---

## 2. Key Derivation (`device_keys.rs`, `puk.rs`, `encryption.rs`)

### 2.1 Argon2id Parameters — PASS

Production parameters: `m_cost=65536` (64MB), `t_cost=3`, `p_cost=4`. These exceed OWASP minimum recommendations (19MB/2iter/1lane) and are appropriate for the threat model (nation-state adversaries).

The `test-kdf` feature correctly reduces to `m_cost=1024` (1MB), `t_cost=1`, `p_cost=1` for CI/emulator builds. The feature is not in `default` features, preventing accidental use in production.

### 2.2 Finding: Argon2id Constant Duplication — Medium

**Location**: `encryption.rs` lines 26-28 duplicate the Argon2id constants from `device_keys.rs`

Both files define identical constants (`ARGON2_M_COST`, `ARGON2_T_COST`, `ARGON2_P_COST` and their test variants). While values currently match, this is a maintenance risk — a future change to one file could diverge from the other.

**Recommendation**: Extract Argon2id parameters into a shared constants module (e.g., `src/kdf_params.rs`) and import from both `device_keys.rs` and `encryption.rs`. This ensures a single source of truth for security-critical parameters.

### 2.3 PUK Subkey Derivation — PASS

`derive_subkey` in `puk.rs` uses HMAC-SHA256 with input `label || BE32(generation)`. The generation counter is encoded as big-endian 4 bytes, preventing ambiguity. Labels are domain-separated constants from the label registry. Proper zeroization is applied to intermediate key material.

### 2.4 CLKR (Cascading Lazy Key Rotation) — PASS

`rotate_puk` correctly:
1. Generates a new random seed (32 bytes from `getrandom`)
2. Creates a CLKR chain link (previous seed encrypted under new seed via AES-256-GCM, with generation number in AAD)
3. HPKE-seals the new seed to each authorized device
4. Returns the complete state for server storage

`generation_walk` walks the chain backwards from current to target generation. The AAD binding on generation number prevents chain link reordering attacks.

### 2.5 HKDF Usage — PASS

All HKDF derivations use domain-separated info strings from the label registry. Salt values are properly specified (not empty/None except where the label itself provides sufficient domain separation).

---

## 3. Signature Verification (`device_keys.rs`, `sigchain.rs`, `auth.rs`, `schnorr.rs`)

### 3.1 Ed25519 — PASS

Uses `ed25519-dalek` which:
- Rejects non-canonical S values (prevents malleability)
- `VerifyingKey::from_bytes` rejects low-order points
- Batch verification not used (single-signature verification throughout)
- No custom nonce generation — relies on RFC 8032 deterministic nonces

### 3.2 BIP-340 Schnorr — PASS

`schnorr.rs` uses the `k256` crate for BIP-340 signatures. The implementation correctly handles:
- Prehash signing (SHA-256 digest, not raw message)
- Edge cases: point not on curve, odd Y coordinate, s ≥ n, field overflow
- Tested against 4 official BIP-340 sign vectors + 5 FALSE (rejection) vectors

The `bip340_sign_prehash` function supports both deterministic and hedged nonce modes. Hedged mode XORs the secret key with random bytes before nonce generation — this is a defense against fault attacks.

### 3.3 Auth Token Verification — PASS

`verify_auth_token_with_expiry` in `auth.rs`:
- Checks token age against configurable expiry (default 300s)
- Rejects future-dated tokens (30s clock skew tolerance)
- 16-byte random nonce prevents replay within the validity window
- Canonical message format: `{label}:{pubkey}:{timestamp}:{method}:{path}:{nonce}`
- Cross-language test vector ensures compatibility

### 3.4 Finding: Sigchain JSON Canonicalization — Medium

**Location**: `sigchain.rs`, `compute_entry_hash`

The sigchain hash is computed over `serde_json::json!` macro output, which produces a `serde_json::Value` using `BTreeMap` (sorted keys). This provides deterministic key ordering for the current Rust implementation. However:

1. Cross-platform verification (iOS/Android/Desktop) must use the same key ordering. If any client uses a JSON library with different ordering, hash chain verification will fail silently.
2. The `json!` macro does not guarantee a specific serialization format for edge cases (Unicode escaping, number formatting).

**Recommendation**: Document the canonicalization algorithm explicitly (sorted keys, no whitespace, UTF-8 NFC). Consider using JCS (JSON Canonicalization Scheme, RFC 8785) for formal cross-platform guarantees, or add cross-language test vectors for sigchain hash computation.

---

## 4. Memory Safety & Zeroization

### 4.1 No Unsafe Code — PASS (Excellent)

Zero `unsafe` blocks found across all 20+ source files. The crate relies entirely on safe Rust abstractions and well-audited dependencies for cryptographic operations.

### 4.2 Zeroize on Drop — PASS

- `DeviceSecrets` in `device_keys.rs`: `#[derive(Zeroize)] #[zeroize(drop)]`
- `Share` in `shamir.rs`: `#[derive(Zeroize)] #[zeroize(drop)]`
- Manual `.zeroize()` calls on temporary key byte arrays throughout `hpke_envelope.rs`, `puk.rs`, `encryption.rs`, `provisioning.rs`
- `ffi_v3.rs` `mobile_lock()` explicitly zeroizes all held secrets before dropping state

### 4.3 No Stack-Allocated Secrets Left Behind — PASS

Key material is either:
- Heap-allocated with Zeroize (structs with `#[derive(Zeroize)]`)
- Stack-allocated and explicitly zeroized before function return
- Consumed into cryptographic operations that don't retain copies

### 4.4 Informational: Vec<u8> for Ciphertext

Ciphertext and public values use `Vec<u8>` without Zeroize, which is correct — these are not secret. Only secret key material requires zeroization.

---

## 5. FFI Boundary (`ffi.rs`, `ffi_v3.rs`)

### 5.1 Device Key Isolation — PASS

`ffi_v3.rs` holds device secrets inside `MobileState` behind `OnceLock<Mutex<>>`. The `device_signing_key` and `device_encryption_seed` are never returned across the FFI boundary as raw bytes. Operations that need them (signing, decryption) execute entirely in Rust.

### 5.2 Finding: Encryption Seed Hex Exposure — Medium

**Location**: `ffi_v3.rs`, `encryption_secret_hex()`

This function returns the raw 32-byte encryption seed as a hex string across the FFI boundary. The function comment explains this is needed for HPKE operations that require the private key.

While documented, this means the encryption private key exists in mobile platform memory (Swift/Kotlin) outside of Rust's zeroization guarantees. An attacker with memory read access to the mobile app process could extract this key.

**Recommendation**: Evaluate whether HPKE operations can be moved entirely into Rust, eliminating the need to export the encryption seed. If export is unavoidable, document the threat model assumption and ensure the mobile wrapper zeroizes the hex string after use.

### 5.3 Recovery Key Store — PASS (with note)

`ffi.rs` implements a handle-based recovery key store with:
- 300-second TTL (keys auto-expire)
- Maximum 16 entries (prevents memory exhaustion)
- Monotonic handle counter (prevents handle reuse)
- Expired entries cleaned on access

**Low Finding**: The 16-entry limit is a fixed constant. Under unusual flows (rapid key generation without cleanup), this could silently reject new keys. Consider logging when the limit is reached.

### 5.4 EphemeralKeyPair Secret Exposure — Informational

`ffi_v3.rs` `EphemeralKeyPair` exposes the X25519 secret key over FFI. This is documented as intentional for the provisioning flow where the secret must be available on the mobile side for the ECDH computation. The struct name "Ephemeral" correctly signals its short-lived nature.

### 5.5 Mobile State Locking — PASS

`mobile_lock()` properly:
1. Acquires the mutex
2. Zeroizes device signing key bytes
3. Zeroizes device encryption seed bytes
4. Clears hub keys and server event keys
5. Drops the state

This ensures no key material survives a lock operation.

---

## 6. SFrame Voice E2EE (`sframe.rs`)

### 6.1 RFC 9605 Header Encoding — PASS

Short headers (counter 0-7, key_id 0-7): single byte, bit layout matches spec Section 4.3.
Long headers (larger values): multi-byte with length encoding, correctly handles variable-length counter and key_id fields.

### 6.2 Nonce Construction — PASS

`derive_base_nonce` uses HKDF with `LABEL_SFRAME_NONCE` domain separation. `compute_nonce` XORs the base nonce with the counter value in the last 8 bytes — standard counter-mode nonce construction that prevents nonce reuse as long as the counter is monotonic.

### 6.3 AAD Binding — PASS

The SFrame header is used as AAD for AES-256-GCM encryption, binding the header metadata to the ciphertext and preventing header manipulation.

### 6.4 Finding: Counter Overflow — Low

**Location**: `sframe.rs`, `compute_nonce`

The counter is a `u64` XORed into the last 8 bytes of the 12-byte nonce. At 2^64 frames, the counter wraps and nonces repeat. While practically unreachable (at 50fps, this is ~11.7 billion years), there is no explicit overflow check.

**Recommendation**: Document the counter overflow boundary. For defense-in-depth, consider a `checked_add` on the counter with an explicit error on overflow, rather than silent wrapping.

### 6.5 Key Derivation Chain — PASS

`exporter_secret → base_key → send_key` derivation chain uses HKDF at each step with distinct domain separation labels. This prevents key reuse across derivation levels.

### 6.6 Test Coverage — PASS

25+ tests covering header encoding/decoding edge cases, nonce computation, encrypt/decrypt roundtrip, key derivation, tampered ciphertext, wrong keys.

---

## 7. MLS Integration (`mls.rs`)

### 7.1 Finding: AES-128-GCM Ciphersuite — High

**Location**: `mls.rs`, ciphersuite selection

The MLS ciphersuite is `MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519`, which uses **AES-128-GCM** for symmetric encryption. The rest of the `packages/crypto/` crate exclusively uses **AES-256-GCM**.

While AES-128 is not broken and this is a standard MLS ciphersuite, the security level inconsistency is notable:
- Threat model specifies nation-state adversaries
- All other encryption in the crate uses 256-bit keys
- AES-128 provides 128-bit security vs. AES-256's 256-bit security

**Recommendation**: Evaluate whether OpenMLS 0.8 supports the `MLS_256_DHKEMP384_AES256GCM_SHA384_P384` ciphersuite or a custom X25519+AES-256-GCM suite. If not available, document the security level reduction for MLS-protected content and assess whether it meets the threat model requirements. Alternatively, investigate if the OpenMLS API allows registering a custom ciphersuite with DHKEM(X25519) + AES-256-GCM.

### 7.2 Key Package Validation — PASS

Key packages are validated before use in group operations. This prevents malformed or attacker-crafted key packages from corrupting group state.

### 7.3 Hub PTK Derivation — PASS

`derive_hub_ptk` uses HKDF with a hub-specific salt and `LABEL_HUB_KEY_WRAP` info, correctly deriving a per-hub key from the exporter secret.

### 7.4 Thread Safety — PASS

`MlsManager` uses `Mutex<Vec<MlsGroup>>` for thread-safe group management. The mutex is held only during group operations, minimizing contention.

### 7.5 Ratchet Tree Extension — PASS

Ratchet tree extensions are enabled, allowing group members to sync the full tree state without requiring out-of-band distribution. This is the recommended configuration for most deployments.

---

## 8. RNG Usage

### 8.1 OS CSPRNG Throughout — PASS

All random byte generation uses:
- `getrandom::fill` for raw random bytes (nonces, keys, padding)
- `OsRng` / `OsRng09` for ed25519-dalek and hpke crate operations
- No custom PRNG, no seed-based deterministic generation (except for test vectors)

### 8.2 No Weak Random Sources — PASS

No usage of `rand::thread_rng()`, `rand::random()`, or any non-cryptographic RNG found. All randomness is sourced from the OS CSPRNG via `getrandom`.

### 8.3 Nonce Generation — PASS

AES-256-GCM nonces are 12 bytes from `getrandom::fill` (random nonce selection). With 96-bit random nonces and AES-256-GCM, the collision probability stays below 2^-32 for up to 2^32 encryptions under the same key — well within safe bounds for per-note/per-message keys that are used once.

---

## 9. Side-Channel Resistance

### 9.1 Constant-Time Comparison — PASS

- `ct_hex_eq` in `lib.rs`: Uses `subtle::ConstantTimeEq` for hex string comparison
- `constant_time_eq` in `shamir.rs`: Uses `subtle::ConstantTimeEq` for commitment verification
- `sigchain.rs`: Uses `ct_hex_eq` for hash chain verification

### 9.2 Shamir GF(2^8) Constant-Time Multiplication — PASS (Excellent)

`shamir.rs` uses a compile-time 256×256 multiplication lookup table (`MUL_TABLE`) for GF(2^8) operations. This eliminates data-dependent branches and timing variations. The table is computed at compile time via `const fn`, ensuring no runtime initialization cost.

`gf256_inv` uses Fermat's little theorem (a^254 mod p) with the lookup table, maintaining constant-time behavior.

### 9.3 Envelope Selection in Decryption — PASS

`decrypt_message` in `encryption.rs` iterates through all recipient envelopes without early exit on successful decryption match. This prevents timing leaks that could reveal which envelope belongs to the decrypting user.

### 9.4 Informational: Argon2id is Intentionally Non-Constant-Time

Argon2id is a memory-hard KDF designed for password hashing. Its timing varies with input length, which is acceptable — the goal is computational cost, not timing uniformity.

---

## 10. Test Coverage

### 10.1 Overall Assessment — PASS (Strong)

The test suite is comprehensive across all modules:

| Module | Test Count | Coverage Notes |
|--------|-----------|----------------|
| `hpke_envelope` | 18 | Roundtrip, label mismatch, wrong key/AAD, tampered data, version, edge sizes |
| `device_keys` | 10+ | Generate/unlock, wrong PIN, pubkey verification, Argon2id params |
| `encryption` | 15+ | Note/message/draft encrypt/decrypt, multi-reader, admin envelopes |
| `sigchain` | 12+ | Chain creation/verification, device add/remove, reorder attacks, broken chain |
| `puk` | 10+ | Subkey derivation, rotation, generation walk, CLKR chain |
| `sframe` | 25+ | Header encoding, nonce computation, encrypt/decrypt, key derivation |
| `mls` | 8+ | Group creation, member add/remove, message encrypt/decrypt |
| `schnorr` | 9 | 4 official sign vectors, 5 FALSE vectors |
| `auth` | 8+ | Token create/verify, expiry, clock skew, cross-language vector |
| `shamir` | 12+ | Split/reconstruct, threshold, commitments, constant-time ops |
| `blind_index` | 10+ | Deterministic output, canonicalization, date bucketing, trigrams |
| `padding` | 8+ | Bucket sizes, roundtrip, minimum size |
| `provisioning` | 8+ | ECDH, key derivation, SAS codes, invalid inputs |
| `sas` | 6+ | Emoji derivation, determinism, key ordering |
| `labels` | 4 | Registry sync with JSON, bidirectional lookup, tombstone |

### 10.2 Negative Testing — PASS

Tests consistently verify rejection of:
- Wrong keys / wrong PINs
- Tampered ciphertext and authentication tags
- Label mismatches (Albrecht defense)
- Invalid inputs (wrong lengths, all-zeros keys, malformed data)
- Chain ordering attacks (sigchain)
- Out-of-range Shamir parameters

### 10.3 Cross-Language Vectors — PASS

`auth.rs` includes a cross-language test vector with a known Ed25519 seed, enabling verification that iOS/Android/Desktop produce identical auth tokens.

### 10.4 Finding: Missing Cross-Language Vectors for HPKE and Encryption — Low

While auth tokens have cross-language test vectors, the HPKE envelope and higher-level encryption modules lack them. Given the multi-platform nature of the project (Desktop, iOS, Android all performing HPKE operations), cross-language test vectors would catch serialization or encoding mismatches early.

**Recommendation**: Add known-answer test vectors for `hpke_seal`/`hpke_open` and `encrypt_note`/`decrypt_note` that can be replicated in Swift and Kotlin test suites.

---

## 11. Domain Separation (`labels.rs`)

### 11.1 Label Registry — PASS

92 domain separation constants with:
- Unique `u8` IDs for wire format efficiency
- Human-readable string labels for HPKE info parameter
- Bidirectional lookup (ID→label and label→ID) via `LABEL_REGISTRY` array and `LazyLock<HashMap>`
- CI guard tests ensuring sync with `packages/protocol/crypto-labels.json`

### 11.2 Tombstoned Label — PASS

Index 53 (formerly ECIES) is tombstoned with value `"__TOMBSTONED_DO_NOT_USE__"`. This prevents ID reuse and clearly marks the deprecated slot.

### 11.3 Finding: Label Tombstone Documentation — Low

**Location**: `labels.rs`

The tombstone at index 53 lacks a comment explaining *when* it was tombstoned and *why* (ECIES removal). Future maintainers may not understand the history.

**Recommendation**: Add a comment: `// Index 53: tombstoned 2026-XX — was LABEL_ECIES_*, removed in Ed25519/X25519 migration`

---

## 12. Additional Observations

### 12.1 Provisioning Key Validation — PASS

`provisioning.rs` correctly:
- Rejects X25519 public keys of wrong length
- Rejects all-zeros public keys (low-order point)
- Rejects all-zeros DH output (another low-order point indicator)
- Derives provisioning keys via HKDF with domain-separated salt and info

### 12.2 Padding Scheme — PASS (with note)

Power-of-2 bucket padding with minimum 512 bytes. Format: `[4-byte LE length][plaintext][random padding]`.

**Low Finding**: The minimum bucket size of 512 bytes may be insufficient to hide the difference between empty and very short content. For example, a note with no text (0 bytes) and a note with 1 character (1 byte) both pad to 512 bytes — good. But the step from 512 to 1024 bytes reveals that content is between 509 and 1020 bytes. Consider whether finer-grained buckets at the lower end would better serve the threat model.

### 12.3 Blind Index Canonicalization — PASS

`blind_index.rs` applies: lowercase → NFKD normalization → diacritical stripping → trim. This prevents trivial search bypasses (case, accent, whitespace).

### 12.4 Erasure Module — PASS

`erasure.rs` provides device wipe signatures and override verification, supporting secure remote wipe with cryptographic proof of authorization.

### 12.5 Audit Key Module — PASS

`audit_key.rs` provides AES-256-GCM encrypted audit keys with HPKE wrapping for admin distribution. Follows the same patterns as the rest of the crate.

---

## 13. Recommendations Summary

### Priority Actions

| # | Severity | Finding | Recommendation |
|---|----------|---------|----------------|
| 1 | **High** | MLS uses AES-128-GCM vs. AES-256-GCM elsewhere | Evaluate AES-256-GCM MLS ciphersuite availability; document security level if keeping AES-128 |
| 2 | **Medium** | Argon2id constants duplicated in two files | Extract to shared constants module |
| 3 | **Medium** | Version check timing leak in HPKE decrypt | Return opaque error for all paths, or document version as public |
| 4 | **Medium** | Encryption seed exported as hex over FFI | Move HPKE ops fully into Rust, or document threat model |
| 5 | **Medium** | Sigchain JSON canonicalization not formally specified | Document algorithm; add cross-language hash vectors; consider RFC 8785 (JCS) |
| 6 | **Low** | No cross-language HPKE/encryption test vectors | Add known-answer vectors replicable in Swift/Kotlin |
| 7 | **Low** | SFrame counter overflow undocumented | Add checked_add or document boundary |
| 8 | **Low** | Recovery key store capacity not logged on limit | Add logging when 16-entry limit reached |
| 9 | **Low** | Label tombstone lacks historical comment | Add tombstone date and reason |

### Commendations

1. **Zero `unsafe` blocks** — exceptional for a crypto crate
2. **Comprehensive Zeroize coverage** — key material properly cleaned up
3. **Strong test suite** — negative tests, edge cases, and official vectors
4. **Domain separation discipline** — label registry with CI sync guards
5. **Constant-time operations** — lookup tables, `subtle` crate, no early exits in envelope selection

---

## Appendix: Files Audited

```
packages/crypto/src/lib.rs
packages/crypto/src/hpke_envelope.rs
packages/crypto/src/device_keys.rs
packages/crypto/src/encryption.rs
packages/crypto/src/sigchain.rs
packages/crypto/src/puk.rs
packages/crypto/src/sframe.rs
packages/crypto/src/mls.rs
packages/crypto/src/auth.rs
packages/crypto/src/schnorr.rs
packages/crypto/src/provisioning.rs
packages/crypto/src/shamir.rs
packages/crypto/src/blind_index.rs
packages/crypto/src/padding.rs
packages/crypto/src/sas.rs
packages/crypto/src/labels.rs
packages/crypto/src/errors.rs
packages/crypto/src/erasure.rs
packages/crypto/src/audit_key.rs
packages/crypto/src/ffi.rs
packages/crypto/src/ffi_v3.rs
packages/crypto/src/ffi_server.rs
packages/crypto/Cargo.toml
```
