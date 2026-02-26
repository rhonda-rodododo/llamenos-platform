# Epic 92: Rust IPC Expansion

**Status**: Complete
**Depends on**: Epic 81 (Phase 1 complete)
**Blocks**: Epic 93 (Tauri-Only TS Migration)

## Goal

Add new Rust functions to `llamenos-core` and new Tauri IPC commands in `crypto.rs` so that **every crypto operation that requires the secret key** can be performed through Rust CryptoState without the nsec ever entering the webview. This epic is purely additive — no existing functions are removed or signatures changed.

## Context

After Epic 81 Phase 1, `platform.ts` routes the most common crypto operations through Rust IPC when on desktop. However, several operations still delegate to JS (`crypto.ts`) even on desktop:

| Operation | Current state | Why |
|-----------|--------------|-----|
| `decryptCallRecord` | JS always | No Rust IPC command exists |
| `decryptLegacyNote` | JS always | No Rust IPC command exists |
| `decryptTranscription` | JS always | No Rust IPC command exists |
| `encryptDraft` / `decryptDraft` | JS always | No Rust IPC command exists |
| `encryptExport` | JS always | No Rust IPC command exists |
| `signNostrEvent` | JS via `finalizeEvent(template, sk)` | No Rust IPC command exists |
| `isValidNsec` / `keyPairFromNsec` | JS sync (crypto.ts) | Need stateless IPC equivalents |
| File crypto ECIES ops | JS (file-crypto.ts) | Uses `eciesUnwrapKey` from crypto.ts directly |
| Hub key unwrap | JS (hub-key-manager.ts) | Uses `eciesUnwrapKey` from crypto.ts directly |

This epic adds the missing Rust-side functions so Epic 93 can rewire all TypeScript call sites.

## Phase 1: llamenos-core Additions

### 1.1 Call Record Decryption (already exists)

`decrypt_call_record` already exists in `llamenos-core/src/encryption.rs`:

```rust
pub fn decrypt_call_record(
    encrypted_content: &str,
    admin_envelopes: &[RecipientKeyEnvelope],
    secret_key_hex: &str,
    reader_pubkey: &str,
) -> Result<String, CryptoError>
```

No changes needed in llamenos-core for this operation.

### 1.2 Legacy Note Decryption

Add to `llamenos-core/src/encryption.rs`:

```rust
/// Decrypt a V1 legacy note (HKDF-derived key, not per-note forward secrecy).
/// packed = hex(nonce(24) + ciphertext)
pub fn decrypt_legacy_note(
    packed_hex: &str,
    secret_key_hex: &str,
) -> Result<String, CryptoError> {
    let sk_bytes = hex::decode(secret_key_hex)
        .map_err(|_| CryptoError::InvalidSecretKey)?;
    let encryption_key = derive_encryption_key(
        &sk_bytes.try_into().map_err(|_| CryptoError::InvalidSecretKey)?,
        HKDF_CONTEXT_NOTES,
    );

    let data = hex::decode(packed_hex)
        .map_err(|_| CryptoError::InvalidCiphertext)?;
    if data.len() < 24 {
        return Err(CryptoError::InvalidNonce);
    }
    let nonce = &data[..24];
    let ciphertext = &data[24..];

    let cipher = XChaCha20Poly1305::new(GenericArray::from_slice(&encryption_key));
    let plaintext = cipher.decrypt(GenericArray::from_slice(nonce), ciphertext)
        .map_err(|_| CryptoError::DecryptionFailed)?;

    let _guard = zeroize::Zeroizing::new(encryption_key);
    String::from_utf8(plaintext)
        .map_err(|_| CryptoError::DecryptionFailed)
}
```

### 1.3 Transcription Decryption

Add to `llamenos-core/src/encryption.rs`:

```rust
/// Decrypt a server-encrypted transcription.
/// Uses ECIES: ephemeral ECDH with server's ephemeral pubkey + LABEL_TRANSCRIPTION.
/// packed = hex(nonce(24) + ciphertext)
pub fn decrypt_transcription(
    packed_hex: &str,
    ephemeral_pubkey_hex: &str,
    secret_key_hex: &str,
) -> Result<String, CryptoError> {
    // Perform ECIES decryption with LABEL_TRANSCRIPTION
    let envelope = KeyEnvelope {
        wrapped_key: packed_hex.to_string(),
        ephemeral_pubkey: ephemeral_pubkey_hex.to_string(),
    };
    // Note: transcription uses a different structure — the packed data IS the
    // content (not a wrapped key). We need a dedicated ECIES decrypt that handles
    // arbitrary-length data, not just 32-byte keys.
    let sk_bytes = hex::decode(secret_key_hex)
        .map_err(|_| CryptoError::InvalidSecretKey)?;
    let sk = k256::SecretKey::from_slice(&sk_bytes)
        .map_err(|_| CryptoError::InvalidSecretKey)?;

    let ephemeral_pub = parse_public_key(ephemeral_pubkey_hex)?;
    let shared = k256::ecdh::diffie_hellman(
        sk.to_nonzero_scalar(),
        ephemeral_pub.as_affine(),
    );
    let shared_x = shared.raw_secret_bytes();

    // Derive symmetric key: SHA-256(label || shared_x)
    let label = LABEL_TRANSCRIPTION.as_bytes();
    let mut key_input = Vec::with_capacity(label.len() + shared_x.len());
    key_input.extend_from_slice(label);
    key_input.extend_from_slice(shared_x);
    let symmetric_key = Sha256::digest(&key_input);

    let data = hex::decode(packed_hex)
        .map_err(|_| CryptoError::InvalidCiphertext)?;
    if data.len() < 24 {
        return Err(CryptoError::InvalidNonce);
    }
    let nonce = &data[..24];
    let ciphertext = &data[24..];

    let cipher = XChaCha20Poly1305::new(GenericArray::from_slice(&symmetric_key));
    let plaintext = cipher.decrypt(GenericArray::from_slice(nonce), ciphertext)
        .map_err(|_| CryptoError::DecryptionFailed)?;

    String::from_utf8(plaintext)
        .map_err(|_| CryptoError::DecryptionFailed)
}
```

### 1.4 Draft Encryption/Decryption

`encrypt_draft` and `decrypt_draft` already exist in `llamenos-core/src/encryption.rs`. No changes needed.

### 1.5 Export Encryption

Add to `llamenos-core/src/encryption.rs`:

```rust
/// Encrypt a JSON export blob. Returns base64-encoded ciphertext.
/// Uses HKDF-derived key with HKDF_CONTEXT_EXPORT.
pub fn encrypt_export(
    json_string: &str,
    secret_key_hex: &str,
) -> Result<String, CryptoError> {
    let sk_bytes = hex::decode(secret_key_hex)
        .map_err(|_| CryptoError::InvalidSecretKey)?;
    let encryption_key = derive_encryption_key(
        &sk_bytes.try_into().map_err(|_| CryptoError::InvalidSecretKey)?,
        HKDF_CONTEXT_EXPORT,
    );

    let nonce_bytes = random_bytes_24();
    let cipher = XChaCha20Poly1305::new(GenericArray::from_slice(&encryption_key));
    let ciphertext = cipher.encrypt(GenericArray::from_slice(&nonce_bytes), json_string.as_bytes())
        .map_err(|e| CryptoError::EncryptionFailed(e.to_string()))?;

    // Pack: nonce(24) + ciphertext, then base64 encode
    let mut packed = Vec::with_capacity(24 + ciphertext.len());
    packed.extend_from_slice(&nonce_bytes);
    packed.extend_from_slice(&ciphertext);

    use base64::engine::general_purpose::STANDARD;
    use base64::Engine;
    Ok(STANDARD.encode(&packed))
}
```

**Note**: Returns base64 string instead of `Vec<u8>` — avoids JSON serializing a large byte array as `[n, n, n, ...]` over IPC. The TypeScript side will decode base64 → Uint8Array if needed for download.

### 1.6 Nostr Event Signing

Add new file `llamenos-core/src/nostr.rs`:

```rust
//! Nostr event signing — produces events identical to nostr-tools/pure::finalizeEvent.

use crate::errors::CryptoError;
use k256::schnorr::{SigningKey, signature::Signer};
use serde::{Deserialize, Serialize};
use sha2::{Sha256, Digest};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SignedNostrEvent {
    pub id: String,         // 64-char hex (SHA-256 of canonical JSON)
    pub pubkey: String,     // 32-byte x-only pubkey hex
    pub created_at: u64,    // Unix seconds
    pub kind: u32,
    pub tags: Vec<Vec<String>>,
    pub content: String,
    pub sig: String,        // 64-byte BIP-340 signature hex
}

/// Sign a Nostr event template. Computes the event ID (SHA-256 of canonical
/// serialization per NIP-01) and signs with BIP-340 Schnorr.
///
/// The canonical JSON is: [0, pubkey, created_at, kind, tags, content]
pub fn finalize_nostr_event(
    kind: u32,
    created_at: u64,
    tags: Vec<Vec<String>>,
    content: &str,
    secret_key_hex: &str,
) -> Result<SignedNostrEvent, CryptoError> {
    let sk_bytes = hex::decode(secret_key_hex)
        .map_err(|_| CryptoError::InvalidSecretKey)?;
    let signing_key = SigningKey::from_bytes(&sk_bytes)
        .map_err(|_| CryptoError::InvalidSecretKey)?;
    let pubkey = hex::encode(signing_key.verifying_key().to_bytes());

    // Canonical serialization per NIP-01:
    // [0, <pubkey>, <created_at>, <kind>, <tags>, <content>]
    let canonical = serde_json::to_string(&serde_json::json!([
        0,
        &pubkey,
        created_at,
        kind,
        &tags,
        content,
    ])).map_err(|e| CryptoError::EncryptionFailed(e.to_string()))?;

    let id_hash = Sha256::digest(canonical.as_bytes());
    let id = hex::encode(id_hash);

    // Sign the 32-byte event ID hash with BIP-340 Schnorr
    let signature = signing_key.sign(&id_hash);
    let sig = hex::encode(signature.to_bytes());

    Ok(SignedNostrEvent {
        id,
        pubkey,
        created_at,
        kind,
        tags,
        content: content.to_string(),
        sig,
    })
}
```

**Critical**: The canonical JSON serialization must exactly match what `nostr-tools` produces:
- `[0, <pubkey_hex>, <created_at_u64>, <kind_u32>, <tags_array>, <content_string>]`
- Tags must serialize as `[["d","hubId"],["t","llamenos:event"]]` — no whitespace
- Content must be the raw string, not JSON-escaped again
- **Test vectors**: Write a test in llamenos-core that signs a known event and verifies the result matches what nostr-tools would produce.

### 1.7 ECIES Metadata Encryption/Decryption

Add to `llamenos-core/src/ecies.rs`:

```rust
/// Decrypt arbitrary-length ECIES-encrypted content (not just 32-byte keys).
/// Used for file metadata and transcriptions.
/// packed = hex(nonce(24) + ciphertext)
pub fn ecies_decrypt_content(
    packed_hex: &str,
    ephemeral_pubkey_hex: &str,
    secret_key_hex: &str,
    label: &str,
) -> Result<String, CryptoError> {
    // Same ECDH + SHA-256(label || shared_x) key derivation as ecies_unwrap_key
    // but decrypts arbitrary-length data
    // ... (implementation follows same pattern as transcription decryption)
}
```

This generalizes the transcription/file-metadata decryption into a single function with domain separation via `label`.

### 1.8 Add `base64` dependency

In `llamenos-core/Cargo.toml`, add:
```toml
base64 = "0.22"
```

### 1.9 Module Registration

In `llamenos-core/src/lib.rs`, add:
```rust
pub mod nostr;
```

## Phase 2: New Tauri IPC Commands

All new commands go in `src-tauri/src/crypto.rs`.

### 2.1 Stateful Commands (use CryptoState)

```rust
#[tauri::command]
pub fn decrypt_call_record_from_state(
    state: tauri::State<'_, CryptoState>,
    encrypted_content: String,
    admin_envelopes: Vec<RecipientKeyEnvelope>,
) -> Result<String, String> {
    let sk = state.secret_key()?;
    let pk = state.public_key()?;
    llamenos_core::encryption::decrypt_call_record(
        &encrypted_content, &admin_envelopes, &sk, &pk,
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn decrypt_legacy_note_from_state(
    state: tauri::State<'_, CryptoState>,
    packed_hex: String,
) -> Result<String, String> {
    let sk = state.secret_key()?;
    llamenos_core::encryption::decrypt_legacy_note(&packed_hex, &sk)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn decrypt_transcription_from_state(
    state: tauri::State<'_, CryptoState>,
    packed_hex: String,
    ephemeral_pubkey_hex: String,
) -> Result<String, String> {
    let sk = state.secret_key()?;
    llamenos_core::encryption::decrypt_transcription(
        &packed_hex, &ephemeral_pubkey_hex, &sk,
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn encrypt_draft_from_state(
    state: tauri::State<'_, CryptoState>,
    plaintext: String,
) -> Result<String, String> {
    let sk = state.secret_key()?;
    llamenos_core::encryption::encrypt_draft(&plaintext, &sk)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn decrypt_draft_from_state(
    state: tauri::State<'_, CryptoState>,
    packed_hex: String,
) -> Result<String, String> {
    let sk = state.secret_key()?;
    llamenos_core::encryption::decrypt_draft(&packed_hex, &sk)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn encrypt_export_from_state(
    state: tauri::State<'_, CryptoState>,
    json_string: String,
) -> Result<String, String> {
    let sk = state.secret_key()?;
    llamenos_core::encryption::encrypt_export(&json_string, &sk)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn sign_nostr_event_from_state(
    state: tauri::State<'_, CryptoState>,
    kind: u32,
    created_at: u64,
    tags: Vec<Vec<String>>,
    content: String,
) -> Result<llamenos_core::nostr::SignedNostrEvent, String> {
    let sk = state.secret_key()?;
    llamenos_core::nostr::finalize_nostr_event(kind, created_at, tags, &content, &sk)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn decrypt_file_metadata_from_state(
    state: tauri::State<'_, CryptoState>,
    encrypted_content_hex: String,
    ephemeral_pubkey_hex: String,
) -> Result<String, String> {
    let sk = state.secret_key()?;
    llamenos_core::ecies::ecies_decrypt_content(
        &encrypted_content_hex, &ephemeral_pubkey_hex, &sk,
        llamenos_core::labels::LABEL_FILE_METADATA,
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn unwrap_file_key_from_state(
    state: tauri::State<'_, CryptoState>,
    envelope: KeyEnvelope,
) -> Result<String, String> {
    let sk = state.secret_key()?;
    let key = llamenos_core::ecies::ecies_unwrap_key(&envelope, &sk, llamenos_core::labels::LABEL_FILE_KEY)
        .map_err(|e| e.to_string())?;
    Ok(hex::encode(key))
}

#[tauri::command]
pub fn unwrap_hub_key_from_state(
    state: tauri::State<'_, CryptoState>,
    envelope: KeyEnvelope,
) -> Result<String, String> {
    let sk = state.secret_key()?;
    let key = llamenos_core::ecies::ecies_unwrap_key(&envelope, &sk, llamenos_core::labels::LABEL_HUB_KEY_WRAP)
        .map_err(|e| e.to_string())?;
    Ok(hex::encode(key))
}

#[tauri::command]
pub fn rewrap_file_key_from_state(
    state: tauri::State<'_, CryptoState>,
    encrypted_file_key_hex: String,
    ephemeral_pubkey_hex: String,
    new_recipient_pubkey_hex: String,
) -> Result<RecipientKeyEnvelope, String> {
    let sk = state.secret_key()?;
    // Unwrap with admin key
    let envelope = KeyEnvelope {
        wrapped_key: encrypted_file_key_hex,
        ephemeral_pubkey: ephemeral_pubkey_hex,
    };
    let file_key = llamenos_core::ecies::ecies_unwrap_key(
        &envelope, &sk, llamenos_core::labels::LABEL_FILE_KEY,
    ).map_err(|e| e.to_string())?;
    // Re-wrap for new recipient
    let new_envelope = llamenos_core::ecies::ecies_wrap_key(
        &file_key, &new_recipient_pubkey_hex, llamenos_core::labels::LABEL_FILE_KEY,
    ).map_err(|e| e.to_string())?;
    Ok(RecipientKeyEnvelope {
        pubkey: new_recipient_pubkey_hex,
        wrapped_key: new_envelope.wrapped_key,
        ephemeral_pubkey: new_envelope.ephemeral_pubkey,
    })
}
```

### 2.2 Stateless Commands (for onboarding flows)

```rust
#[tauri::command]
pub fn is_valid_nsec(nsec: String) -> bool {
    llamenos_core::keys::is_valid_nsec(&nsec)
}

#[tauri::command]
pub fn key_pair_from_nsec(nsec: String) -> Result<KeyPair, String> {
    llamenos_core::keys::keypair_from_nsec(&nsec)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_nsec_from_state(
    state: tauri::State<'_, CryptoState>,
) -> Result<String, String> {
    // Returns the nsec bech32 for backup/device-provisioning ONLY.
    // This is the one place the nsec crosses the IPC boundary.
    let sk_hex = state.secret_key()?;
    let sk_bytes = hex::decode(&sk_hex).map_err(|e| e.to_string())?;
    // bech32 encode as nsec
    let nsec = bech32::encode::<bech32::Bech32>("nsec", &sk_bytes)
        .map_err(|e| e.to_string())?;
    Ok(nsec)
}
```

**Security note on `get_nsec_from_state`**: This command returns the nsec to the webview. It is needed for exactly two scenarios: (1) device provisioning (settings.tsx line 569) and (2) nsec display for backup. Both are intentional admin-initiated actions. The Tauri capability should restrict this command to only the main window.

### 2.3 Register New Commands

In `src-tauri/src/lib.rs`, add to the `generate_handler![]` macro:

```rust
tauri::generate_handler![
    // ... existing commands ...
    crypto::decrypt_call_record_from_state,
    crypto::decrypt_legacy_note_from_state,
    crypto::decrypt_transcription_from_state,
    crypto::encrypt_draft_from_state,
    crypto::decrypt_draft_from_state,
    crypto::encrypt_export_from_state,
    crypto::sign_nostr_event_from_state,
    crypto::decrypt_file_metadata_from_state,
    crypto::unwrap_file_key_from_state,
    crypto::unwrap_hub_key_from_state,
    crypto::rewrap_file_key_from_state,
    crypto::is_valid_nsec,
    crypto::key_pair_from_nsec,
    crypto::get_nsec_from_state,
]
```

## Phase 3: Rust Tests

### 3.1 Nostr Event Signing Test Vectors

In `llamenos-core/tests/nostr_tests.rs`:

```rust
#[test]
fn test_nostr_event_signing_matches_nip01() {
    // Use a known secret key and verify:
    // 1. Canonical JSON matches NIP-01 spec
    // 2. Event ID = SHA-256(canonical)
    // 3. Signature verifies with k256::schnorr
    let sk = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    let event = finalize_nostr_event(
        20001,
        1700000000,
        vec![
            vec!["d".into(), "test-hub".into()],
            vec!["t".into(), "llamenos:event".into()],
        ],
        "encrypted-content-here",
        sk,
    ).unwrap();

    assert_eq!(event.kind, 20001);
    assert_eq!(event.created_at, 1700000000);
    assert_eq!(event.content, "encrypted-content-here");
    assert_eq!(event.id.len(), 64); // hex SHA-256
    assert_eq!(event.sig.len(), 128); // hex BIP-340

    // Verify signature
    let pk_bytes = hex::decode(&event.pubkey).unwrap();
    let sig_bytes = hex::decode(&event.sig).unwrap();
    let id_bytes = hex::decode(&event.id).unwrap();
    let verifying_key = k256::schnorr::VerifyingKey::from_bytes(&pk_bytes).unwrap();
    let signature = k256::schnorr::Signature::from_bytes(&sig_bytes).unwrap();
    verifying_key.verify(&id_bytes, &signature).unwrap();
}
```

### 3.2 Cross-Platform Test Vectors

Create test vectors that will be verified in both Rust and TypeScript (via Playwright E2E test):

```rust
#[test]
fn test_legacy_note_roundtrip() {
    let sk = "deadbeef..."; // known test key
    let payload = r#"{"text":"test note","callId":"call-1"}"#;
    // Encrypt with encrypt_draft (same HKDF mechanism) then decrypt with decrypt_legacy_note
    // Verify output matches
}

#[test]
fn test_export_roundtrip() {
    let sk = "deadbeef...";
    let json = r#"{"notes": []}"#;
    let encrypted = encrypt_export(json, sk).unwrap();
    // Verify it's valid base64
    assert!(base64::engine::general_purpose::STANDARD.decode(&encrypted).is_ok());
}
```

## Key Design Decisions

### Hub key stays in webview
The hub key is a shared symmetric key (random bytes, not derived from identity). It's fine in the webview because:
- Compromising the hub key only exposes real-time Nostr event content (which is transient)
- The hub key is rotated on member departure
- It's not an identity secret

### File content XChaCha20 stays in JS
`encryptFile()` generates a random symmetric key and encrypts file content. This key is NOT the nsec — it's a fresh random per-file. Only the ECIES envelope operations (unwrap file key, decrypt metadata) need the nsec, so those go through Rust.

### `encryptExport` returns base64
`Vec<u8>` over JSON-based IPC serializes as `[n, n, n, ...]` — a huge JSON array for large exports. Base64 is ~33% overhead vs ~300% for JSON number arrays.

### `get_nsec_from_state` is intentional
Device provisioning requires the nsec to cross the IPC boundary. This is a conscious security tradeoff — the nsec is encrypted via ECDH before being sent to the new device. The alternative (performing the ECDH encryption entirely in Rust) would require adding the full provisioning protocol to llamenos-core, which is out of scope for this epic.

### Nostr signing must produce identical events
The `finalize_nostr_event` function MUST produce events that `verifyEvent()` from nostr-tools accepts. This means exact NIP-01 canonical JSON serialization. The test vectors in Phase 3 verify this.

## Files Changed

### llamenos-core (~/projects/llamenos-core)
- `src/encryption.rs` — Add `decrypt_legacy_note`, `decrypt_transcription`, `encrypt_export`
- `src/ecies.rs` — Add `ecies_decrypt_content` (arbitrary-length ECIES decrypt)
- `src/nostr.rs` — **New file**: `finalize_nostr_event`, `SignedNostrEvent`
- `src/lib.rs` — Add `pub mod nostr`
- `Cargo.toml` — Add `base64 = "0.22"`
- `tests/nostr_tests.rs` — **New file**: Event signing test vectors

### llamenos (this repo)
- `src-tauri/src/crypto.rs` — Add 14 new IPC commands
- `src-tauri/src/lib.rs` — Register new commands in `generate_handler![]`

## Verification

1. `cd ~/projects/llamenos-core && cargo test` — all tests pass
2. `cd ~/projects/llamenos && bun run tauri:dev` — app compiles and launches
3. New commands are callable from devtools console:
   ```js
   await __TAURI_INTERNALS__.invoke('is_valid_nsec', { nsec: 'nsec1...' })
   await __TAURI_INTERNALS__.invoke('sign_nostr_event_from_state', {
     kind: 20001, createdAt: 1700000000,
     tags: [['d','test'],['t','llamenos:event']], content: 'test'
   })
   ```
4. No existing functionality is broken (all existing IPC commands still work)
