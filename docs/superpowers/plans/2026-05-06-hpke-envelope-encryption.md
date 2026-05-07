# Plan: HPKE Envelope Encryption

**Spec**: `docs/superpowers/specs/2026-05-05-hpke-envelope-encryption-design.md`

## Prerequisites

- **Rust FFI Server Crypto Bridge** (Plan 1) complete — `@llamenos/crypto/ffi` available with `hpkeSeal`, `hpkeOpen`, `symmetricEncrypt`, `symmetricDecrypt`, `hmacSha256`, `sha256`, `hkdfSha256`, `randomBytes`
- **Ed25519 Auth Purge** (Plan 2) complete — no Schnorr, server identity uses Ed25519
- `packages/shared/encoding.ts` available
- No production data — zero backward-compatibility concerns

## Implementation Steps

### Step 1: Server-Side Crypto — Replace `apps/worker/lib/crypto.ts`

**Files**:
- `apps/worker/lib/crypto.ts`

**Changes**:
1. Remove all imports from `@noble/ciphers`, `@noble/hashes`, `@noble/curves`
2. Import from `@llamenos/crypto/ffi`: `symmetricEncrypt`, `symmetricDecrypt`, `hpkeSeal`, `hpkeOpen`, `hmacSha256`, `sha256`, `hkdfSha256`, `randomBytes`
3. Import from `@shared/encoding`: `hexToBytes`, `bytesToHex`, `utf8ToBytes`, `bytesToUtf8`
4. Rewrite Tier 1 (server-encrypted) functions:
   - `encryptContactIdentifier()` → `serverEncrypt(plaintext, label, serverSecret)` using `hkdfSha256` + `symmetricEncrypt` (AES-256-GCM)
   - `decryptContactIdentifier()` → `serverDecrypt(ciphertext, label, serverSecret)` using `hkdfSha256` + `symmetricDecrypt`
   - `encryptStorageCredential()` → same pattern with its own label
   - `decryptStorageCredential()` → same pattern
5. Rewrite hash functions:
   - `hashPhone()` → `hmacSha256(key, utf8ToBytes(phone))` via FFI
   - `hashIP()` → `hmacSha256(key, utf8ToBytes(ip))` via FFI, truncate to 96 bits
   - `hashAuditEntry()` → `sha256(utf8ToBytes(stableJsonStringify(entry)))` via FFI
6. Keep `stableJsonStringify()` unchanged (pure JS, no crypto)
7. Delete `deriveEciesKeyV1()`, `deriveEciesKeyV2()`, `eciesWrapKeyServer()`, `eciesWrapKeyForRecipient()` — replaced by HPKE
8. Delete `migrateContactIfNeeded()` — no production data

**Verification**: `bun run typecheck` passes

---

### Step 2: Server-Side Envelope Encryption — HPKE Key Wrapping

**Files**:
- `apps/worker/lib/crypto.ts`

**Changes**:
1. Rewrite `encryptMessageForStorage()`:
   ```typescript
   function encryptMessageForStorage(
     plaintext: Uint8Array, readerPubkeys: Uint8Array[], label: string
   ): { encryptedContent: Uint8Array; envelopes: RecipientEnvelope[] } {
     const contentKey = randomBytes(32)
     const encryptedContent = symmetricEncrypt(contentKey, plaintext, utf8ToBytes(label))
     const envelopes = readerPubkeys.map(pk => {
       const sealed = hpkeSeal(pk, contentKey, utf8ToBytes(label), utf8ToBytes(`${label}:key-wrap`))
       return {
         pubkey: bytesToHex(pk),
         enc: bytesToHex(sealed.subarray(0, 32)),
         ct: bytesToHex(sealed.subarray(32)),
       }
     })
     return { encryptedContent, envelopes }
   }
   ```
2. Apply same pattern to `encryptCallRecordForStorage()`
3. Update `RecipientEnvelope` type in `packages/shared/types.ts`: `wrappedKey` + `ephemeralPubkey` → `enc` + `ct` (keeping `pubkey` field)

**Verification**: `bun run typecheck` passes

---

### Step 3: Hub-Encrypted Tier — AES-256-GCM via FFI

**Files**:
- `apps/worker/lib/hub-event-crypto.ts` (or inline in crypto.ts before deletion in WebSocket plan)

**Changes**:
1. Replace XChaCha20-Poly1305 hub encryption with AES-256-GCM via FFI:
   - `hubEncrypt(plaintext, hubKey, label)` → `symmetricEncrypt(hubKey, plaintext, utf8ToBytes(label))`
   - `hubDecrypt(ciphertext, hubKey, label)` → `symmetricDecrypt(hubKey, ciphertext, utf8ToBytes(label))`
2. Epoch key derivation: `hkdfSha256(serverSecret, empty, utf8ToBytes(`${LABEL_HUB_EVENT_EPOCH}:${utcDayNumber}`), 32)`

**Verification**: `bun run typecheck` passes

---

### Step 4: Push Encryption — HPKE + AES-256-GCM

**Files**:
- `apps/worker/lib/push-encryption.ts`

**Changes**:
1. Replace ECIES + XChaCha20 with HPKE + AES-256-GCM via FFI
2. Push payload encryption: `hpkeSeal(devicePubkey, payload, utf8ToBytes(LABEL_PUSH_WAKE), utf8ToBytes(`${LABEL_PUSH_WAKE}:key-wrap`))`
3. Remove `@noble/*` imports

**Verification**: `bun run typecheck` passes

---

### Step 5: Firehose Agent — AES-256-GCM Decryption

**Files**:
- `apps/worker/services/firehose-agent.ts`

**Changes**:
1. Replace XChaCha20-Poly1305 decryption with AES-256-GCM via FFI
2. Import `symmetricDecrypt` from `@llamenos/crypto/ffi`
3. Remove `@noble/ciphers` import

**Verification**: `bun run typecheck` passes

---

### Step 6: Desktop Client — IPC Command Updates

**Files**:
- `src/client/lib/platform.ts`
- `apps/desktop/src/crypto.rs`

**Changes**:
1. In `platform.ts`:
   - Rename IPC commands: `eciesWrapKey` → `hpkeSeal`, `eciesUnwrapKey` → `hpkeOpen`
   - Update TypeScript function signatures to match new envelope format (`enc` + `ct` instead of `wrappedKey` + `ephemeralPubkey`)
2. In `apps/desktop/src/crypto.rs`:
   - Update IPC handler implementations: delegate to `hpke_envelope::seal()` / `hpke_envelope::open()` instead of `ecies::wrap_key()` / `ecies::unwrap_key()`
   - Update symmetric encryption: XChaCha20-Poly1305 → AES-256-GCM
3. Update hub key manager (`src/client/lib/hub-key-manager.ts`): ECIES → HPKE via platform.ts
4. Update file crypto (`src/client/lib/file-crypto.ts`): ECIES + XChaCha20 → HPKE + AES-256-GCM via platform.ts
5. Update device provisioning (`src/client/lib/provisioning.ts`): secp256k1 ECDH → HPKE via platform.ts

**Verification**: `bun run typecheck && bun run build` passes

---

### Step 7: Rust `encryption.rs` — Migrate to AES-256-GCM Only

**Files**:
- `packages/crypto/src/encryption.rs`

**Changes**:
1. Migrate all functions to use AES-256-GCM instead of XChaCha20-Poly1305:
   - `encrypt_note`, `decrypt_note` — HPKE key wrap + AES-256-GCM content
   - `encrypt_message`, `decrypt_message` — same pattern
   - `encrypt_draft`, `decrypt_draft` — same
   - `encrypt_with_pin`, `decrypt_with_pin` — PBKDF2 + AES-256-GCM (PBKDF2 unchanged, just switch AEAD)
   - `encrypt_export` — HPKE wrap
   - `decrypt_call_record` — HPKE wrap
2. Delete `decrypt_legacy_note` — no production data
3. Remove `chacha20poly1305` usage throughout

**Verification**: `cargo test --manifest-path packages/crypto/Cargo.toml` — all encryption tests pass

---

### Step 8: Delete Legacy Rust Crypto Modules

**Files**:
- `packages/crypto/src/ecies.rs` (delete)
- `packages/crypto/src/encryption_legacy.rs` (delete)

**Changes**:
1. Delete `ecies.rs` (~150 lines)
2. Delete `encryption_legacy.rs` (~80 lines)
3. Remove `pub mod ecies;` and `pub mod encryption_legacy;` from `lib.rs`
4. Remove ECIES-related functions from `ffi.rs` (mobile UniFFI):
   - `ecies_wrap_key_hex`, `ecies_unwrap_key_hex`
   - `ecies_encrypt_content_hex`, `ecies_decrypt_content_hex`
   - `compute_shared_x_hex`, `decrypt_with_shared_key_hex`, `compute_sas_code`
5. Remove ECIES functions from `ffi_v3.rs` if present

**Verification**: `cargo test --all-features` passes. `cargo clippy --all-features` clean.

---

### Step 9: Mobile UniFFI — Update AES-256-GCM

**Files**:
- `packages/crypto/src/ffi_v3.rs`

**Changes**:
1. `mobile_decrypt_hub_event` — switch from XChaCha20-Poly1305 to AES-256-GCM
2. `mobile_decrypt_server_event` — same
3. `mobile_set_server_event_keys` — same key format, different AEAD
4. Keep `mobile_hpke_seal` / `mobile_hpke_open` as-is
5. Add new exports if needed for AES-256-GCM symmetric operations

**Verification**: `cargo test --features mobile` passes

---

### Step 10: Mobile Clients — iOS & Android HPKE Update

**Files**:
- `apps/ios/Sources/Services/CryptoService.swift`
- `apps/ios/Tests/CryptoServiceTests.swift`
- `apps/android/app/src/main/kotlin/.../crypto/CryptoService.kt`
- Android crypto unit tests

**Changes**:
1. **iOS**: Update all ECIES call sites in `CryptoService.swift` to use HPKE equivalents (`mobile_hpke_seal`/`mobile_hpke_open`). Update tests.
2. **Android**: Same for `CryptoService.kt`. Update unit tests.
3. Rebuild XCFramework: `build-mobile.sh ios` and regenerate UniFFI bindings
4. Rebuild JNI: `build-mobile.sh android`

**Verification**: iOS unit tests pass. Android `./gradlew testDebugUnitTest` passes.

---

### Step 11: Provisioning SAS — HPKE-Based Derivation

**Files**:
- `packages/crypto/src/provisioning.rs`
- `src/client/lib/provisioning.ts`

**Changes**:
1. Rewrite `provisioning.rs`:
   - Replace secp256k1 ECDH with HPKE `encap()`/`setup_receiver()`
   - SAS derivation from HPKE shared secret (NOT `enc`):
     ```
     sas_input = HKDF(shared_secret, salt=LABEL_PROVISION_SAS, info=enc || recipient_pk, len=6)
     sas_code = numeric_encoding(sas_input)
     ```
2. Add `LABEL_PROVISION_SAS` to `crypto-labels.json`, run `bun run codegen`
3. Update `provisioning.ts` to match new IPC commands

**Verification**: `cargo test` passes. Provisioning flow works end-to-end in Playwright tests.

---

### Step 12: Test Migration — Crypto Helpers & Interop

**Files**:
- `tests/crypto-helpers.ts`
- `tests/crypto-interop.spec.ts`
- `tests/mocks/tauri-core.ts`

**Changes**:
1. `tests/crypto-helpers.ts`: Remove ECIES helpers, add HPKE seal/open helpers via FFI, replace XChaCha20 with AES-256-GCM
2. `tests/crypto-interop.spec.ts`: Rewrite for HPKE interop (TS FFI seals → Rust opens, vice versa). Add label enforcement test (seal with label A, open with label B → fail)
3. `tests/mocks/tauri-core.ts`: Replace ECIES mock with FFI calls to real Rust crypto — no mock crypto in tests

**Verification**: `bun run test` — all Playwright tests pass

---

### Step 13: AAD Cross-Platform Test Vectors

**Files**:
- `packages/crypto/tests/aad-vectors.rs` (new)
- `packages/crypto/tests/ffi-integration.test.ts` (extend)

**Changes**:
1. Create test vectors for canonical AAD construction per operation type:
   - E2EE key wrap: `info=label`, `aad="{label}:key-wrap"`
   - Symmetric content: `aad=label`
   - Hub event: `aad="{LABEL_HUB_EVENT_EPOCH}:{epoch}"`
   - Server field: `aad=label`
2. Verify identical AAD bytes across Rust native, Rust FFI (via TS), and mobile UniFFI
3. Verify label enforcement: wrong label → decryption failure

**Verification**: `cargo test` and `bun test` both pass AAD vector tests

---

## Dependency Chain

- **Depends on**: Rust FFI Server Crypto Bridge (Plan 1), Ed25519 Auth Purge (Plan 2)
- **Depended on by**: WebSocket Relay (Plan 4) — for event encryption primitives

## Risk Notes

- `RecipientEnvelope` type change (`wrappedKey`→`enc`, `ephemeralPubkey` removed) affects DB column naming if envelopes are stored as JSONB — verify all DB reads/writes
- Mobile FFI rebuild required after Rust changes — must rebuild XCFramework and JNI `.so` before running mobile tests
- Provisioning SAS derivation from HPKE shared secret requires HPKE crate to expose internal key material — verify `hpke` crate API supports this
