---
name: e2ee-envelope-operations
description: Use when adding encryption for a new data type, implementing envelope encryption, working with ECIES key wrapping, managing crypto labels, or handling multi-recipient decryption. Also use when the user mentions "encrypt", "E2EE", "envelope", "ECIES", "forward secrecy", "crypto label", "admin envelope", "content key", or needs to understand how data is encrypted at rest.
---

# E2EE Envelope Encryption Operations

## Core Pattern

Per-record envelope encryption with forward secrecy. Every encrypted record follows this flow:

```
1. Generate random 32-byte content key (unique per record — NEVER reuse)
2. Encrypt plaintext with XChaCha20-Poly1305 using content key
3. ECIES-wrap content key for EACH reader (author + every admin)
4. Store: ciphertext + wrapped envelopes (server never sees plaintext or content key)
5. Decrypt: find your envelope by pubkey -> ECIES-unwrap -> decrypt content
```

Wire format for encrypted content: `hex(nonce_24 + ciphertext)`

Wire format for ECIES envelope: `hex(version_byte_1 + nonce_24 + ciphertext_48)` where ciphertext_48 = 32-byte key + 16-byte Poly1305 tag.

## Existing Encrypted Data Types

| Type | Readers | Label Constant | Rust Label String | IPC Command |
|------|---------|----------------|-------------------|-------------|
| Notes | author + admins | `LABEL_NOTE_KEY` | `llamenos:note-key` | `encrypt_note` / `decrypt_note_from_state` |
| Messages | assigned volunteer + admins | `LABEL_MESSAGE` | `llamenos:message` | `encrypt_message` / `decrypt_message_from_state` |
| Call records | answering volunteer + admins | `LABEL_CALL_META` | `llamenos:call-meta` | `decrypt_call_record_from_state` |
| Files (key wrap) | uploader + admins | `LABEL_FILE_KEY` | `llamenos:file-key` | `unwrap_file_key_from_state` / `rewrap_file_key_from_state` |
| File metadata | uploader + admins | `LABEL_FILE_METADATA` | `llamenos:file-metadata` | `decrypt_file_metadata_from_state` |
| Transcriptions | volunteer + admins | `LABEL_TRANSCRIPTION` | `llamenos:transcription` | `decrypt_transcription_from_state` |
| Hub key | all hub members | `LABEL_HUB_KEY_WRAP` | `llamenos:hub-key-wrap` | `unwrap_hub_key_from_state` |
| Contact IDs | system | `LABEL_CONTACT_ID` | `llamenos:contact-identifier` | HKDF deterministic hash, NOT envelope |
| Drafts | author only | `HKDF_CONTEXT_DRAFTS` | `llamenos:drafts` | `encrypt_draft_from_state` / `decrypt_draft_from_state` |
| Exports | author only | `HKDF_CONTEXT_EXPORT` | `llamenos:export` | `encrypt_export_from_state` |

Notes and messages use the full envelope pattern (multi-recipient ECIES wrapping). Drafts and exports use HKDF-derived symmetric keys (single-user, no envelope).

## Adding a New Encrypted Data Type — Checklist

### Step 1: Add the crypto label

Add a new entry to `packages/protocol/crypto-labels.json`:

```json
{
  "labels": {
    "LABEL_YOUR_TYPE": "llamenos:your-type"
  }
}
```

Run codegen to generate TS/Swift/Kotlin constants:

```bash
bun run codegen
```

### Step 2: Add Rust label constant

Add to `packages/crypto/src/labels.rs`:

```rust
/// Description of what this label separates
pub const LABEL_YOUR_TYPE: &str = "llamenos:your-type";
```

Add assertion to the `labels_match_typescript` test in the same file.

### Step 3: Add encrypt/decrypt functions

Add to `packages/crypto/src/encryption.rs`. Follow the existing pattern — see `encrypt_note` / `decrypt_note` or `encrypt_message` / `decrypt_message` as templates.

For multi-recipient envelope types:

```rust
pub struct EncryptedYourType {
    pub encrypted_content: String,          // hex(nonce_24 + ciphertext)
    pub author_envelope: KeyEnvelope,       // for the author
    pub admin_envelopes: Vec<RecipientKeyEnvelope>, // one per admin
}

pub fn encrypt_your_type(
    plaintext: &str,
    author_pubkey: &str,
    admin_pubkeys: &[String],
) -> Result<EncryptedYourType, CryptoError> {
    let mut content_key = random_bytes_32();
    // ... XChaCha20-Poly1305 encrypt with content_key ...
    // ... ecies_wrap_key(&content_key, author_pubkey, LABEL_YOUR_TYPE) ...
    // ... ecies_wrap_key(&content_key, each_admin, LABEL_YOUR_TYPE) ...
    content_key.zeroize();
    // return EncryptedYourType { ... }
}
```

Add roundtrip tests in the same file's `mod tests`.

Re-export the new struct from `packages/crypto/src/lib.rs` if needed.

### Step 4: Add Tauri IPC commands

Add to `apps/desktop/src/crypto.rs`:

```rust
#[tauri::command]
pub fn encrypt_your_type(
    payload_json: String,
    author_pubkey: String,
    admin_pubkeys: Vec<String>,
) -> Result<EncryptedYourType, String> {
    encryption::encrypt_your_type(&payload_json, &author_pubkey, &admin_pubkeys)
        .map_err(err_str)
}

#[tauri::command]
pub fn decrypt_your_type_from_state(
    state: tauri::State<'_, CryptoState>,
    encrypted_content: String,
    envelope: KeyEnvelope,
) -> Result<String, String> {
    let sk_hex = state.get_secret_key()?;
    encryption::decrypt_your_type(&encrypted_content, &envelope, &sk_hex)
        .map_err(err_str)
}
```

Encrypt commands are stateless (no secret key needed — only pubkeys).
Decrypt commands use `_from_state` suffix (secret key stays in Rust).

### Step 5: Register in generate_handler

Add to `apps/desktop/src/lib.rs` inside `tauri::generate_handler![]`:

```rust
// Stateless (encrypt)
crypto::encrypt_your_type,
// Stateful (decrypt)
crypto::decrypt_your_type_from_state,
```

### Step 6: Add platform.ts wrapper

Add to `src/client/lib/platform.ts`:

```typescript
export async function encryptYourType(
  payloadJson: string,
  authorPubkey: string,
  adminPubkeys: string[],
): Promise<EncryptedYourType> {
  return invoke('encrypt_your_type', {
    payloadJson, authorPubkey, adminPubkeys,
  });
}

export async function decryptYourTypeFromState(
  encryptedContent: string,
  envelope: KeyEnvelope,
): Promise<string> {
  return invoke('decrypt_your_type_from_state', {
    encryptedContent, envelope,
  });
}
```

### Step 7: Add Playwright mock

Add to `tests/mocks/tauri-ipc-mock.ts` — mirror the Rust logic in JS using `@noble/curves` and `@noble/ciphers`. The mock must produce byte-compatible output.

### Step 8: Add server-side storage

Add encrypted fields to the relevant Durable Object. Store ONLY:
- `encryptedContent` (hex string)
- `authorEnvelope` or `readerEnvelopes` (ECIES envelopes)
- `version: 2` (for future algorithm migration)

NEVER store plaintext. NEVER log plaintext.

### Step 9: Update mobile platforms (if applicable)

- iOS: UniFFI auto-generates from `#[cfg_attr(feature = "mobile", derive(uniffi::Record))]`
- Android: JNI wraps the same Rust functions
- Rebuild with `packages/crypto/scripts/build-mobile.sh ios|android`

## ECIES Implementation Details

Source: `packages/crypto/src/ecies.rs`

### Wrapping (ecies_wrap_key)

```
1. Generate ephemeral secp256k1 keypair (random per wrap)
2. Parse recipient x-only pubkey (32 bytes) -> prepend 0x02 for compressed SEC1
3. ECDH: ephemeral_secret x recipient_pubkey -> shared_point
4. Extract shared_x (32 bytes) from shared_point
5. KDF: HKDF-SHA256(ikm=shared_x, salt=empty, info=label_bytes) -> 32-byte symmetric key
6. Encrypt: XChaCha20-Poly1305(symmetric_key, random_24_nonce, content_key)
7. Output: KeyEnvelope {
     wrapped_key: hex(version_0x02 + nonce_24 + ciphertext_48),
     ephemeral_pubkey: hex(compressed_33)
   }
8. Zeroize: symmetric_key, shared_x
```

### Unwrapping (ecies_unwrap_key)

```
1. Parse secret key (32 bytes hex)
2. Parse ephemeral pubkey (compressed SEC1, 33 bytes)
3. ECDH: decryptor_secret x ephemeral_pubkey -> shared_x
4. Detect version: first byte == 0x02 -> v2 (HKDF), else v1 (legacy SHA-256)
5. Derive symmetric key using same KDF as wrapping
6. Decrypt: XChaCha20-Poly1305 -> recover 32-byte content key
7. Zeroize: symmetric_key, shared_x, sk_bytes
```

### Version Migration

- v2 (current): `HKDF-SHA256(ikm=shared_x, salt=empty, info=label)` — prefixed with `0x02` version byte
- v1 (legacy): `SHA-256(label || shared_x)` — no version byte prefix
- `ecies_unwrap_key_versioned()` returns `(key, needs_migration: bool)` for v1 data

## Multi-Admin Decryption Flow

Each admin receives an independent ECIES envelope with its own ephemeral keypair:

```
Record encrypted with content_key K:
  admin_envelopes: [
    { pubkey: "admin1_pk", wrappedKey: ECIES(K, admin1_pk), ephemeralPubkey: "eph1" },
    { pubkey: "admin2_pk", wrappedKey: ECIES(K, admin2_pk), ephemeralPubkey: "eph2" },
  ]
```

Decryption:
1. Find envelope where `pubkey == my_pubkey`
2. ECDH: `my_secret x ephemeral_pubkey -> shared_x`
3. HKDF derive symmetric key with the record's label
4. Unwrap content key K
5. XChaCha20-Poly1305 decrypt the `encrypted_content` with K

If no envelope matches your pubkey, decryption fails with `DecryptionFailed`.

## Platform-Specific Patterns

### Desktop (Tauri)

- Encrypt: stateless IPC command (e.g., `encrypt_note`) — only needs pubkeys
- Decrypt: stateful `_from_state` command — CryptoState holds nsec in Rust memory
- The nsec NEVER crosses the IPC boundary (except during one-time provisioning with token)
- Always import from `src/client/lib/platform.ts`, never from `@tauri-apps/*` directly

### iOS (UniFFI)

- `CryptoService.shared.encryptNote(payload:authorPubkey:adminPubkeys:)` -> `EncryptedNote`
- nsecHex is private property, never exposed outside CryptoService
- Structs auto-generated via `#[cfg_attr(feature = "mobile", derive(uniffi::Record))]`

### Android (JNI)

- `CryptoService.encryptNote(payload, authorPubkey, adminPubkeys)` -> `EncryptedNote`
- Same Rust code, JNI binding layer
- Placeholder mock active until native `.so` files are linked

### Server (Worker/Node.js)

- Server encrypts inbound messages on webhook receipt, discards plaintext immediately
- Uses `@noble/curves/secp256k1` + `@noble/ciphers` for ECIES in JS
- Server CANNOT decrypt E2EE data (no access to volunteer/admin secret keys)

## Critical Rules

1. **NEVER do crypto in the webview** — always route through Tauri IPC (desktop), CryptoService (mobile), or Worker (server-side encryption of inbound data). A single IPC command handles the full encrypt or decrypt operation.

2. **NEVER use raw string literals for labels** — import from generated constants (`LABEL_NOTE_KEY`, etc.). Source of truth: `packages/protocol/crypto-labels.json`.

3. **NEVER put plaintext in Nostr events** — Nostr events are encrypted notifications for real-time transport. Data at rest lives in Durable Objects.

4. **NEVER reuse content keys** — each record (note, message, call record, file) gets its own `random_bytes_32()` content key. This provides forward secrecy.

5. **Hub key is for Nostr event encryption ONLY** — do NOT use `LABEL_HUB_KEY_WRAP` for data at rest. Hub key encrypts ephemeral transport; envelope encryption protects stored data.

6. **Forward secrecy means old data is NOT re-encrypted for new admins** — a new admin cannot decrypt records created before they were added. This is by design.

7. **Always include `version: 2`** in encrypted record storage for future algorithm migration.

8. **Zeroize all key material** — call `.zeroize()` on content keys, symmetric keys, shared secrets, and secret key bytes after use. Use `Zeroizing<Vec<u8>>` for plaintext outputs.

## Common Mistakes

| Mistake | Why It Breaks | Fix |
|---------|--------------|-----|
| Crypto operations in JS/webview | nsec exposure to webview process | Route through Tauri IPC as a single command |
| Forgetting admin envelopes | Only the author can decrypt | Always wrap for `author_pubkey` AND each `admin_pubkeys` |
| Using hub key for data at rest | Hub key is shared with all members, no per-record isolation | Use envelope pattern with per-record random key |
| Raw string label `"llamenos:note-key"` | Typo risk, no compile-time checking | Import `LABEL_NOTE_KEY` from labels module |
| Not running `bun run codegen` after label change | TS/Swift/Kotlin constants out of sync with JSON Schema | Always run codegen, CI validates with `codegen:check` |
| Re-encrypting old data for new admins | Breaks forward secrecy guarantee | New admins only decrypt future records |
| Missing `version: 2` in stored records | No migration path for future algorithm changes | Include version field in every encrypted record |
| Forgetting to zeroize content key | Key material lingers in memory | Call `content_key.zeroize()` after all envelopes are created |
| Using `ecies_unwrap_key` (stateless) on desktop | Secret key crosses IPC boundary | Use `ecies_unwrap_key_from_state` (stateful) |

## File Locations

| File | Purpose |
|------|---------|
| `packages/protocol/crypto-labels.json` | Source of truth for all 28 domain separation labels |
| `packages/crypto/src/labels.rs` | Rust label constants (must match JSON) |
| `packages/crypto/src/ecies.rs` | ECIES wrap/unwrap implementation |
| `packages/crypto/src/encryption.rs` | High-level encrypt/decrypt for notes, messages, call records, drafts, exports |
| `apps/desktop/src/crypto.rs` | Tauri IPC command wrappers + CryptoState |
| `apps/desktop/src/lib.rs` | `generate_handler![]` registration (line 144) |
| `src/client/lib/platform.ts` | Frontend platform abstraction (Tauri IPC calls) |
| `tests/mocks/tauri-ipc-mock.ts` | Playwright test mock (JS crypto matching Rust output) |
| `packages/protocol/generated/typescript/` | Generated TS types from JSON Schema |
| `packages/protocol/generated/swift/` | Generated Swift types |
| `packages/protocol/generated/kotlin/` | Generated Kotlin types |
