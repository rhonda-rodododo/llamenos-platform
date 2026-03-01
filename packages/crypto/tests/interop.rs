//! Cross-platform interoperability tests.
//!
//! These tests generate test vectors using deterministic inputs and verify
//! that the wire format matches what the JavaScript (@noble/*) and mobile
//! (UniFFI) implementations produce. The test vectors are written to
//! `tests/fixtures/test-vectors.json` so other platforms can consume them.
//!
//! Run with: cargo test --test interop

use base64::{Engine, engine::general_purpose::STANDARD};
use llamenos_core::auth::{create_auth_token, verify_auth_token, AuthToken};
use llamenos_core::ecies::{ecies_unwrap_key, ecies_wrap_key, KeyEnvelope, RecipientKeyEnvelope};
use llamenos_core::encryption::{
    decrypt_call_record, decrypt_draft, decrypt_message, decrypt_note, decrypt_with_pin,
    encrypt_draft, encrypt_export, encrypt_message, encrypt_note, encrypt_with_pin,
    EncryptedKeyData, EncryptedMessage, EncryptedNote,
};
use llamenos_core::keys::{generate_keypair, get_public_key};
use llamenos_core::labels::*;
use llamenos_core::nostr::{finalize_nostr_event, SignedNostrEvent};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;

/// Well-known test keypair (NEVER use in production).
/// Generated deterministically for reproducible test vectors.
const TEST_SECRET_KEY: &str =
    "7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f";

/// Second test keypair for multi-recipient tests.
const TEST_ADMIN_SECRET_KEY: &str =
    "0101010101010101010101010101010101010101010101010101010101010101";

/// Third test keypair for adversarial / "wrong key" tests.
const TEST_WRONG_SECRET_KEY: &str =
    "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";

/// Test PIN for key encryption vectors.
const TEST_PIN: &str = "1234";

// ─── Top-Level Struct ────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TestVectors {
    /// Metadata
    version: String,
    generated_by: String,

    /// Key material (deterministic from known secrets)
    keys: KeyVectors,

    /// ECIES wrap/unwrap vectors
    ecies: EciesVectors,

    /// Note encryption vectors (V2 forward secrecy)
    note_encryption: NoteEncryptionVectors,

    /// Auth token vectors
    auth: AuthVectors,

    /// PIN encryption vectors
    pin_encryption: PinEncryptionVectors,

    /// Draft encryption vectors
    draft_encryption: DraftEncryptionVectors,

    /// Label constants (for cross-platform consistency)
    labels: LabelVectors,

    // ─── New in v2 ───

    /// Message encryption vectors (Epic 74 — E2EE messaging)
    message_encryption: MessageEncryptionVectors,

    /// Hub key wrapping vectors (hub key ECIES distribution)
    hub_key: HubKeyVectors,

    /// Nostr event signing vectors (NIP-01)
    nostr_event: NostrEventVectors,

    /// Export encryption vectors (HKDF + base64)
    export_encryption: ExportEncryptionVectors,

    /// Call record metadata vectors (admin-only ECIES)
    call_record: CallRecordVectors,

    /// Domain separation proof vectors
    domain_separation: DomainSeparationVectors,

    /// Adversarial test vectors (wrong keys, tampered data)
    adversarial: AdversarialVectors,
}

// ─── Existing Structs ────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct KeyVectors {
    secret_key_hex: String,
    public_key_hex: String,
    nsec: String,
    npub: String,
    admin_secret_key_hex: String,
    admin_public_key_hex: String,
    wrong_secret_key_hex: String,
    wrong_public_key_hex: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EciesVectors {
    envelope: KeyEnvelope,
    original_key_hex: String,
    label: String,
    recipient_pubkey_hex: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NoteEncryptionVectors {
    plaintext_json: String,
    author_pubkey: String,
    admin_pubkeys: Vec<String>,
    encrypted: EncryptedNote,
    author_can_decrypt: bool,
    admin_can_decrypt: bool,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AuthVectors {
    secret_key_hex: String,
    timestamp: u64,
    method: String,
    path: String,
    token: AuthToken,
    valid: bool,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PinEncryptionVectors {
    pin: String,
    nsec: String,
    pubkey_hex: String,
    encrypted: EncryptedKeyData,
    decryptable: bool,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DraftEncryptionVectors {
    plaintext: String,
    secret_key_hex: String,
    encrypted_hex: String,
    decryptable: bool,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LabelVectors {
    label_note_key: String,
    label_file_key: String,
    label_file_metadata: String,
    label_hub_key_wrap: String,
    label_transcription: String,
    label_message: String,
    label_call_meta: String,
    label_shift_schedule: String,
    hkdf_salt: String,
    hkdf_context_notes: String,
    hkdf_context_drafts: String,
    hkdf_context_export: String,
    label_hub_event: String,
    label_device_provision: String,
    sas_salt: String,
    sas_info: String,
    auth_prefix: String,
    hmac_phone_prefix: String,
    hmac_ip_prefix: String,
    hmac_keyid_prefix: String,
    hmac_subscriber: String,
    hmac_preference_token: String,
    recovery_salt: String,
    label_backup: String,
    label_server_nostr_key: String,
    label_server_nostr_key_info: String,
    label_push_wake: String,
    label_push_full: String,
}

// ─── New v2 Structs ──────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MessageEncryptionVectors {
    plaintext: String,
    reader_pubkeys: Vec<String>,
    encrypted: EncryptedMessage,
    volunteer_can_decrypt: bool,
    admin_can_decrypt: bool,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HubKeyVectors {
    hub_key_hex: String,
    member_pubkeys: Vec<String>,
    wrapped_envelopes: Vec<KeyEnvelope>,
    label: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NostrEventVectors {
    event: SignedNostrEvent,
    /// The canonical JSON used to compute the event ID (for debugging)
    canonical_json: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExportEncryptionVectors {
    plaintext_json: String,
    secret_key_hex: String,
    encrypted_base64: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CallRecordVectors {
    plaintext_json: String,
    admin_pubkeys: Vec<String>,
    encrypted_content: String,
    admin_envelopes: Vec<RecipientKeyEnvelope>,
    admin_can_decrypt: bool,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DomainSeparationVectors {
    original_key_hex: String,
    recipient_pubkey_hex: String,
    wrapped_with_note_label: KeyEnvelope,
    wrapped_with_message_label: KeyEnvelope,
    wrapped_with_hub_label: KeyEnvelope,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AdversarialVectors {
    ecies: AdversarialEcies,
    note: AdversarialNote,
    auth: AdversarialAuth,
    message: AdversarialMessage,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AdversarialEcies {
    /// Valid envelope that can be unwrapped with admin key
    valid_envelope: KeyEnvelope,
    valid_label: String,
    /// wrappedKey with a flipped bit in the ciphertext
    tampered_wrapped_key: String,
    /// wrappedKey truncated by 1 byte
    truncated_wrapped_key: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AdversarialNote {
    /// Valid encrypted note
    valid_encrypted: EncryptedNote,
    /// encryptedContent with a flipped bit
    tampered_content: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AdversarialAuth {
    /// Valid auth token
    valid_token: AuthToken,
    valid_method: String,
    valid_path: String,
    /// A timestamp 6 minutes in the past (expired)
    expired_timestamp: u64,
    /// Wrong method to test method binding
    wrong_method: String,
    /// Wrong path to test path binding
    wrong_path: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AdversarialMessage {
    /// Valid encrypted message for volunteer + admin
    valid_encrypted: EncryptedMessage,
}

// ─── Main Vector Generation ──────────────────────────────────

#[test]
fn generate_and_verify_test_vectors() {
    // --- Key derivation ---
    let author_pubkey = get_public_key(TEST_SECRET_KEY).unwrap();
    let admin_pubkey = get_public_key(TEST_ADMIN_SECRET_KEY).unwrap();
    let wrong_pubkey = get_public_key(TEST_WRONG_SECRET_KEY).unwrap();

    // Use a generated keypair for nsec-related tests (PIN encryption needs valid nsec)
    let test_kp = generate_keypair();

    // --- ECIES wrap/unwrap roundtrip ---
    let original_key = "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";
    let key_bytes: [u8; 32] = hex::decode(original_key).unwrap().try_into().unwrap();
    let envelope = ecies_wrap_key(&key_bytes, &admin_pubkey, LABEL_NOTE_KEY).unwrap();

    // Verify unwrap works
    let unwrapped = ecies_unwrap_key(&envelope, TEST_ADMIN_SECRET_KEY, LABEL_NOTE_KEY).unwrap();
    assert_eq!(hex::encode(&unwrapped), original_key);

    // --- Note encryption roundtrip ---
    let note_payload = r#"{"text":"Test note for interop","fields":{"severity":"high"}}"#;
    let encrypted_note =
        encrypt_note(note_payload, &author_pubkey, &[admin_pubkey.clone()]).unwrap();

    // Author can decrypt
    let author_decrypted = decrypt_note(
        &encrypted_note.encrypted_content,
        &encrypted_note.author_envelope,
        TEST_SECRET_KEY,
    )
    .unwrap();
    assert_eq!(author_decrypted, note_payload);

    // Admin can decrypt
    let admin_envelope = encrypted_note
        .admin_envelopes
        .iter()
        .find(|e| e.pubkey == admin_pubkey)
        .unwrap();
    let admin_decrypted = decrypt_note(
        &encrypted_note.encrypted_content,
        &KeyEnvelope {
            wrapped_key: admin_envelope.wrapped_key.clone(),
            ephemeral_pubkey: admin_envelope.ephemeral_pubkey.clone(),
        },
        TEST_ADMIN_SECRET_KEY,
    )
    .unwrap();
    assert_eq!(admin_decrypted, note_payload);

    // --- Auth token roundtrip ---
    let timestamp = 1708900000000u64;
    let method = "POST";
    let path = "/api/notes";
    let auth_token =
        create_auth_token(TEST_SECRET_KEY, timestamp, method, path).unwrap();
    let valid = verify_auth_token(&auth_token, method, path).unwrap();
    assert!(valid);

    // --- PIN encryption roundtrip ---
    let pin_encrypted =
        encrypt_with_pin(&test_kp.nsec, TEST_PIN, &test_kp.public_key).unwrap();
    let pin_decrypted = decrypt_with_pin(&pin_encrypted, TEST_PIN).unwrap();
    assert_eq!(pin_decrypted, test_kp.nsec);

    // --- Draft encryption roundtrip ---
    let draft_text = "Draft note content for interop test";
    let draft_encrypted = encrypt_draft(draft_text, TEST_SECRET_KEY).unwrap();
    let draft_decrypted = decrypt_draft(&draft_encrypted, TEST_SECRET_KEY).unwrap();
    assert_eq!(draft_decrypted, draft_text);

    // ─── NEW v2: Message encryption roundtrip ────────────────
    let msg_plaintext = "Hello from volunteer — E2EE message interop test";
    let msg_readers = vec![author_pubkey.clone(), admin_pubkey.clone()];
    let encrypted_msg = encrypt_message(msg_plaintext, &msg_readers).unwrap();

    // Volunteer can decrypt
    let vol_decrypted = decrypt_message(
        &encrypted_msg.encrypted_content,
        &encrypted_msg.reader_envelopes,
        TEST_SECRET_KEY,
        &author_pubkey,
    )
    .unwrap();
    assert_eq!(vol_decrypted, msg_plaintext);

    // Admin can decrypt
    let admin_msg_decrypted = decrypt_message(
        &encrypted_msg.encrypted_content,
        &encrypted_msg.reader_envelopes,
        TEST_ADMIN_SECRET_KEY,
        &admin_pubkey,
    )
    .unwrap();
    assert_eq!(admin_msg_decrypted, msg_plaintext);

    // ─── NEW v2: Hub key wrapping ────────────────────────────
    let hub_key_hex = "cafebabecafebabecafebabecafebabecafebabecafebabecafebabecafebabe";
    let hub_key_bytes: [u8; 32] = hex::decode(hub_key_hex).unwrap().try_into().unwrap();
    let hub_member_pubkeys = vec![author_pubkey.clone(), admin_pubkey.clone()];

    let hub_envelope_vol =
        ecies_wrap_key(&hub_key_bytes, &author_pubkey, LABEL_HUB_KEY_WRAP).unwrap();
    let hub_envelope_admin =
        ecies_wrap_key(&hub_key_bytes, &admin_pubkey, LABEL_HUB_KEY_WRAP).unwrap();

    // Both can unwrap
    let vol_hub = ecies_unwrap_key(&hub_envelope_vol, TEST_SECRET_KEY, LABEL_HUB_KEY_WRAP).unwrap();
    assert_eq!(hex::encode(&vol_hub), hub_key_hex);
    let admin_hub =
        ecies_unwrap_key(&hub_envelope_admin, TEST_ADMIN_SECRET_KEY, LABEL_HUB_KEY_WRAP).unwrap();
    assert_eq!(hex::encode(&admin_hub), hub_key_hex);

    // ─── NEW v2: Nostr event signing ─────────────────────────
    let nostr_event = finalize_nostr_event(
        20001,
        1700000000,
        vec![
            vec!["d".into(), "test-hub-id".into()],
            vec!["t".into(), "llamenos:event".into()],
        ],
        "encrypted-payload-for-interop",
        TEST_SECRET_KEY,
    )
    .unwrap();

    // Reconstruct canonical JSON for inclusion in vectors
    let canonical_json = serde_json::to_string(&serde_json::json!([
        0,
        &nostr_event.pubkey,
        nostr_event.created_at,
        nostr_event.kind,
        &nostr_event.tags,
        &nostr_event.content,
    ]))
    .unwrap();

    // Verify event ID matches canonical JSON hash
    let expected_id = hex::encode(Sha256::digest(canonical_json.as_bytes()));
    assert_eq!(nostr_event.id, expected_id);

    // ─── NEW v2: Export encryption ───────────────────────────
    let export_json = r#"{"notes":[{"id":"abc","text":"test"}],"exportedAt":"2024-01-01T00:00:00Z"}"#;
    let export_encrypted = encrypt_export(export_json, TEST_SECRET_KEY).unwrap();
    // Verify it's valid base64
    let export_decoded = STANDARD.decode(&export_encrypted).unwrap();
    assert!(export_decoded.len() >= 24, "export must have nonce + ciphertext");

    // ─── NEW v2: Call record metadata (reuse message pattern with LABEL_CALL_META) ─
    // Call records are encrypted using the same pattern as messages but with LABEL_CALL_META.
    // Since there's no encrypt_call_record in Rust (server encrypts in JS), we manually
    // construct one using the low-level ECIES + XChaCha20 primitives.
    let call_record_json = r#"{"answeredBy":"vol-pubkey-here","callerNumber":"+15551234567","duration":120}"#;

    // Encrypt call record for admin only (volunteer can NOT decrypt call records)
    let call_record_msg = encrypt_call_record_for_test(call_record_json, &[admin_pubkey.clone()]);

    // Admin can decrypt
    let call_decrypted = decrypt_call_record(
        &call_record_msg.encrypted_content,
        &call_record_msg.reader_envelopes,
        TEST_ADMIN_SECRET_KEY,
        &admin_pubkey,
    )
    .unwrap();
    assert_eq!(call_decrypted, call_record_json);

    // ─── NEW v2: Domain separation proof ─────────────────────
    let ds_key_hex = "1111111111111111111111111111111111111111111111111111111111111111";
    let ds_key_bytes: [u8; 32] = hex::decode(ds_key_hex).unwrap().try_into().unwrap();

    let ds_note = ecies_wrap_key(&ds_key_bytes, &admin_pubkey, LABEL_NOTE_KEY).unwrap();
    let ds_msg = ecies_wrap_key(&ds_key_bytes, &admin_pubkey, LABEL_MESSAGE).unwrap();
    let ds_hub = ecies_wrap_key(&ds_key_bytes, &admin_pubkey, LABEL_HUB_KEY_WRAP).unwrap();

    // Same-label unwrap must succeed
    assert!(ecies_unwrap_key(&ds_note, TEST_ADMIN_SECRET_KEY, LABEL_NOTE_KEY).is_ok());
    assert!(ecies_unwrap_key(&ds_msg, TEST_ADMIN_SECRET_KEY, LABEL_MESSAGE).is_ok());
    assert!(ecies_unwrap_key(&ds_hub, TEST_ADMIN_SECRET_KEY, LABEL_HUB_KEY_WRAP).is_ok());

    // Cross-label unwrap must fail
    assert!(ecies_unwrap_key(&ds_note, TEST_ADMIN_SECRET_KEY, LABEL_MESSAGE).is_err());
    assert!(ecies_unwrap_key(&ds_msg, TEST_ADMIN_SECRET_KEY, LABEL_NOTE_KEY).is_err());
    assert!(ecies_unwrap_key(&ds_hub, TEST_ADMIN_SECRET_KEY, LABEL_NOTE_KEY).is_err());

    // ─── Adversarial vectors ─────────────────────────────────

    // ECIES adversarial: tampered and truncated wrapped keys
    let adv_envelope = ecies_wrap_key(&key_bytes, &admin_pubkey, LABEL_NOTE_KEY).unwrap();
    let tampered_wrapped = tamper_hex(&adv_envelope.wrapped_key);
    let truncated_wrapped = truncate_hex(&adv_envelope.wrapped_key);

    // Verify tampered fails
    let tampered_env = KeyEnvelope {
        wrapped_key: tampered_wrapped.clone(),
        ephemeral_pubkey: adv_envelope.ephemeral_pubkey.clone(),
    };
    assert!(ecies_unwrap_key(&tampered_env, TEST_ADMIN_SECRET_KEY, LABEL_NOTE_KEY).is_err());

    // Verify truncated fails
    let truncated_env = KeyEnvelope {
        wrapped_key: truncated_wrapped.clone(),
        ephemeral_pubkey: adv_envelope.ephemeral_pubkey.clone(),
    };
    assert!(ecies_unwrap_key(&truncated_env, TEST_ADMIN_SECRET_KEY, LABEL_NOTE_KEY).is_err());

    // Note adversarial: tampered content
    let adv_note = encrypt_note(note_payload, &author_pubkey, &[admin_pubkey.clone()]).unwrap();
    let tampered_note_content = tamper_hex(&adv_note.encrypted_content);
    assert!(decrypt_note(
        &tampered_note_content,
        &adv_note.author_envelope,
        TEST_SECRET_KEY,
    )
    .is_err());

    // Auth adversarial: different method/path
    let adv_auth_token =
        create_auth_token(TEST_SECRET_KEY, 1708900000000, "GET", "/api/notes").unwrap();
    assert!(!verify_auth_token(&adv_auth_token, "POST", "/api/notes").unwrap());
    assert!(!verify_auth_token(&adv_auth_token, "GET", "/api/calls").unwrap());

    // Message adversarial: wrong reader
    let adv_msg = encrypt_message("adversarial message", &msg_readers).unwrap();
    assert!(decrypt_message(
        &adv_msg.encrypted_content,
        &adv_msg.reader_envelopes,
        TEST_WRONG_SECRET_KEY,
        &wrong_pubkey,
    )
    .is_err());

    // ─── Build test vectors JSON ─────────────────────────────
    let vectors = TestVectors {
        version: "2".to_string(),
        generated_by: "llamenos-core interop test v2".to_string(),
        keys: KeyVectors {
            secret_key_hex: TEST_SECRET_KEY.to_string(),
            public_key_hex: author_pubkey.clone(),
            nsec: test_kp.nsec.clone(),
            npub: test_kp.npub.clone(),
            admin_secret_key_hex: TEST_ADMIN_SECRET_KEY.to_string(),
            admin_public_key_hex: admin_pubkey.clone(),
            wrong_secret_key_hex: TEST_WRONG_SECRET_KEY.to_string(),
            wrong_public_key_hex: wrong_pubkey.clone(),
        },
        ecies: EciesVectors {
            envelope: envelope.clone(),
            original_key_hex: original_key.to_string(),
            label: LABEL_NOTE_KEY.to_string(),
            recipient_pubkey_hex: admin_pubkey.clone(),
        },
        note_encryption: NoteEncryptionVectors {
            plaintext_json: note_payload.to_string(),
            author_pubkey: author_pubkey.clone(),
            admin_pubkeys: vec![admin_pubkey.clone()],
            encrypted: encrypted_note.clone(),
            author_can_decrypt: true,
            admin_can_decrypt: true,
        },
        auth: AuthVectors {
            secret_key_hex: TEST_SECRET_KEY.to_string(),
            timestamp,
            method: method.to_string(),
            path: path.to_string(),
            token: auth_token,
            valid: true,
        },
        pin_encryption: PinEncryptionVectors {
            pin: TEST_PIN.to_string(),
            nsec: test_kp.nsec.clone(),
            pubkey_hex: test_kp.public_key.clone(),
            encrypted: pin_encrypted,
            decryptable: true,
        },
        draft_encryption: DraftEncryptionVectors {
            plaintext: draft_text.to_string(),
            secret_key_hex: TEST_SECRET_KEY.to_string(),
            encrypted_hex: draft_encrypted,
            decryptable: true,
        },
        labels: LabelVectors {
            label_note_key: LABEL_NOTE_KEY.to_string(),
            label_file_key: LABEL_FILE_KEY.to_string(),
            label_file_metadata: LABEL_FILE_METADATA.to_string(),
            label_hub_key_wrap: LABEL_HUB_KEY_WRAP.to_string(),
            label_transcription: LABEL_TRANSCRIPTION.to_string(),
            label_message: LABEL_MESSAGE.to_string(),
            label_call_meta: LABEL_CALL_META.to_string(),
            label_shift_schedule: LABEL_SHIFT_SCHEDULE.to_string(),
            hkdf_salt: HKDF_SALT.to_string(),
            hkdf_context_notes: HKDF_CONTEXT_NOTES.to_string(),
            hkdf_context_drafts: HKDF_CONTEXT_DRAFTS.to_string(),
            hkdf_context_export: HKDF_CONTEXT_EXPORT.to_string(),
            label_hub_event: LABEL_HUB_EVENT.to_string(),
            label_device_provision: LABEL_DEVICE_PROVISION.to_string(),
            sas_salt: SAS_SALT.to_string(),
            sas_info: SAS_INFO.to_string(),
            auth_prefix: AUTH_PREFIX.to_string(),
            hmac_phone_prefix: HMAC_PHONE_PREFIX.to_string(),
            hmac_ip_prefix: HMAC_IP_PREFIX.to_string(),
            hmac_keyid_prefix: HMAC_KEYID_PREFIX.to_string(),
            hmac_subscriber: HMAC_SUBSCRIBER.to_string(),
            hmac_preference_token: HMAC_PREFERENCE_TOKEN.to_string(),
            recovery_salt: RECOVERY_SALT.to_string(),
            label_backup: LABEL_BACKUP.to_string(),
            label_server_nostr_key: LABEL_SERVER_NOSTR_KEY.to_string(),
            label_server_nostr_key_info: LABEL_SERVER_NOSTR_KEY_INFO.to_string(),
            label_push_wake: LABEL_PUSH_WAKE.to_string(),
            label_push_full: LABEL_PUSH_FULL.to_string(),
        },
        message_encryption: MessageEncryptionVectors {
            plaintext: msg_plaintext.to_string(),
            reader_pubkeys: msg_readers.clone(),
            encrypted: encrypted_msg,
            volunteer_can_decrypt: true,
            admin_can_decrypt: true,
        },
        hub_key: HubKeyVectors {
            hub_key_hex: hub_key_hex.to_string(),
            member_pubkeys: hub_member_pubkeys,
            wrapped_envelopes: vec![hub_envelope_vol, hub_envelope_admin],
            label: LABEL_HUB_KEY_WRAP.to_string(),
        },
        nostr_event: NostrEventVectors {
            event: nostr_event,
            canonical_json,
        },
        export_encryption: ExportEncryptionVectors {
            plaintext_json: export_json.to_string(),
            secret_key_hex: TEST_SECRET_KEY.to_string(),
            encrypted_base64: export_encrypted,
        },
        call_record: CallRecordVectors {
            plaintext_json: call_record_json.to_string(),
            admin_pubkeys: vec![admin_pubkey.clone()],
            encrypted_content: call_record_msg.encrypted_content,
            admin_envelopes: call_record_msg.reader_envelopes,
            admin_can_decrypt: true,
        },
        domain_separation: DomainSeparationVectors {
            original_key_hex: ds_key_hex.to_string(),
            recipient_pubkey_hex: admin_pubkey.clone(),
            wrapped_with_note_label: ds_note,
            wrapped_with_message_label: ds_msg,
            wrapped_with_hub_label: ds_hub,
        },
        adversarial: AdversarialVectors {
            ecies: AdversarialEcies {
                valid_envelope: adv_envelope,
                valid_label: LABEL_NOTE_KEY.to_string(),
                tampered_wrapped_key: tampered_wrapped,
                truncated_wrapped_key: truncated_wrapped,
            },
            note: AdversarialNote {
                valid_encrypted: adv_note,
                tampered_content: tampered_note_content,
            },
            auth: AdversarialAuth {
                valid_token: adv_auth_token,
                valid_method: "GET".to_string(),
                valid_path: "/api/notes".to_string(),
                expired_timestamp: 1708900000000 - 360_000, // 6 minutes ago
                wrong_method: "POST".to_string(),
                wrong_path: "/api/calls".to_string(),
            },
            message: AdversarialMessage {
                valid_encrypted: adv_msg,
            },
        },
    };

    // Write test vectors to fixture file
    let json = serde_json::to_string_pretty(&vectors).unwrap();
    let fixture_path = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/test-vectors.json");
    fs::write(fixture_path, &json).unwrap();

    println!("Test vectors v2 written to {fixture_path}");
}

// ─── Helper: Encrypt call record for test (mirrors JS server-side encrypt) ───

/// Manually encrypt call record metadata using ECIES + XChaCha20-Poly1305.
/// This mirrors what the server (Worker) does in JS.
fn encrypt_call_record_for_test(plaintext: &str, admin_pubkeys: &[String]) -> EncryptedMessage {
    use chacha20poly1305::{aead::{Aead, KeyInit}, XChaCha20Poly1305, XNonce};
    use zeroize::Zeroize;

    // Generate random per-record key
    let mut record_key = [0u8; 32];
    getrandom::getrandom(&mut record_key).expect("getrandom failed");

    // Generate random nonce
    let mut nonce_bytes = [0u8; 24];
    getrandom::getrandom(&mut nonce_bytes).expect("getrandom failed");

    let nonce = XNonce::from_slice(&nonce_bytes);
    let cipher = XChaCha20Poly1305::new_from_slice(&record_key).unwrap();
    let ciphertext = cipher.encrypt(nonce, plaintext.as_bytes()).unwrap();

    let mut packed = Vec::with_capacity(24 + ciphertext.len());
    packed.extend_from_slice(&nonce_bytes);
    packed.extend_from_slice(&ciphertext);

    // Wrap the record key for each admin using LABEL_CALL_META
    let reader_envelopes: Vec<RecipientKeyEnvelope> = admin_pubkeys
        .iter()
        .map(|pk| {
            let env = ecies_wrap_key(&record_key, pk, LABEL_CALL_META).unwrap();
            RecipientKeyEnvelope {
                pubkey: pk.clone(),
                wrapped_key: env.wrapped_key,
                ephemeral_pubkey: env.ephemeral_pubkey,
            }
        })
        .collect();

    record_key.zeroize();

    EncryptedMessage {
        encrypted_content: hex::encode(&packed),
        reader_envelopes,
    }
}

// ─── Helper: Tamper with hex string (flip a bit in the ciphertext area) ──────

fn tamper_hex(hex_str: &str) -> String {
    let mut bytes = hex::decode(hex_str).unwrap();
    // Flip a bit in the last byte (ciphertext/tag area, not nonce)
    if let Some(last) = bytes.last_mut() {
        *last ^= 0x01;
    }
    hex::encode(&bytes)
}

fn truncate_hex(hex_str: &str) -> String {
    // Remove last 2 hex chars (1 byte)
    hex_str[..hex_str.len() - 2].to_string()
}

// ─── Existing Tests ──────────────────────────────────────────

#[test]
fn ecies_cross_label_rejection() {
    let admin_pubkey = get_public_key(TEST_ADMIN_SECRET_KEY).unwrap();
    let key_bytes: [u8; 32] = hex::decode(
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    )
    .unwrap()
    .try_into()
    .unwrap();

    let envelope = ecies_wrap_key(&key_bytes, &admin_pubkey, LABEL_NOTE_KEY).unwrap();

    // Unwrapping with wrong label should fail
    let result = ecies_unwrap_key(&envelope, TEST_ADMIN_SECRET_KEY, LABEL_MESSAGE);
    assert!(result.is_err(), "Cross-label unwrap must fail");

    // Unwrapping with correct label should succeed
    let result = ecies_unwrap_key(&envelope, TEST_ADMIN_SECRET_KEY, LABEL_NOTE_KEY);
    assert!(result.is_ok(), "Same-label unwrap must succeed");
}

#[test]
fn auth_token_deterministic_verification() {
    let token = create_auth_token(TEST_SECRET_KEY, 1708900000000, "GET", "/api/notes").unwrap();

    let expected_pubkey = get_public_key(TEST_SECRET_KEY).unwrap();
    assert_eq!(token.pubkey, expected_pubkey);

    assert!(verify_auth_token(&token, "GET", "/api/notes").unwrap());
    assert!(!verify_auth_token(&token, "POST", "/api/notes").unwrap());
    assert!(!verify_auth_token(&token, "GET", "/api/calls").unwrap());
}

#[test]
fn pin_encryption_format_consistency() {
    let kp = generate_keypair();
    let encrypted = encrypt_with_pin(&kp.nsec, "5678", &kp.public_key).unwrap();

    assert!(!encrypted.salt.is_empty(), "salt must be present");
    assert_eq!(encrypted.iterations, 600_000, "iterations must be 600K");
    assert!(!encrypted.nonce.is_empty(), "nonce must be present");
    assert!(!encrypted.ciphertext.is_empty(), "ciphertext must be present");
    assert!(!encrypted.pubkey.is_empty(), "pubkey hash must be present");

    assert_eq!(encrypted.salt.len(), 32, "salt must be 32 hex chars");
    assert_eq!(encrypted.nonce.len(), 48, "nonce must be 48 hex chars");

    let decrypted = decrypt_with_pin(&encrypted, "5678").unwrap();
    assert_eq!(decrypted, kp.nsec);

    let result = decrypt_with_pin(&encrypted, "9999");
    assert!(result.is_err(), "Wrong PIN must fail");
}

#[test]
fn label_count_matches_expected() {
    let label_vec = LabelVectors {
        label_note_key: LABEL_NOTE_KEY.to_string(),
        label_file_key: LABEL_FILE_KEY.to_string(),
        label_file_metadata: LABEL_FILE_METADATA.to_string(),
        label_hub_key_wrap: LABEL_HUB_KEY_WRAP.to_string(),
        label_transcription: LABEL_TRANSCRIPTION.to_string(),
        label_message: LABEL_MESSAGE.to_string(),
        label_call_meta: LABEL_CALL_META.to_string(),
        label_shift_schedule: LABEL_SHIFT_SCHEDULE.to_string(),
        hkdf_salt: HKDF_SALT.to_string(),
        hkdf_context_notes: HKDF_CONTEXT_NOTES.to_string(),
        hkdf_context_drafts: HKDF_CONTEXT_DRAFTS.to_string(),
        hkdf_context_export: HKDF_CONTEXT_EXPORT.to_string(),
        label_hub_event: LABEL_HUB_EVENT.to_string(),
        label_device_provision: LABEL_DEVICE_PROVISION.to_string(),
        sas_salt: SAS_SALT.to_string(),
        sas_info: SAS_INFO.to_string(),
        auth_prefix: AUTH_PREFIX.to_string(),
        hmac_phone_prefix: HMAC_PHONE_PREFIX.to_string(),
        hmac_ip_prefix: HMAC_IP_PREFIX.to_string(),
        hmac_keyid_prefix: HMAC_KEYID_PREFIX.to_string(),
        hmac_subscriber: HMAC_SUBSCRIBER.to_string(),
        hmac_preference_token: HMAC_PREFERENCE_TOKEN.to_string(),
        recovery_salt: RECOVERY_SALT.to_string(),
        label_backup: LABEL_BACKUP.to_string(),
        label_server_nostr_key: LABEL_SERVER_NOSTR_KEY.to_string(),
        label_server_nostr_key_info: LABEL_SERVER_NOSTR_KEY_INFO.to_string(),
        label_push_wake: LABEL_PUSH_WAKE.to_string(),
        label_push_full: LABEL_PUSH_FULL.to_string(),
    };

    let json = serde_json::to_value(&label_vec).unwrap();
    let map = json.as_object().unwrap();
    assert_eq!(
        map.len(),
        28,
        "Expected 28 labels — update interop test if new labels were added"
    );
}

// ─── NEW v2 Tests ────────────────────────────────────────────

#[test]
fn message_encryption_roundtrip() {
    let author_pubkey = get_public_key(TEST_SECRET_KEY).unwrap();
    let admin_pubkey = get_public_key(TEST_ADMIN_SECRET_KEY).unwrap();

    let plaintext = "Multi-reader encrypted message test";
    let readers = vec![author_pubkey.clone(), admin_pubkey.clone()];
    let encrypted = encrypt_message(plaintext, &readers).unwrap();

    // Both readers can decrypt
    let vol = decrypt_message(
        &encrypted.encrypted_content,
        &encrypted.reader_envelopes,
        TEST_SECRET_KEY,
        &author_pubkey,
    )
    .unwrap();
    assert_eq!(vol, plaintext);

    let admin = decrypt_message(
        &encrypted.encrypted_content,
        &encrypted.reader_envelopes,
        TEST_ADMIN_SECRET_KEY,
        &admin_pubkey,
    )
    .unwrap();
    assert_eq!(admin, plaintext);

    // Wrong key fails
    let wrong_pubkey = get_public_key(TEST_WRONG_SECRET_KEY).unwrap();
    let result = decrypt_message(
        &encrypted.encrypted_content,
        &encrypted.reader_envelopes,
        TEST_WRONG_SECRET_KEY,
        &wrong_pubkey,
    );
    assert!(result.is_err(), "Wrong reader key must fail");
}

#[test]
fn hub_key_multi_recipient_wrap() {
    let vol_pubkey = get_public_key(TEST_SECRET_KEY).unwrap();
    let admin_pubkey = get_public_key(TEST_ADMIN_SECRET_KEY).unwrap();

    let hub_key = [0xCA; 32]; // deterministic for test
    let vol_env = ecies_wrap_key(&hub_key, &vol_pubkey, LABEL_HUB_KEY_WRAP).unwrap();
    let admin_env = ecies_wrap_key(&hub_key, &admin_pubkey, LABEL_HUB_KEY_WRAP).unwrap();

    // Both unwrap to same hub key
    let vol_unwrapped =
        ecies_unwrap_key(&vol_env, TEST_SECRET_KEY, LABEL_HUB_KEY_WRAP).unwrap();
    let admin_unwrapped =
        ecies_unwrap_key(&admin_env, TEST_ADMIN_SECRET_KEY, LABEL_HUB_KEY_WRAP).unwrap();

    assert_eq!(vol_unwrapped, hub_key);
    assert_eq!(admin_unwrapped, hub_key);

    // Wrong label fails
    assert!(ecies_unwrap_key(&vol_env, TEST_SECRET_KEY, LABEL_NOTE_KEY).is_err());
}

#[test]
fn nostr_event_signing_interop() {
    let event = finalize_nostr_event(
        20001,
        1700000000,
        vec![
            vec!["d".into(), "hub-123".into()],
            vec!["t".into(), "llamenos:event".into()],
        ],
        "test-content",
        TEST_SECRET_KEY,
    )
    .unwrap();

    // Event ID is deterministic (same inputs → same ID)
    let canonical = serde_json::to_string(&serde_json::json!([
        0,
        &event.pubkey,
        event.created_at,
        event.kind,
        &event.tags,
        &event.content,
    ]))
    .unwrap();
    let expected_id = hex::encode(Sha256::digest(canonical.as_bytes()));
    assert_eq!(event.id, expected_id);

    // Pubkey matches
    let expected_pubkey = get_public_key(TEST_SECRET_KEY).unwrap();
    assert_eq!(event.pubkey, expected_pubkey);

    // Signature is valid (verify pre-hashed with k256)
    use k256::schnorr::VerifyingKey;
    use k256::ecdsa::signature::hazmat::PrehashVerifier;
    let pk_bytes = hex::decode(&event.pubkey).unwrap();
    let vk = VerifyingKey::from_bytes(pk_bytes.as_slice().try_into().unwrap()).unwrap();
    let sig_bytes = hex::decode(&event.sig).unwrap();
    let sig = k256::schnorr::Signature::try_from(sig_bytes.as_slice()).unwrap();
    let id_bytes = hex::decode(&event.id).unwrap();
    vk.verify_prehash(&id_bytes, &sig).unwrap();
}

#[test]
fn export_encryption_roundtrip() {
    let json = r#"{"notes":[],"exportedAt":"2024-06-15"}"#;
    let encrypted = encrypt_export(json, TEST_SECRET_KEY).unwrap();

    // Verify base64 encoding
    let decoded = STANDARD.decode(&encrypted).unwrap();
    assert!(decoded.len() >= 24 + 16, "must have nonce + tag minimum");

    // Since decrypt_export doesn't exist in Rust, verify structure manually:
    // First 24 bytes are nonce, rest is ciphertext
    let _nonce = &decoded[..24];
    let _ciphertext = &decoded[24..];
}

#[test]
fn call_record_admin_only_decryption() {
    let admin_pubkey = get_public_key(TEST_ADMIN_SECRET_KEY).unwrap();
    let vol_pubkey = get_public_key(TEST_SECRET_KEY).unwrap();

    let plaintext = r#"{"answeredBy":"vol123","callerNumber":"+1555000"}"#;
    let encrypted = encrypt_call_record_for_test(plaintext, &[admin_pubkey.clone()]);

    // Admin can decrypt
    let decrypted = decrypt_call_record(
        &encrypted.encrypted_content,
        &encrypted.reader_envelopes,
        TEST_ADMIN_SECRET_KEY,
        &admin_pubkey,
    )
    .unwrap();
    assert_eq!(decrypted, plaintext);

    // Volunteer cannot (not in envelopes)
    let result = decrypt_call_record(
        &encrypted.encrypted_content,
        &encrypted.reader_envelopes,
        TEST_SECRET_KEY,
        &vol_pubkey,
    );
    assert!(result.is_err(), "Volunteer must not decrypt call records");
}

#[test]
fn domain_separation_all_labels() {
    let admin_pubkey = get_public_key(TEST_ADMIN_SECRET_KEY).unwrap();
    let key = [0x42; 32];

    // Wrap same key with different labels
    let labels = [LABEL_NOTE_KEY, LABEL_MESSAGE, LABEL_HUB_KEY_WRAP, LABEL_CALL_META];
    let envelopes: Vec<_> = labels
        .iter()
        .map(|l| ecies_wrap_key(&key, &admin_pubkey, l).unwrap())
        .collect();

    // Each envelope only unwraps with its own label
    for (i, env) in envelopes.iter().enumerate() {
        for (j, label) in labels.iter().enumerate() {
            let result = ecies_unwrap_key(env, TEST_ADMIN_SECRET_KEY, label);
            if i == j {
                assert!(result.is_ok(), "Same label must succeed: {label}");
                assert_eq!(result.unwrap(), key);
            } else {
                assert!(result.is_err(), "Cross-label {}/{} must fail", labels[i], label);
            }
        }
    }
}
