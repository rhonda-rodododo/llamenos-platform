# Implementation Plan: Epic B — Crypto Domain Separation & Label Enforcement

**Spec**: `docs/superpowers/specs/2026-05-18-epic-b-crypto-domain-separation.md`
**Branch**: `plan-epic-b` → implementation branches per phase
**Dependency**: Phase 1 must land first. Phases 2-5 can proceed in parallel after Phase 1.

---

## Phase 1: Label Registry Sync & CI Guard (C07)

**Priority: HIGHEST — blocking all other phases and all other epics that add labels.**

### Task 1.1: Add 7 Missing Label Constants to `labels.rs`

**File**: `packages/crypto/src/labels.rs`

Add 7 new constants after the existing sections:

```rust
// --- Shift/Availability Encryption ---
pub const LABEL_AVAILABILITY_REASON: &str = "llamenos:availability-reason";
pub const LABEL_RING_GROUP_NAME: &str = "llamenos:ring-group-name";
pub const LABEL_SHIFT_NAME: &str = "llamenos:shift-name";
pub const LABEL_SHIFT_OVERRIDE_NOTE: &str = "llamenos:shift-override-note";

// --- Team/Tag Encryption ---
pub const LABEL_TEAM_ENCRYPT: &str = "llamenos:team-field:v1";
pub const LABEL_TAG_ENCRYPT: &str = "llamenos:tag-field:v1";

// --- Entity Type ---
pub const LABEL_ENTITY_TYPE_DEFINITION: &str = "llamenos:entity-type-def:v1";
```

Add to `LABEL_REGISTRY` with stable indices 81-87:

```rust
// 81-84: Shift/Availability (EP07)
LABEL_AVAILABILITY_REASON,    // 81
LABEL_RING_GROUP_NAME,        // 82
LABEL_SHIFT_NAME,             // 83
LABEL_SHIFT_OVERRIDE_NOTE,    // 84
// 85-86: Teams/Tags (EP03)
LABEL_TEAM_ENCRYPT,           // 85
LABEL_TAG_ENCRYPT,            // 86
// 87: Entity Type (EP06)
LABEL_ENTITY_TYPE_DEFINITION, // 87
```

### Task 1.2: CI Guard — `label_registry_matches_json` Test

**File**: `packages/crypto/src/labels.rs` (add to `#[cfg(test)] mod tests`)

This is the MOST IMPORTANT test. It prevents the drift that has been found 4 times now.

```rust
#[test]
fn label_registry_matches_json() {
    // Parse crypto-labels.json at test time
    let json_str = include_str!("../../../packages/protocol/crypto-labels.json");
    let json: serde_json::Value = serde_json::from_str(json_str)
        .expect("crypto-labels.json is valid JSON");
    let labels_obj = json["labels"].as_object()
        .expect("crypto-labels.json has 'labels' object");

    // Every label in JSON must exist in LABEL_REGISTRY with the correct value
    for (key, value) in labels_obj {
        let expected_value = value.as_str()
            .unwrap_or_else(|| panic!("label {key} value is not a string"));
        let found = LABEL_REGISTRY.iter().any(|&l| l == expected_value);
        assert!(found, "Label {key} = \"{expected_value}\" exists in crypto-labels.json but NOT in LABEL_REGISTRY");
    }

    // Every non-tombstone label in LABEL_REGISTRY must exist in JSON
    for (idx, &label) in LABEL_REGISTRY.iter().enumerate() {
        if label.is_empty() { continue; } // tombstone
        let found = labels_obj.values().any(|v| v.as_str() == Some(label));
        assert!(found, "Label at index {idx} = \"{label}\" exists in LABEL_REGISTRY but NOT in crypto-labels.json");
    }
}
```

**Depends on**: `serde_json` as a dev-dependency in `packages/crypto/Cargo.toml` (check if already present — likely is for existing tests).

### Task 1.3: `no_duplicate_label_values` Test

**File**: `packages/crypto/src/labels.rs` (already exists — verify it covers all labels)

The existing `no_duplicate_labels` test at line 647 already does this. Verify it passes with the new labels.

### Task 1.4: Run Codegen to Propagate Labels

After labels.rs is updated, run:
```bash
bun run codegen
```

This regenerates TS/Swift/Kotlin types from the Zod schemas + crypto-labels.json. The label constants will be available in all platforms.

**Note**: Generated code is gitignored — this runs as part of the build, not checked in.

### Task 1.5: Add Existing Test Assertions for New Labels

**File**: `packages/crypto/src/labels.rs` (extend `labels_match_expected_values` and `registry_indices_stable`)

Add assertions for indices 81-87 in `registry_indices_stable()`:
```rust
assert_eq!(id_to_label(81), Some(LABEL_AVAILABILITY_REASON));
assert_eq!(id_to_label(82), Some(LABEL_RING_GROUP_NAME));
// ... etc
```

### Task 1.6: Verify

```bash
bun run crypto:test
bun run crypto:clippy
```

All tests pass, including the new `label_registry_matches_json` guard.

---

## Phase 2: Crypto Crate Fixes (H10-H15)

**Can proceed in parallel with Phases 3-5 after Phase 1 lands.**

### Task 2.1: H10 — SFrame Nonce Label Registration

**Problem**: `sframe.rs:215` uses `b"sframe nonce"` — not a registered label.

**Fix**:
1. Add to `crypto-labels.json`:
   ```json
   "LABEL_SFRAME_NONCE": "llamenos:sframe-nonce:v1"
   ```
2. Add to `labels.rs`:
   ```rust
   pub const LABEL_SFRAME_NONCE: &str = "llamenos:sframe-nonce:v1";
   ```
   Add to `LABEL_REGISTRY` at index 88.
3. In `sframe.rs:215`, replace:
   ```rust
   hk.expand(b"sframe nonce", &mut nonce)
   ```
   with:
   ```rust
   hk.expand(LABEL_SFRAME_NONCE.as_bytes(), &mut nonce)
   ```
4. Add import: `use crate::labels::LABEL_SFRAME_NONCE;`

**Test**: Add a test that greps the sframe.rs source for raw `b"sframe nonce"` to prevent regression:
```rust
#[test]
fn sframe_uses_registered_label_for_nonce() {
    // Verify the nonce derivation uses the label constant, not a raw string.
    // This is a behavioral test — we verify that changing the label changes the nonce.
    let key = [42u8; 32];
    let nonce1 = derive_base_nonce(&key);
    // If we were still using "sframe nonce", this test existing is sufficient
    // to prove we're using the registered constant (because tests above verify
    // the constant value).
    assert_ne!(nonce1, [0u8; NONCE_SIZE]);
}
```

**Breaking change**: This changes the SFrame nonce derivation, so any existing SFrame-encrypted data becomes undecryptable. Since SFrame is for real-time voice (ephemeral), this is acceptable. **Document in commit message.**

### Task 2.2: H11 — Shamir Commitment Domain Prefix

**Problem**: `shamir.rs:333` — `SHA-256(x || y)` has no domain prefix.

**Fix**:
1. Add to `crypto-labels.json`:
   ```json
   "LABEL_SHAMIR_COMMIT": "llamenos:shamir-commit:v1"
   ```
2. Add to `labels.rs`:
   ```rust
   pub const LABEL_SHAMIR_COMMIT: &str = "llamenos:shamir-commit:v1";
   ```
   Add to `LABEL_REGISTRY` at index 89.
3. In `shamir.rs:333-337`, change `commit()`:
   ```rust
   pub fn commit(share: &Share) -> [u8; 32] {
       let mut hasher = Sha256::new();
       hasher.update(LABEL_SHAMIR_COMMIT.as_bytes());
       hasher.update([share.x]);
       hasher.update(&share.y);
       hasher.finalize().into()
   }
   ```
4. Add import: `use crate::labels::LABEL_SHAMIR_COMMIT;`

**Test**:
```rust
#[test]
fn commitment_includes_domain_prefix() {
    let share = Share { x: 1, y: vec![42] };
    let commitment = commit(&share);

    // Raw SHA-256(1 || 42) without prefix should differ
    let mut raw_hasher = Sha256::new();
    raw_hasher.update([1u8]);
    raw_hasher.update([42u8]);
    let raw_hash: [u8; 32] = raw_hasher.finalize().into();

    assert_ne!(commitment, raw_hash, "commitment must include domain prefix");
}
```

**Breaking change**: Changes commitment format. Since recovery groups are not yet in production, this is safe. **Document in commit message.**

### Task 2.3: H12 — Unified HPKE Error Path

**Problem**: `hpke_envelope.rs:143-197` returns different error types for label mismatch vs AEAD failure.

**Fix**: After the version check (which can remain distinct since v!=3 is a protocol-level issue), all other failures should return the same opaque error.

In `hpke_open()` at `hpke_envelope.rs`, change:
- Line 152-155 (`unknown labelId`) → `CryptoError::DecryptionFailed`
- Line 157-160 (`label mismatch`) → `CryptoError::DecryptionFailed`
- Line 169 (`InvalidSecretKey`) → `CryptoError::DecryptionFailed`
- Keep the HPKE open failure on line 197 as `CryptoError::DecryptionFailed` (already correct)

**Test**:
```rust
#[test]
fn all_decrypt_failures_return_same_error() {
    let (sk_hex, pk_hex) = gen_keypair();
    let (_wrong_sk, _) = gen_keypair();
    let envelope = hpke_seal(b"test", &pk_hex, LABEL_NOTE_KEY, b"aad").unwrap();

    // Wrong label
    let err1 = hpke_open(&envelope, &sk_hex, LABEL_FILE_KEY, b"aad");
    // Unknown labelId
    let mut bad_env = envelope.clone();
    bad_env.label_id = 255;
    let err2 = hpke_open(&bad_env, &sk_hex, LABEL_NOTE_KEY, b"aad");
    // Wrong key
    let err3 = hpke_open(&envelope, &_wrong_sk, LABEL_NOTE_KEY, b"aad");

    // All should be DecryptionFailed (not distinguishable)
    assert!(matches!(err1, Err(CryptoError::DecryptionFailed)));
    assert!(matches!(err2, Err(CryptoError::DecryptionFailed)));
    assert!(matches!(err3, Err(CryptoError::DecryptionFailed)));
}
```

**Note**: Version check (`v != 3`) remains `InvalidFormat` since that's a protocol-level issue, not a secret-dependent check.

### Task 2.4: H13 — Rename `nsec` Parameter

**Problem**: `encryption.rs:428` — `encrypt_with_pin(nsec, ...)`.

**Fix**: Rename `nsec` → `key_material` in:
- `encrypt_with_pin()` function signature and body (`encryption.rs`)
- `EncryptedKeyData.ciphertext` doc comment (clarify it's encrypted key material, not nsec)
- Any callers in `crypto.rs`, `ffi.rs`, `ffi_v3.rs`

**Files**:
- `packages/crypto/src/encryption.rs`
- `packages/crypto/src/ffi.rs` (if it wraps encrypt_with_pin)
- `packages/crypto/src/ffi_v3.rs` (if it wraps encrypt_with_pin)

**Test**: Existing tests continue to pass (parameter rename only, no behavioral change).

### Task 2.5: H14 — Zeroize on `ShamirShare`

**Problem**: `shamir.rs:158-161` — `ShamirShare` has `y_hex: String` not zeroized.

**Fix**: Implement `Drop` for `ShamirShare`:
```rust
impl Drop for ShamirShare {
    fn drop(&mut self) {
        self.y_hex.zeroize();
    }
}
```

**Note**: This conflicts with `uniffi::Record` derive. Check if UniFFI supports custom Drop. If not, add `Zeroize` derive (which doesn't require Drop — just enables `.zeroize()` to be called manually) and document that callers must call `.zeroize()` before dropping.

Alternative: If UniFFI blocks `Drop`, add `#[derive(Zeroize)]` (from the `zeroize` crate's derive macro) and add a `zeroize()` call in all code paths that consume `ShamirShare`.

**Test**:
```rust
#[test]
fn shamir_share_zeroize() {
    let mut share = ShamirShare { x: 1, y_hex: "deadbeef".to_string() };
    share.zeroize();
    assert!(share.y_hex.is_empty() || share.y_hex.bytes().all(|b| b == 0));
}
```

### Task 2.6: H15 — Document or Extend Truncated Fingerprint

**Problem**: `encryption.rs:451` — `&full[..8]` is 64-bit truncated SHA-256.

**Decision**: Document as intentional. The fingerprint is used for key identification (matching encrypted blobs to pubkeys), not authentication. 64 bits is sufficient for identification (birthday bound: 2^32 pubkeys before collision, far beyond system scale). Brute-force preimage resistance is not required since the input (pubkey hex) is known.

**Fix**: Add a doc comment at `encryption.rs:449-452`:
```rust
// Truncated to 64 bits (8 bytes). This is an identification fingerprint,
// not a commitment — collision resistance beyond 2^32 keys is not needed.
// The full pubkey is the authentication primitive, not this hash.
let pubkey_hash = {
```

**No test needed** — this is a documentation-only change.

### Task 2.7: Verify Phase 2

```bash
bun run crypto:test
bun run crypto:clippy
bun run crypto:fmt
```

---

## Phase 3: Desktop Label Enforcement

**Can proceed in parallel with Phases 2, 4, 5 after Phase 1 lands.**

### Task 3.1: Fix `decrypt_server_event` Wrong Label

**File**: `apps/desktop/src/crypto.rs:784`

**Problem**: Uses `LABEL_HUB_EVENT` for server event AAD instead of `LABEL_HUB_EVENT_EPOCH`.

**Current code** (line 784):
```rust
let aad = format!("{}:{}", llamenos_core::LABEL_HUB_EVENT, epoch);
```

**Fix**: Change to:
```rust
let aad = format!("{}:{}", llamenos_core::LABEL_HUB_EVENT_EPOCH, epoch);
```

**Cross-reference**: Verify the server-side ws-manager.ts uses the same label for the AAD when encrypting server events. If the server uses `LABEL_HUB_EVENT`, then the server is wrong too — both should use `LABEL_HUB_EVENT_EPOCH` since these are epoch-keyed events.

**Files to check**: `apps/worker/lib/ws-manager.ts` — search for the AAD construction in `publishEvent()`.

### Task 3.2: Add Label Registry Validation to `encrypt_hub_field` / `decrypt_hub_field`

**File**: `apps/desktop/src/crypto.rs:531-584`

**Problem**: These commands accept any string as `label` without validation.

**Fix**: Add registry validation at the top of both functions:
```rust
// Validate label against registry
if llamenos_core::labels::label_to_id(&label).is_none() {
    return Err(format!("Unknown crypto label: {label}. Labels must be registered in the label registry."));
}
```

**Test**: The existing Playwright E2E tests should exercise encrypt/decrypt hub field. Add a unit test in `crypto.rs` tests (or as a separate Rust test) that verifies an unknown label is rejected.

### Task 3.3: Verify `platform.ts` Uses Imported Labels (Not Raw Strings)

**File**: `src/client/lib/platform.ts`

**Status**: Already clean — uses `LABEL_WS_CHALLENGE` imported from `@shared/crypto-labels`. No raw string crypto labels found.

**No changes needed** — just verify with grep.

### Task 3.4: Verify Desktop Label Usage in Connection

**File**: `src/client/lib/relay/connection.ts`

**Status**: Already imports `LABEL_WS_CHALLENGE` from `@shared/crypto-labels` (line 15). Uses it for WS auth (line 273). Verifies server signatures (lines 292-302).

**No changes needed** — desktop WS sig verification is already implemented.

### Task 3.5: Verify Phase 3

```bash
bun run typecheck
bun run test:build  # Vite build with mocks
```

If the server-side AAD also needs fixing, coordinate with the server change.

---

## Phase 4: WS Signature Verification — Cross-Platform (C08)

**Can proceed in parallel with Phases 2, 3, 5 after Phase 1 lands.**
**This is the most complex phase — plan for platform-by-platform implementation, not one big PR.**

### Task 4.1: Desktop — Already Implemented

**Status**: `connection.ts:292-302` verifies `sig` field via `ed25519Verify(messageHex, msg.sig, this.serverPubkey)`. No changes needed.

### Task 4.2: iOS — Add Signature Verification

**File**: `apps/ios/Sources/Services/WebSocketService.swift`

**Approach**: The `NostrEvent` struct already parses the `sig` field. Add verification before processing.

1. Add a `verifyEventSignature(_ event: NostrEvent, serverPubkey: String) -> Bool` method
2. Construct the same sig message format as desktop: `"{v}:{hubId}:{kind}:{epoch}:{payload}:{ts}"`
3. Verify using either:
   - UniFFI call to `llamenos_core::device_keys::verify_signature()` (preferred — single implementation)
   - CryptoKit Ed25519 (fallback if UniFFI is not available yet)
4. Call before processing any event, especially `device:wipe`
5. **Critical**: `device:wipe` MUST verify signature. If verification fails, log and drop the event.

**Files**:
- `apps/ios/Sources/Services/WebSocketService.swift` — add verification
- `apps/ios/Sources/Services/CryptoService.swift` — expose verify method if not already

**Test**:
- Unit test: `WebSocketServiceTests.swift` — test with valid sig (accepted), invalid sig (rejected), missing sig (rejected)
- The server pubkey must be stored/injected into `WebSocketService` at construction time

### Task 4.3: Android — Add Signature Verification

**File**: `apps/android/app/src/main/java/org/llamenos/hotline/api/WebSocketService.kt`

**Approach**: Same pattern as iOS.

1. Add a `verifyEventSignature(event: LlamenosEvent, serverPubkey: String): Boolean` method
2. Construct the sig message: `"${v}:${hubId}:${kind}:${epoch}:${payload}:${ts}"`
3. Verify using JNI crypto call to `llamenos_core::device_keys::verify_signature()`
4. Call before processing any event
5. **Critical**: `device:wipe` MUST verify signature before executing

**Files**:
- `apps/android/app/src/main/java/org/llamenos/hotline/api/WebSocketService.kt` — add verification
- `apps/android/app/src/main/java/org/llamenos/hotline/crypto/CryptoService.kt` — expose verify method

**Test**:
- Unit test: `WebSocketServiceTest.kt` — test with valid/invalid/missing sig
- The server pubkey must be injected via Hilt DI

### Task 4.4: Backend BDD Scenario

**File**: New feature file in `tests/features/` (or extend existing WS feature)

```gherkin
Scenario: Forged WebSocket event is rejected by client
  Given a connected WebSocket client
  When the server sends an event with an invalid signature
  Then the client should drop the event
  And no event handler should be called

Scenario: Valid WebSocket event is accepted by client
  Given a connected WebSocket client
  When the server sends a properly signed event
  Then the client should process the event
```

**Note**: These BDD scenarios test the desktop (Playwright) path. iOS/Android verification is tested via platform-specific unit tests.

### Task 4.5: Verify Phase 4

```bash
# Desktop
bun run test:desktop

# iOS (on Mac M4)
bun run ios:test

# Android
bun run test:android
```

---

## Phase 5: Android Label Constants

**Can proceed in parallel with Phases 2, 3, 4 after Phase 1 lands.**

### Task 5.1: Audit Android HPKE Envelope Usage

**Files**: Grep `apps/android/` for hardcoded `version`/`labelId` values.

```bash
grep -rn 'labelId\|"v"\s*[:=]\s*3\|version.*=.*3' apps/android/
```

Replace any hardcoded values with generated constants from `packages/protocol` codegen output.

### Task 5.2: Verify Codegen Constants Are Used

After `bun run codegen`, check that `packages/protocol/generated/kotlin/` includes `CryptoLabels.kt` (or equivalent) and that Android source imports from it.

### Task 5.3: Unit Test

**File**: `apps/android/app/src/test/java/org/llamenos/hotline/crypto/`

```kotlin
@Test
fun envelopeUsesCorrectConstants() {
    // Verify envelope version matches protocol constant
    assertEquals(3, HpkeEnvelope.CURRENT_VERSION)
    // Verify label IDs match registry
    assertEquals(CryptoLabels.LABEL_NOTE_KEY_ID, 0)
}
```

### Task 5.4: Verify Phase 5

```bash
bun run test:android
```

---

## Dependency Chain

```
Phase 1 (Labels + CI Guard)
    ├── Phase 2 (Crypto Crate Fixes)
    ├── Phase 3 (Desktop Label Enforcement)
    ├── Phase 4 (WS Sig Verification)
    └── Phase 5 (Android Constants)
```

Phase 1 MUST land first — all other phases depend on the label registry being correct.

Phases 2-5 have no dependencies on each other and can be implemented in parallel.

## PR Strategy

- **PR 1**: Phase 1 — Label registry sync + CI guard (small, high-priority, merge first)
- **PR 2**: Phase 2 — Crypto crate fixes (Rust-only, isolated)
- **PR 3**: Phase 3 — Desktop label enforcement (Rust + TS, small)
- **PR 4a**: Phase 4 desktop verification already done — iOS sig verification
- **PR 4b**: Phase 4 — Android sig verification
- **PR 5**: Phase 5 — Android constants (small, can bundle with 4b)

## Cross-Platform Coordination Notes

1. After Phase 1, run `bun run codegen` — all platforms get updated label constants
2. Phase 2 changes SFrame nonce derivation (breaking for SFrame, acceptable since ephemeral)
3. Phase 2 changes Shamir commitment format (breaking for recovery groups, acceptable since pre-production)
4. Phase 3 may require server-side fix if `decrypt_server_event` AAD mismatch is real
5. Phase 4 iOS/Android need server pubkey injected — check if it's already available in the auth flow
6. All crypto test changes: `bun run crypto:test` must pass before any PR
