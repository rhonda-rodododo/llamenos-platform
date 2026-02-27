# Epic 112: Comprehensive Crypto Test Vectors

**Status: PENDING**
**Repos**: llamenos-core (generation) + llamenos (consumption)
**Priority**: Critical — cryptographic interoperability assurance
**Depends on**: None (independent)
**Blocks**: Epic 113 (mobile interop), Epic 117 (adversarial tests)

## Summary

Expand `test-vectors.json` from 7 categories to 14, achieving full coverage of every cryptographic operation in the protocol. Rust generates authoritative vectors; TypeScript (Playwright) validates cross-platform decryption.

## Current State

### Existing Vector Categories (7)

| # | Category | Struct | Status |
|---|----------|--------|--------|
| 1 | Key derivation | `KeyVectors` | Complete |
| 2 | ECIES wrap/unwrap | `EciesVectors` | Complete (LABEL_NOTE_KEY only) |
| 3 | Note encryption V2 | `NoteEncryptionVectors` | Complete |
| 4 | Auth token (Schnorr) | `AuthVectors` | Complete |
| 5 | PIN encryption | `PinEncryptionVectors` | Complete |
| 6 | Draft encryption | `DraftEncryptionVectors` | Complete |
| 7 | Label constants | `LabelVectors` | Complete (28 labels) |

### Current Test Key Constants (from `interop.rs`)

```rust
const TEST_SECRET_KEY: &str = "7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f";
const TEST_ADMIN_SECRET_KEY: &str = "0101010101010101010101010101010101010101010101010101010101010101";
```

These well-known keys produce deterministic pubkeys used across all vector categories.

## New Vector Categories (7 additions → 14 total)

### 8. Message Encryption (`MessageEncryptionVectors`)

Per-message envelope encryption with multi-reader ECIES wrapping. Tests the E2EE messaging path (Epic 74).

**Rust generation:**
```rust
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MessageEncryptionVectors {
    plaintext: String,
    reader_pubkeys: Vec<String>,          // volunteer + admin pubkeys
    encrypted_content: String,             // hex(nonce_24 + ciphertext)
    reader_envelopes: Vec<RecipientKeyEnvelope>, // per-reader wrapped keys
}
```

**Test logic:**
- Encrypt "Hello from volunteer" for 2 readers (volunteer + admin)
- Each reader decrypts with their own key → same plaintext
- Uses `LABEL_MESSAGE` domain separation

**JS consumption test:**
```typescript
test('JS can decrypt message produced by Rust', () => {
  const { plaintext, encryptedContent, readerEnvelopes } = vectors.messageEncryption
  // Decrypt as volunteer (TEST_SECRET_KEY)
  const volResult = decryptMessage(encryptedContent, readerEnvelopes, TEST_SECRET_KEY, TEST_PUBKEY)
  expect(volResult).toBe(plaintext)
  // Decrypt as admin (TEST_ADMIN_SECRET_KEY)
  const adminResult = decryptMessage(encryptedContent, readerEnvelopes, TEST_ADMIN_SECRET_KEY, TEST_ADMIN_PUBKEY)
  expect(adminResult).toBe(plaintext)
})
```

### 9. Hub Key Wrapping (`HubKeyVectors`)

Hub key = random 32 bytes, ECIES-wrapped individually per member via `LABEL_HUB_KEY_WRAP`.

**Rust generation:**
```rust
struct HubKeyVectors {
    hub_key_hex: String,                   // random 32-byte hub key
    member_pubkeys: Vec<String>,           // 2 members
    wrapped_envelopes: Vec<KeyEnvelope>,   // per-member ECIES wraps
    label: String,                         // "llamenos:hub-key-wrap"
}
```

**Test logic:**
- Generate random 32-byte hub key
- Wrap for volunteer + admin
- Each unwraps → same hub key

### 10. Nostr Event Signing (`NostrEventVectors`)

NIP-01 event signing: canonical JSON → SHA-256 → BIP-340 Schnorr signature.

**Rust generation:**
```rust
struct NostrEventVectors {
    kind: u64,
    created_at: u64,
    tags: Vec<Vec<String>>,
    content: String,
    expected_id: String,        // SHA-256(canonical JSON)
    signature: String,          // BIP-340 Schnorr over event ID
    pubkey: String,             // x-only author pubkey
    canonical_json: String,     // for debugging: `[0, pubkey, created_at, kind, tags, content]`
}
```

**Test logic:**
- Create event: kind 20001, created_at 1700000000, tags `[["d","test-hub"],["t","llamenos:event"]]`, content "encrypted-content"
- Sign with TEST_SECRET_KEY
- JS verifies: recompute event ID from canonical JSON, verify Schnorr sig

**JS consumption test:**
```typescript
test('JS can verify Nostr event produced by Rust', () => {
  const { kind, createdAt, tags, content, expectedId, signature, pubkey } = vectors.nostrEvent
  // Recompute event ID
  const canonical = JSON.stringify([0, pubkey, createdAt, kind, tags, content])
  const computedId = bytesToHex(sha256(utf8ToBytes(canonical)))
  expect(computedId).toBe(expectedId)
  // Verify Schnorr signature
  const valid = schnorr.verify(signature, expectedId, pubkey)
  expect(valid).toBe(true)
})
```

### 11. Export Encryption (`ExportEncryptionVectors`)

JSON blob → HKDF-derived key → XChaCha20-Poly1305 → base64 output.

**Rust generation:**
```rust
struct ExportEncryptionVectors {
    plaintext_json: String,     // JSON string being exported
    secret_key_hex: String,     // author's secret key
    encrypted_base64: String,   // base64(nonce_24 + ciphertext)
    context: String,            // "llamenos:export"
}
```

**Test logic:**
- Encrypt a JSON object `{"notes": [...], "exportedAt": "2024-01-01"}`
- HKDF derivation: `HKDF-SHA256(salt=HKDF_SALT, ikm=secret_key, info=HKDF_CONTEXT_EXPORT)`
- JS decrypts → same JSON string

### 12. Call Record Metadata (`CallRecordVectors`)

Admin-only encrypted call metadata using `LABEL_CALL_META`.

**Rust generation:**
```rust
struct CallRecordVectors {
    plaintext_json: String,                    // {"answeredBy": "...", "callerNumber": "+1..."}
    admin_pubkeys: Vec<String>,
    encrypted_content: String,                  // hex(nonce + ciphertext)
    admin_envelopes: Vec<RecipientKeyEnvelope>, // admin-only wrapped keys
}
```

**Test logic:**
- Encrypt call record metadata for admin-only access
- Only admin key can decrypt (volunteer key must fail)
- Uses the same multi-recipient pattern as message encryption

### 13. Server Nostr Key Derivation (`ServerKeyVectors`)

HKDF derivation of server's Nostr keypair from `SERVER_NOSTR_SECRET`.

**Rust generation:**
```rust
struct ServerKeyVectors {
    server_secret_hex: String,          // 64 hex chars (32 bytes)
    derived_secret_hex: String,         // HKDF output
    derived_pubkey_hex: String,         // x-only pubkey
    label: String,                      // "llamenos:server-nostr-key"
    info: String,                       // "llamenos:server-nostr-key:v1"
}
```

**Test logic:**
- Use a well-known 32-byte server secret
- HKDF-SHA256(salt=LABEL_SERVER_NOSTR_KEY, ikm=server_secret, info=LABEL_SERVER_NOSTR_KEY_INFO)
- JS recomputes → same derived pubkey

### 14. Domain Separation Proof (`DomainSeparationVectors`)

Proves that ECIES wrapping with one label cannot be unwrapped with another.

**Rust generation:**
```rust
struct DomainSeparationVectors {
    original_key_hex: String,
    wrapped_with_note_label: KeyEnvelope,    // LABEL_NOTE_KEY
    wrapped_with_message_label: KeyEnvelope, // LABEL_MESSAGE
    wrapped_with_hub_label: KeyEnvelope,     // LABEL_HUB_KEY_WRAP
    recipient_pubkey: String,
}
```

**Test logic:**
- Same 32-byte key wrapped with 3 different labels
- JS unwrap with matching label → success
- JS unwrap with mismatched label → must throw (crypto auth tag failure)
- This proves domain separation is correctly enforced

## Rust Implementation

### File: `llamenos-core/tests/interop.rs`

Expand `generate_and_verify_test_vectors()` to produce all 14 categories. Add new Rust roundtrip tests:

```rust
#[test]
fn message_encryption_roundtrip() { ... }

#[test]
fn hub_key_multi_recipient_wrap() { ... }

#[test]
fn nostr_event_signing_and_verification() { ... }

#[test]
fn export_encryption_roundtrip() { ... }

#[test]
fn call_record_admin_only_decryption() { ... }

#[test]
fn server_nostr_key_derivation() { ... }

#[test]
fn domain_separation_cross_label_rejection() { ... }
```

### File: `llamenos-core/tests/fixtures/test-vectors.json`

Bump version to `"2"`. Regenerated by running `cargo test --test interop`.

New top-level keys:
```json
{
  "version": "2",
  "keys": { ... },
  "ecies": { ... },
  "noteEncryption": { ... },
  "auth": { ... },
  "pinEncryption": { ... },
  "draftEncryption": { ... },
  "labels": { ... },
  "messageEncryption": { ... },
  "hubKey": { ... },
  "nostrEvent": { ... },
  "exportEncryption": { ... },
  "callRecord": { ... },
  "serverKey": { ... },
  "domainSeparation": { ... }
}
```

## TypeScript Consumption

### File: `llamenos/tests/crypto-interop.spec.ts`

Add 7 new test cases (domain separation is already partially tested):

```typescript
test('JS can decrypt message produced by Rust', () => { ... })
test('JS can unwrap hub key produced by Rust', () => { ... })
test('JS can verify Nostr event produced by Rust', () => { ... })
test('JS can decrypt export produced by Rust', () => { ... })
test('JS can decrypt call record produced by Rust (admin)', () => { ... })
test('JS can derive server Nostr key matching Rust', () => { ... })
test('Domain separation prevents cross-label unwrap', () => { ... })
```

### Import Requirements

The crypto-interop.spec.ts already imports from `@noble/*`. New tests may need:
- `hkdf` from `@noble/hashes/hkdf.js`
- Nostr canonical JSON computation (manual, no library needed)
- `decryptMessage` from `tests/mocks/crypto-impl.ts`
- `decryptCallRecord` from `tests/mocks/crypto-impl.ts`

## Files to Modify

- `llamenos-core/tests/interop.rs` — expand with 7 new vector categories + 7 new roundtrip tests
- `llamenos-core/tests/fixtures/test-vectors.json` — regenerated (version "2")
- `llamenos/tests/crypto-interop.spec.ts` — add 7 new consumption tests

## Verification

1. `cd ~/projects/llamenos-core && cargo test --test interop` — generates updated vectors, all 14+ Rust tests pass
2. `cd ~/projects/llamenos && bun run test -- tests/crypto-interop.spec.ts` — all 14+ JS consumption tests pass
3. `test-vectors.json` version field is `"2"`
4. Every crypto label in `crypto-labels.ts` has at least one vector exercising it
