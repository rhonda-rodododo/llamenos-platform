# Epic B — Crypto Domain Separation & Label Enforcement

**Date**: 2026-05-18
**Status**: Spec
**Priority**: CRITICAL / HIGH
**Scope**: `packages/crypto`, `apps/desktop`, `apps/ios`, `apps/android`, `apps/worker`, `src/client`, CI

## Context

Two independent audits (2026-05-18) found systemic domain separation violations across the crypto crate, desktop client, iOS client, Android client, and WebSocket relay. The Albrecht defense — label enforcement at encrypt/decrypt — has gaps that undermine a core security invariant: **every HPKE/AEAD operation must use a typed label from the registry, never a raw string.**

This is the third time label drift between `crypto-labels.json` and `labels.rs` has been found. The fix MUST include a CI guard to prevent a fourth occurrence.

---

## Finding C07 — 7 Crypto Labels Missing from Rust Registry (CRITICAL)

### Current State

`packages/protocol/crypto-labels.json` contains 7 labels not present in `packages/crypto/src/labels.rs`:

| JSON Key | JSON Value | Present in `labels.rs`? |
|----------|-----------|------------------------|
| `LABEL_AVAILABILITY_REASON` | `llamenos:availability-reason` | **NO** |
| `LABEL_RING_GROUP_NAME` | `llamenos:ring-group-name` | **NO** |
| `LABEL_SHIFT_NAME` | `llamenos:shift-name` | **NO** |
| `LABEL_SHIFT_OVERRIDE_NOTE` | `llamenos:shift-override-note` | **NO** |
| `LABEL_TEAM_ENCRYPT` | `llamenos:team-field:v1` | **NO** |
| `LABEL_TAG_ENCRYPT` | `llamenos:tag-field:v1` | **NO** |
| `LABEL_ENTITY_TYPE_DEFINITION` | `llamenos:entity-type-def:v1` | **NO** |

### Correct Behavior

Every label in `crypto-labels.json` MUST have a corresponding `pub const` in `labels.rs` AND an entry in `LABEL_REGISTRY`. The JSON is the source of truth; Rust must be a superset (tombstoned entries are permitted in Rust but not JSON).

### Required Changes

1. **`packages/crypto/src/labels.rs`**: Add 7 new constants:
   ```rust
   // --- Shift / Availability Encryption ---
   pub const LABEL_AVAILABILITY_REASON: &str = "llamenos:availability-reason";
   pub const LABEL_RING_GROUP_NAME: &str = "llamenos:ring-group-name";
   pub const LABEL_SHIFT_NAME: &str = "llamenos:shift-name";
   pub const LABEL_SHIFT_OVERRIDE_NOTE: &str = "llamenos:shift-override-note";

   // --- Team / Tag Field Encryption ---
   pub const LABEL_TEAM_ENCRYPT: &str = "llamenos:team-field:v1";
   pub const LABEL_TAG_ENCRYPT: &str = "llamenos:tag-field:v1";

   // --- Entity Type Definition ---
   pub const LABEL_ENTITY_TYPE_DEFINITION: &str = "llamenos:entity-type-def:v1";
   ```

2. **`LABEL_REGISTRY`**: Append indices 81–87:
   ```rust
   LABEL_AVAILABILITY_REASON,   // 81
   LABEL_RING_GROUP_NAME,       // 82
   LABEL_SHIFT_NAME,            // 83
   LABEL_SHIFT_OVERRIDE_NOTE,   // 84
   LABEL_TEAM_ENCRYPT,          // 85
   LABEL_TAG_ENCRYPT,           // 86
   LABEL_ENTITY_TYPE_DEFINITION,// 87
   ```

3. **`packages/protocol/crypto-labels.json`**: No changes needed (it is the source of truth). The JSON already has stable implicit ordering — confirm the codegen maps name→index correctly for these 7 new entries.

4. **Tests**: Add `assert_eq!` for each new constant value and registry index in `labels.rs` tests.

---

## Finding C07-CI — CI Guard Against Label Drift (CRITICAL)

### Problem

Label drift has occurred 3 times. Manual synchronization is unreliable. The existing Rust tests only check that constants match hardcoded strings — they do not cross-reference the JSON source of truth.

### Design: `packages/crypto/tests/label_sync_test.rs` (integration test)

A `cargo test` integration test that:

1. Reads `../../packages/protocol/crypto-labels.json` at test time (via `include_str!` or `std::fs::read_to_string` with a path relative to `CARGO_MANIFEST_DIR`).
2. Parses the `labels` object — extracts every key-value pair.
3. For each JSON label:
   - Asserts a matching constant exists in `LABEL_REGISTRY` (by string value).
   - Asserts `label_to_id(value)` returns `Some(id)`.
4. For each `LABEL_REGISTRY` entry (excluding tombstones):
   - Asserts the string value exists in the JSON `labels` object.
5. **Fails CI** if any label is missing in either direction.

This is strictly better than a pre-commit hook because:
- Pre-commit hooks are bypassed during `git rebase` and `--no-verify`.
- `cargo test` runs in CI unconditionally.
- The test is checked into the repo and version-controlled.

### Fallback: Pre-commit hook

Additionally, add a lightweight pre-commit check (in `.husky/pre-commit` or `scripts/check-labels.sh`) that runs `bun run check:labels` — a TypeScript script that parses both files and diffs the label sets. This gives fast local feedback but is NOT the enforcement mechanism (CI is).

### Cross-Platform Codegen Note

After adding labels to `labels.rs`, run `bun run codegen` to regenerate:
- `packages/protocol/generated/typescript/CryptoLabels.ts`
- `packages/protocol/generated/swift/CryptoLabels.swift`
- `packages/protocol/generated/kotlin/CryptoLabels.kt`

All platforms import generated constants — the Rust registry is the only manually maintained file besides the JSON source.

---

## Finding C08 — WS Event Signatures Never Verified by Clients (CRITICAL)

### Current State

**Server side** (`apps/worker/lib/ws-manager.ts:153-166`): The `publishToHub` method signs every event:
```typescript
const sigMessage = `${WS_PROTOCOL_VERSION}:${hubId}:${kind}:${epoch}:${payload}:${ts}`
const sig = bytesToHex(ed25519Sign(this.serverKey, utf8ToBytes(sigMessage)))
```

The `sendSignedWipeToUser` method also signs device:wipe commands (`ws-manager.ts:289-298`).

**Desktop client** (`src/client/lib/relay/connection.ts:292-302`): The desktop client DOES verify signatures. This was added and is functional:
```typescript
const sigMessage = `${msg.v}:${msg.hubId}:${msg.kind}:${msg.epoch}:${msg.payload}:${msg.ts}`
const messageHex = bytesToHex(utf8ToBytes(sigMessage))
const valid = await ed25519Verify(messageHex, msg.sig, this.serverPubkey)
if (!valid) return
```

**iOS client** (`apps/ios/Sources/Services/WebSocketService.swift`): Uses legacy Nostr relay protocol (NIP-01 `["EVENT", subId, event]`). **No signature verification** — events are processed directly after decryption. The `emitEvent` function at line 335 broadcasts without any signature check.

**Android client** (`apps/android/app/src/main/java/org/llamenos/hotline/service/AttributedHubEvent.kt`): Minimal event wrapper. The actual WebSocket service (`apps/android/app/src/main/java/org/llamenos/hotline/api/WebSocketService.kt`) does **no signature verification** on incoming events.

### Correct Behavior

ALL clients MUST verify the Ed25519 signature on every WS event before processing. Unsigned or invalid-signature events MUST be silently dropped.

For `device:wipe` specifically: the wipe MUST NOT execute unless the signature is verified against the known server pubkey. An unsigned wipe is a trivial denial-of-service vector.

### Required Changes — Desktop (VERIFIED ALREADY DONE)

Desktop already verifies at `connection.ts:292-302`. **No changes needed for regular events.**

However, the `device:wipe` handler at `connection.ts:316-319` processes wipe events that arrive as *decrypted content within a verified server event*. The wipe command signature (`sendSignedWipeToUser`) is separate from the event envelope signature. The current desktop client does NOT verify the wipe-specific signature (the `sig` field inside the wipe payload) — it only verifies the transport-level event signature. This is acceptable because:
- The transport signature already authenticates the server.
- The wipe payload is encrypted inside the event envelope.
- Double-verification adds no security given the same server key signs both.

**Decision**: No additional wipe signature verification needed on desktop. The transport-level Ed25519 check is sufficient.

### Required Changes — iOS

1. **Store server pubkey**: `WebSocketService` must accept and store the server's Ed25519 public key (hex) at initialization or connection time.

2. **Verify before emitEvent**: In the receive loop (`receiveLoop` → `parseRelayMessage` → `emitEvent`), add signature verification before broadcasting to continuations.

3. **Verification approach**: iOS should use `CryptoKit.Curve25519.Signing.PublicKey` for Ed25519 verification. The signature message format must match the server: `"{v}:{hubId}:{kind}:{epoch}:{payload}:{ts}"`.

4. **Migration path**: iOS currently uses legacy Nostr relay format (`["EVENT", subId, event]`). The WS protocol migration (to the signed event format matching desktop) is a prerequisite. Until that migration, iOS cannot verify because the fields (`v`, `epoch`, `sig`) don't exist in the Nostr event format.

   **Recommendation**: Migrate iOS WebSocket to the new signed-event protocol first (separate task), then add verification. The legacy Nostr format is inherently unverifiable.

### Required Changes — Android

1. **Store server pubkey**: `WebSocketService` must accept and store the server's Ed25519 public key.

2. **Verify via JNI**: Call `org.llamenos.core.mobileEd25519Verify(messageHex, signatureHex, pubkeyHex)` before processing any event.

3. **Same migration path as iOS**: Android also needs to migrate to the new WS signed-event protocol if it's still using legacy Nostr format.

---

## Finding H10 — SFrame Nonce Uses Raw String (HIGH)

### Current State

`packages/crypto/src/sframe.rs:215`:
```rust
hk.expand(b"sframe nonce", &mut nonce)
```

This uses a raw byte string `b"sframe nonce"` for HKDF-Expand info, violating the rule that all crypto contexts must use registered label constants.

### Correct Behavior

Use a registered domain separation label from `crypto-labels.json`.

### Required Changes

1. **`packages/protocol/crypto-labels.json`**: Add:
   ```json
   "LABEL_SFRAME_NONCE": "llamenos:sframe-nonce:v1"
   ```

2. **`packages/crypto/src/labels.rs`**: Add constant and registry entry:
   ```rust
   /// SFrame base nonce derivation (HKDF info)
   pub const LABEL_SFRAME_NONCE: &str = "llamenos:sframe-nonce:v1";
   ```
   Add to `LABEL_REGISTRY` at next available index (88).

3. **`packages/crypto/src/sframe.rs:215`**: Replace:
   ```rust
   // Before:
   hk.expand(b"sframe nonce", &mut nonce)
   // After:
   use crate::labels::LABEL_SFRAME_NONCE;
   hk.expand(LABEL_SFRAME_NONCE.as_bytes(), &mut nonce)
   ```

### Migration Impact

This changes the nonce derivation for all SFrame operations. Since SFrame is used for real-time voice E2EE and keys are ephemeral per-call, there is **no stored data to migrate**. All active calls will naturally re-key on the next call setup.

---

## Finding H11 — Shamir Commitment Lacks Context Binding (HIGH)

### Current State

`packages/crypto/src/shamir.rs:332-338`:
```rust
pub fn commit(share: &Share) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update([share.x]);
    hasher.update(&share.y);
    hasher.finalize().into()
}
```

The commitment is `SHA-256(x || y)` with no domain separation prefix. Commitments from different contexts (e.g., Shamir shares from different protocols or applications) could collide if they happen to have the same `(x, y)` bytes.

Additionally, the desktop IPC Shamir (`apps/desktop/src/crypto.rs:678-684`) duplicates this same pattern:
```rust
hasher.update([s.x]);
hasher.update(&y_bytes);
```

### Correct Behavior

Prefix the hash input with a domain separation label to bind the commitment to the Llamenos Shamir context.

### Required Changes

1. **`packages/protocol/crypto-labels.json`**: Add:
   ```json
   "LABEL_SHAMIR_COMMITMENT": "llamenos:shamir-commit:v1"
   ```

2. **`packages/crypto/src/labels.rs`**: Add constant and registry entry:
   ```rust
   /// Shamir share commitment hash prefix
   pub const LABEL_SHAMIR_COMMITMENT: &str = "llamenos:shamir-commit:v1";
   ```
   Add to `LABEL_REGISTRY` at next available index (89).

3. **`packages/crypto/src/shamir.rs`**: Update `commit()`:
   ```rust
   use crate::labels::LABEL_SHAMIR_COMMITMENT;

   pub fn commit(share: &Share) -> [u8; 32] {
       let mut hasher = Sha256::new();
       hasher.update(LABEL_SHAMIR_COMMITMENT.as_bytes());
       hasher.update([share.x]);
       hasher.update(&share.y);
       hasher.finalize().into()
   }
   ```

4. **`apps/desktop/src/crypto.rs`**: Update `shamir_commit()` and `shamir_split()` commitment generation to use `llamenos_core::LABEL_SHAMIR_COMMITMENT` prefix. Alternatively, remove the duplicated Shamir implementation from `crypto.rs` and delegate entirely to `llamenos_core::shamir::*` — the desktop IPC layer should not re-implement crypto primitives.

### Migration Impact

This changes the commitment format. Existing commitments stored in recovery group state will no longer verify against new code. Since recovery groups (EP09) are not yet in production, this is a clean break with no migration needed.

---

## Finding H12 — HPKE Envelope Timing Leakage (HIGH)

### Current State

`packages/crypto/src/hpke_envelope.rs:137-200` (`hpke_open`):

```rust
// Step 1: Check version
if envelope.v != ENVELOPE_VERSION {
    return Err(CryptoError::InvalidFormat(...));  // Early return #1
}

// Step 2: Resolve labelId
let resolved_label = id_to_label(envelope.label_id).ok_or_else(|| {
    CryptoError::InvalidFormat(...)  // Early return #2
})?;

// Step 3: Albrecht defense
if resolved_label != expected_label {
    return Err(CryptoError::InvalidFormat(...));  // Early return #3
}

// Step 4-6: Parse key, decode, HPKE open
// ... returns DecryptionFailed  // Early return #4
```

Each error path returns at a different point in the function, with different amounts of work done. An attacker measuring response times could distinguish:
- Invalid version (fastest — no crypto work)
- Unknown labelId (fast — one lookup)
- Label mismatch (fast — string compare)
- AEAD failure (slow — full HPKE decapsulation + AES-GCM)

### Correct Behavior

Minimize timing differences between error paths. The goal is not perfect constant-time behavior (that's impractical for this flow), but rather collapsing the first three checks into a single pre-HPKE validation phase so the timing reveals at most "pre-check failed" vs "HPKE decryption failed."

### Required Changes

1. **`packages/crypto/src/hpke_envelope.rs`**: Refactor `hpke_open` to collect all pre-HPKE validation into a single block that returns a unified error:

   ```rust
   pub fn hpke_open(
       envelope: &HpkeEnvelope,
       recipient_secret_hex: &str,
       expected_label: &str,
       aad: &[u8],
   ) -> Result<Vec<u8>, CryptoError> {
       // Unified pre-check: version + labelId + Albrecht defense
       let resolved_label = validate_envelope_prelims(envelope, expected_label)?;

       // From here: all paths do full crypto work
       // ... (parse key, decode, HPKE open)
   }

   fn validate_envelope_prelims(
       envelope: &HpkeEnvelope,
       expected_label: &str,
   ) -> Result<&'static str, CryptoError> {
       let version_ok = envelope.v == ENVELOPE_VERSION;
       let resolved = id_to_label(envelope.label_id);
       let label_ok = resolved.map_or(false, |l| l == expected_label);

       if !version_ok || !label_ok {
           return Err(CryptoError::DecryptionFailed);
       }
       // Safe to unwrap — label_ok guarantees resolved is Some with matching value
       Ok(resolved.unwrap())
   }
   ```

   Key changes:
   - All pre-HPKE checks evaluate unconditionally (no short-circuit).
   - Error is a generic `DecryptionFailed` for all pre-check failures (no `InvalidFormat` that leaks which check failed).
   - The same `DecryptionFailed` error is returned for AEAD failures.

2. **Update tests**: Tests that currently match `CryptoError::InvalidFormat` for version/label mismatches must be updated to match `CryptoError::DecryptionFailed`. Specifically:
   - `label_mismatch_rejected` test
   - `version_check` test
   - `open_with_wrong_version_fails` test
   - `open_with_unknown_label_id_fails` test

### Trade-off

This reduces error diagnostics in logs. For debugging, the pre-check function could log the specific failure at `debug!` level (which is stripped in release builds) while returning the generic error.

---

## Finding H14 — Shamir Intermediate Values Not Zeroized (HIGH)

### Current State

`packages/crypto/src/shamir.rs:290-325` (`combine`):

```rust
let mut secret = vec![0u8; secret_len];
for (byte_idx, _) in shares[0].y.iter().enumerate() {
    let mut value = 0u8;
    for (i, share_i) in shares.iter().enumerate() {
        let xi = share_i.x;
        let yi = share_i.y[byte_idx];
        let mut numerator = 1u8;
        let mut denominator = 1u8;
        // ... Lagrange interpolation ...
        let lagrange_coeff = gf256_div(numerator, denominator)?;
        let term = gf256_mul(yi, lagrange_coeff);
        value = gf256_add(value, term);
    }
    secret[byte_idx] = value;
}
Ok(secret)
```

The `lagrange_coeff`, `numerator`, `denominator`, and `term` intermediate values are not zeroized. More critically, the reconstructed `secret` vector is returned as a plain `Vec<u8>` — the caller must zeroize it, but there's no type-level enforcement.

### Correct Behavior

1. All intermediate values that depend on share data or the reconstructed secret must be zeroized on drop.
2. The returned secret should use `Zeroizing<Vec<u8>>` to enforce automatic zeroization.

### Required Changes

1. **`packages/crypto/src/shamir.rs`**: Change `combine` return type:
   ```rust
   pub fn combine(shares: &[Share], threshold: u8) -> Result<Zeroizing<Vec<u8>>, CryptoError> {
   ```

2. **Use `Zeroizing` wrapper for the secret accumulator**:
   ```rust
   let mut secret = Zeroizing::new(vec![0u8; secret_len]);
   ```

3. **Zeroize intermediate u8 scalars**: For GF(2^8) operations on stack-allocated `u8` values, explicit zeroization is theoretically ideal but practically low-risk (single bytes on the stack are overwritten quickly). The priority is the `secret` vector.

4. **Desktop IPC `shamir_combine`** (`apps/desktop/src/crypto.rs:691-730`): This is a reimplementation that also doesn't zeroize. The fix is to delegate to `llamenos_core::shamir::combine()` instead of reimplementing. The desktop IPC Shamir functions (`shamir_split`, `shamir_combine`, `shamir_commit`, `shamir_verify`) should all delegate to the crypto crate.

### Zeroization Strategy Summary

| Type | Treatment |
|------|-----------|
| `secret` (reconstructed) in `combine()` | `Zeroizing<Vec<u8>>` return type |
| `coefficients` in `split()` | Already zeroized (`coeffs.zeroize()` at line 240) ✓ |
| `Share.y` | Already zeroized via `Drop` impl (line 147-150) ✓ |
| Lagrange intermediates (`numerator`, `denominator`, `lagrange_coeff`) | Stack `u8` — low risk, but for defense-in-depth, shadow with `let lagrange_coeff = { let c = gf256_div(...)?; c };` and `let _ = core::hint::black_box(0u8);` after the loop. |
| Desktop `crypto.rs` Shamir reimplementation | Delete and delegate to `llamenos_core` |

---

## Desktop Raw String Labels (HIGH)

### Current State

`src/client/lib/platform.ts` uses raw string labels in several places:

| Location | Raw String | Should Be |
|----------|-----------|-----------|
| `platform.ts:885` | `'llamenos:note-key'` | Import `LABEL_NOTE_KEY` from `@protocol/crypto-labels` |
| `platform.ts:896` | `'llamenos:note-key'` | Same |
| `platform.ts:922` | `'llamenos:note-key'` | Same |
| `platform.ts:953` | `'llamenos:message'` | Import `LABEL_MESSAGE` |
| `platform.ts:988` | `'llamenos:message'` | Same |
| `platform.ts:1018` | `'llamenos:call-meta'` | Import `LABEL_CALL_META` |

### Correct Behavior

Import label constants from `@protocol/crypto-labels` (or `@shared/crypto-labels` which re-exports them) and use the typed constants. This ensures compile-time checking and prevents typos.

### Required Changes

1. Add import at top of `platform.ts`:
   ```typescript
   import {
     LABEL_NOTE_KEY,
     LABEL_MESSAGE,
     LABEL_CALL_META,
   } from '@shared/crypto-labels'
   ```

2. Replace all raw string occurrences with the imported constants.

---

## Desktop `decrypt_server_event` Wrong Label (HIGH)

### Current State

`apps/desktop/src/crypto.rs:784`:
```rust
let aad = format!("{}:{}", llamenos_core::LABEL_HUB_EVENT, epoch);
```

The `decrypt_server_event` function uses `LABEL_HUB_EVENT` (`"llamenos:hub-event"`) as the AAD prefix for server event decryption. However, server events are encrypted with epoch-scoped keys and should use `LABEL_HUB_EVENT_EPOCH` (`"llamenos:hub-event-epoch:v1"`) for domain separation.

The `LABEL_HUB_EVENT` label is for hub-key-encrypted events (symmetric AES-GCM with the hub key). The `LABEL_HUB_EVENT_EPOCH` label is for server-key-encrypted events (epoch-scoped symmetric keys). Using the wrong label means the AAD doesn't match what the server used during encryption, **which should cause decryption to fail** (AES-GCM authenticates AAD).

### Investigation Required

Before implementing the fix, verify which label the **server** uses when encrypting these events. Check `apps/worker/` for the event encryption code to confirm whether it uses `LABEL_HUB_EVENT` or `LABEL_HUB_EVENT_EPOCH` as AAD. If the server uses `LABEL_HUB_EVENT`, then the desktop is correct and this finding is invalid. If the server uses `LABEL_HUB_EVENT_EPOCH`, then both must be aligned.

### Required Changes (pending investigation)

If the server uses `LABEL_HUB_EVENT_EPOCH`:
```rust
// Before:
let aad = format!("{}:{}", llamenos_core::LABEL_HUB_EVENT, epoch);
// After:
let aad = format!("{}:{}", llamenos_core::LABEL_HUB_EVENT_EPOCH, epoch);
```

If the server uses `LABEL_HUB_EVENT`, no change needed — but update the doc comment on `decrypt_server_event` to clarify why it uses that label.

---

## Desktop AES-GCM Missing AAD Domain Binding (HIGH)

### Current State

`src/client/lib/platform.ts:815-834` — `aesGcmEncrypt` and `aesGcmDecrypt`:
```typescript
await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, ...)
await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, ...)
```

These WebCrypto AES-GCM operations use **no `additionalData` (AAD)**. They are called from `encryptNote`, `encryptMessage`, and `decryptCallRecord` for content encryption after the HPKE key wrapping.

### Analysis

The content key is HPKE-wrapped with domain-separated labels (e.g., `LABEL_NOTE_KEY`). The AES-GCM content encryption is bound to that key — a note key cannot decrypt a message because the HPKE label differs. However, adding AAD to the AES-GCM layer provides **defense in depth**: even if an HPKE key were somehow reused across domains, the AAD mismatch would prevent cross-domain decryption.

### Required Changes

1. Update `aesGcmEncrypt` and `aesGcmDecrypt` to accept an optional `aad` parameter:
   ```typescript
   export async function aesGcmEncrypt(plaintext: string, keyHex: string, aad?: string): Promise<string>
   export async function aesGcmDecrypt(ciphertextHex: string, keyHex: string, aad?: string): Promise<string>
   ```

2. Pass the domain label as AAD from callers:
   - `encryptNote` → `aesGcmEncrypt(payloadJson, keyHex, LABEL_NOTE_KEY)`
   - `encryptMessage` → `aesGcmEncrypt(plaintext, keyHex, LABEL_MESSAGE)`
   - `decryptCallRecord` → `aesGcmDecrypt(encryptedContent, keyHex, LABEL_CALL_META)`

3. **Migration**: Since this changes the AES-GCM wire format (adding AAD), ensure the server-side encryption uses the same AAD. If notes/messages are encrypted client-side and decrypted client-side, this is purely a client change. Verify no server-side AES-GCM encryption uses these functions.

### Risk

Adding AAD to existing AES-GCM operations is a **breaking change** for any existing encrypted data. Since the project is pre-production with no stored production data, this is safe.

---

## Android Hardcoded HPKE Envelope Constants (HIGH)

### Current State

Multiple Android ViewModels construct `HpkeEnvelope` with hardcoded `v = 3` and `labelId = 0`:

| File | Line | Context |
|------|------|---------|
| `CryptoService.kt` | 609 | `labelId = 0.toUByte()` in `loadHubKey` |
| `NotesViewModel.kt` | 538, 545, 580, 587 | `HpkeEnvelope(v = 3, labelId = 0, ...)` |
| `CaseManagementViewModel.kt` | 646, 684, 720, 748 | `HpkeEnvelope(v = 3, labelId = 0, ...)` |
| `ConversationsViewModel.kt` | 482 | `labelId = 0` |

### Analysis

- `v = 3` is correct — it's the current envelope version.
- `labelId = 0` corresponds to `LABEL_NOTE_KEY` in the registry. This is correct for note decryption but wrong for hub key wrapping (`CryptoService.kt:609`), which should be `labelId = 3` (`LABEL_HUB_KEY_WRAP`).

However, the `labelId` in the envelope is validated by the Rust HPKE layer via `mobileHpkeOpenKey(envelope, expectedLabel, ...)`. The Rust side checks `envelope.labelId` against the `expectedLabel` parameter. So the hardcoded `labelId = 0` in Kotlin is overridden by the `expectedLabel` string passed to the FFI call.

**Wait — that's not how it works.** The Rust `hpke_open` function:
1. Resolves `envelope.label_id` to a label string.
2. Compares that resolved string to `expected_label`.
3. If they mismatch, returns error.

So if Android passes `labelId = 0` (which resolves to `LABEL_NOTE_KEY`) but `expectedLabel = LABEL_HUB_KEY_WRAP`, the Albrecht defense catches it and the call fails. **This means the hardcoded values are currently working only because the `expectedLabel` parameter happens to match the hardcoded `labelId` in the note decryption cases.**

For `CryptoService.kt:609` (`loadHubKey`), the code passes `labelId = 0` with `expectedLabel = CryptoLabels.LABEL_HUB_KEY_WRAP`. The Rust layer resolves `labelId = 0` to `"llamenos:note-key"`, compares with `"llamenos:hub-key-wrap"`, and **should fail**. This is either:
- A bug that is masked by the server sending `labelId = 3` in the actual envelope, or
- The Android code reconstructs the envelope from server data and the `labelId` field comes from the server (not hardcoded).

### Investigation Required

Check how Android constructs `HpkeEnvelope` for `loadHubKey`:
```kotlin
val ffiEnvelope = org.llamenos.core.HpkeEnvelope(
    v = 3.toUByte(),
    labelId = 0.toUByte(),  // <-- Is this the actual labelId from the server?
    enc = envelope.envelope.enc,
    ct = envelope.envelope.ct,
)
```

The `envelope` parameter comes from `HubKeyEnvelopeResponse` which has `enc` and `ct` fields. If the server's response also includes a `labelId` field, Android is ignoring it and hardcoding 0. If the server doesn't send `labelId`, then Android's hardcoded value is wrong.

### Required Changes

1. **`CryptoService.kt:loadHubKey`**: Use the correct `labelId` from the registry:
   ```kotlin
   // Look up the registry index for LABEL_HUB_KEY_WRAP
   val ffiEnvelope = org.llamenos.core.HpkeEnvelope(
       v = 3.toUByte(),
       labelId = CryptoLabels.LABEL_HUB_KEY_WRAP_ID.toUByte(),
       enc = envelope.envelope.enc,
       ct = envelope.envelope.ct,
   )
   ```

2. **All ViewModels**: Similarly, use the correct `labelId` for each operation:
   - Notes: `LABEL_NOTE_KEY` → labelId 0 (currently correct)
   - Messages: `LABEL_MESSAGE` → labelId 5
   - Call records: `LABEL_CALL_META` → labelId 6
   - Hub key: `LABEL_HUB_KEY_WRAP` → labelId 3

3. **Codegen enhancement**: The `CryptoLabels.kt` generated file should include numeric ID constants alongside string values:
   ```kotlin
   object CryptoLabels {
       const val LABEL_NOTE_KEY = "llamenos:note-key"
       const val LABEL_NOTE_KEY_ID = 0
       // ...
   }
   ```
   This requires updating `packages/protocol/tools/codegen.ts` to emit `_ID` constants from the registry ordering.

4. **Alternatively**: Propagate the `labelId` from the server envelope rather than hardcoding. If the server sends `HpkeEnvelope` objects with the correct `labelId`, Android should pass them through to the FFI layer.

---

## Dependency Ordering

Changes must land in this order due to data flow dependencies:

### Phase 1: Labels (MUST be first)
1. Add 7 missing labels + 2 new labels (SFrame nonce, Shamir commitment) to `crypto-labels.json`
2. Add matching constants + registry entries to `labels.rs`
3. Add CI guard integration test (`label_sync_test.rs`)
4. Run `bun run codegen` to regenerate TS/Swift/Kotlin label constants
5. Run `cargo test` to validate

### Phase 2: Crypto Crate Fixes (depends on Phase 1 labels)
6. Fix SFrame nonce raw string (H10) — uses new `LABEL_SFRAME_NONCE`
7. Fix Shamir commitment context binding (H11) — uses new `LABEL_SHAMIR_COMMITMENT`
8. Fix HPKE envelope timing leakage (H12)
9. Fix Shamir zeroization (H14)
10. Run `cargo test` — all crypto tests must pass

### Phase 3: Client Fixes (depends on Phase 1 codegen + Phase 2 API)
11. Desktop: Replace raw string labels in `platform.ts`
12. Desktop: Fix `decrypt_server_event` label (pending investigation)
13. Desktop: Add AES-GCM AAD domain binding
14. Desktop: Deduplicate Shamir IPC (delegate to llamenos_core)
15. Android: Fix hardcoded HPKE envelope constants
16. iOS/Android: Add WS signature verification (depends on WS protocol migration)

### Phase 4: CI (can be done in parallel with Phase 2-3)
17. Add pre-commit label check script
18. Verify CI runs `cargo test` on label changes

---

## Cross-Platform Coordination Notes

- **After adding labels to `crypto-labels.json`**: Run `bun run codegen` before building any platform. The generated files are gitignored, so CI must run codegen as a build prerequisite.
- **iOS WS verification**: Blocked on iOS WS protocol migration from Nostr to signed-event format. Can be tracked as a separate task.
- **Android WS verification**: Same migration prerequisite as iOS.
- **Desktop Shamir dedup**: Removing the desktop IPC Shamir reimplementation requires testing that the `llamenos_core` exports are accessible from the IPC layer. The `apps/desktop/Cargo.toml` already has a path dependency on `packages/crypto`.
- **Envelope version**: `v = 3` is the only supported version. No need for version negotiation in Android hardcoded values — but the `labelId` MUST be correct per-operation.
