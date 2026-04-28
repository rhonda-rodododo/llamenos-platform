//! Authoritative domain separation constants for all cryptographic operations.
//!
//! Every HPKE envelope, HKDF context, HMAC key, and Ed25519 signature binding
//! uses a unique context string from this module. This prevents cross-context key
//! reuse attacks where a ciphertext from one domain could be valid in another.
//!
//! RULES:
//! 1. NEVER use raw string literals for crypto contexts — use constants from here
//! 2. New crypto operations MUST add a new constant before implementation
//! 3. All constants are prefixed with "llamenos:" for collision avoidance
//! 4. These MUST match `packages/protocol/crypto-labels.json`
//!
//! ## Label Registry
//!
//! The `LABEL_REGISTRY` array maps numeric IDs (u8) to label strings.
//! This is used in the HPKE envelope `labelId` field for compact wire representation.
//! Indices are stable — never reorder or reuse indices.

// --- ECIES / HPKE Key Wrapping ---

/// Domain-specific HKDF salt for ECIES v2 key derivation
pub const LABEL_ECIES_V2_SALT: &str = "llamenos:ecies:v2";

/// Per-note symmetric key wrapping
pub const LABEL_NOTE_KEY: &str = "llamenos:note-key";

/// Per-file symmetric key wrapping
pub const LABEL_FILE_KEY: &str = "llamenos:file-key";

/// File metadata encryption
pub const LABEL_FILE_METADATA: &str = "llamenos:file-metadata";

/// Hub key distribution wrapping
pub const LABEL_HUB_KEY_WRAP: &str = "llamenos:hub-key-wrap";

// --- Content Encryption ---

/// Server-side transcription encryption
pub const LABEL_TRANSCRIPTION: &str = "llamenos:transcription";

/// E2EE message encryption
pub const LABEL_MESSAGE: &str = "llamenos:message";

/// Encrypted call record metadata
pub const LABEL_CALL_META: &str = "llamenos:call-meta";

/// Encrypted shift schedule details
pub const LABEL_SHIFT_SCHEDULE: &str = "llamenos:shift-schedule";

// --- HKDF Derivation ---

/// HKDF salt for legacy symmetric key derivation
pub const HKDF_SALT: &str = "llamenos:hkdf-salt:v1";

/// HKDF context: legacy V1 note encryption
pub const HKDF_CONTEXT_NOTES: &str = "llamenos:notes";

/// HKDF context: draft encryption
pub const HKDF_CONTEXT_DRAFTS: &str = "llamenos:drafts";

/// HKDF context: export encryption
pub const HKDF_CONTEXT_EXPORT: &str = "llamenos:export";

/// Hub event HKDF derivation from hub key
pub const LABEL_HUB_EVENT: &str = "llamenos:hub-event";

// --- Key Agreement ---

/// Device provisioning shared key derivation
pub const LABEL_DEVICE_PROVISION: &str = "llamenos:device-provision";

/// HKDF salt for provisioning key derivation
pub const LABEL_PROVISIONING_SALT: &str = "llamenos:provisioning:v1";

// --- SAS Verification ---

/// SAS HKDF salt for provisioning verification
pub const SAS_SALT: &str = "llamenos:sas";

/// SAS HKDF info parameter
pub const SAS_INFO: &str = "llamenos:provisioning-sas";

// --- Auth Token ---

/// Auth token message prefix (Ed25519 or legacy Schnorr)
pub const AUTH_PREFIX: &str = "llamenos:auth:";

// --- HMAC Domain Separation ---

/// Phone number hashing prefix
pub const HMAC_PHONE_PREFIX: &str = "llamenos:phone:";

/// IP address hashing prefix
pub const HMAC_IP_PREFIX: &str = "llamenos:ip:";

/// Key identification hashing prefix
pub const HMAC_KEYID_PREFIX: &str = "llamenos:keyid:";

/// Subscriber identifier HMAC key
pub const HMAC_SUBSCRIBER: &str = "llamenos:subscriber";

/// Preference token HMAC key
pub const HMAC_PREFERENCE_TOKEN: &str = "llamenos:preference-token";

// --- Recovery / Backup ---

/// Recovery key PBKDF2 fallback salt (legacy)
pub const RECOVERY_SALT: &str = "llamenos:recovery";

/// Generic backup encryption
pub const LABEL_BACKUP: &str = "llamenos:backup";

// --- Server Identity ---

/// HKDF derivation for server keypair from SERVER_NOSTR_SECRET
pub const LABEL_SERVER_NOSTR_KEY: &str = "llamenos:server-nostr-key";

/// HKDF info parameter for server key (versioned for rotation)
pub const LABEL_SERVER_NOSTR_KEY_INFO: &str = "llamenos:server-nostr-key:v1";

// --- Push Notification Encryption ---

/// Wake-tier push payload — decryptable without PIN (minimal metadata only)
pub const LABEL_PUSH_WAKE: &str = "llamenos:push-wake";

/// Full-tier push payload — decryptable only with user's key
pub const LABEL_PUSH_FULL: &str = "llamenos:push-full";

// --- Contact / CMS Encryption ---

/// HKDF context for encrypting contact identifiers at rest
pub const LABEL_CONTACT_ID: &str = "llamenos:contact-identifier";

/// Contact profile encryption
pub const LABEL_CONTACT_PROFILE: &str = "llamenos:contact-profile";

/// Case summary encryption
pub const LABEL_CASE_SUMMARY: &str = "llamenos:case-summary";

/// Case fields encryption
pub const LABEL_CASE_FIELDS: &str = "llamenos:case-fields";

/// Event details encryption
pub const LABEL_EVENT_DETAILS: &str = "llamenos:event-details";

/// Blind index key derivation (HKDF salt)
pub const LABEL_BLIND_INDEX_KEY: &str = "llamenos:blind-index-key";

/// Blind index field-level HKDF info prefix
pub const LABEL_BLIND_INDEX_FIELD: &str = "llamenos:blind-idx:";

/// Cross-hub share encryption
pub const LABEL_CROSS_HUB_SHARE: &str = "llamenos:cross-hub-share";

// --- HMAC: CMS Blind Index ---

pub const HMAC_CONTACT_NAME: &str = "llamenos:contact-name";
pub const HMAC_CONTACT_TAG: &str = "llamenos:contact-tag";
pub const HMAC_CASE_STATUS: &str = "llamenos:case-status";
pub const HMAC_CASE_SEVERITY: &str = "llamenos:case-severity";
pub const HMAC_CASE_CATEGORY: &str = "llamenos:case-category";
pub const HMAC_EVENT_TYPE: &str = "llamenos:event-type";

// --- NEW: PUK (Per-User Key) ---

/// PUK signing subkey derivation
pub const LABEL_PUK_SIGN: &str = "llamenos:puk:sign:v1";

/// PUK DH (encryption) subkey derivation
pub const LABEL_PUK_DH: &str = "llamenos:puk:dh:v1";

/// PUK secretbox (CLKR chain) subkey derivation
pub const LABEL_PUK_SECRETBOX: &str = "llamenos:puk:secretbox:v1";

/// PUK seed wrapped to a device's X25519 key
pub const LABEL_PUK_WRAP_TO_DEVICE: &str = "llamenos:puk:wrap:device:v1";

/// PUK previous generation wrap (CLKR chain link)
pub const LABEL_PUK_PREVIOUS_GEN: &str = "llamenos:puk:prev-gen:v1";

// --- NEW: Device Auth (Ed25519) ---

/// Ed25519 device authentication token label
pub const LABEL_DEVICE_AUTH: &str = "llamenos:device-auth:v1";

// --- NEW: Items Key / Note Epoch ---

/// Items key export from MLS epoch secret
pub const LABEL_ITEMS_KEY_EXPORT: &str = "llamenos:items-key-export:v1";

/// Note epoch key derivation
pub const LABEL_NOTE_EPOCH_KEY: &str = "llamenos:note-epoch-key:v1";

// --- NEW: Hub PTK ---

/// Hub PTK derivation from MLS export secret
pub const LABEL_HUB_PTK: &str = "llamenos:hub-ptk:v1";

/// Hub PTK previous generation wrap
pub const LABEL_HUB_PTK_PREV_GEN: &str = "llamenos:hub-ptk:prev-gen:v1";

// --- NEW: SFrame ---

/// SFrame call secret derivation from MLS exporter
pub const LABEL_SFRAME_CALL_SECRET: &str = "llamenos:sframe-call-secret:v1";

/// SFrame per-participant base key
pub const LABEL_SFRAME_BASE_KEY: &str = "llamenos:sframe-base-key:v1";

// --- NEW: MLS ---

/// MLS key package provisioning
pub const LABEL_MLS_PROVISION: &str = "llamenos:mls-provision:v1";

// --- Nostr ---

/// Nostr event tag type used to identify Llamenos hub events
pub const NOSTR_EVENT_TAG: &str = "llamenos:event";

/// Prefix for per-room Nostr event tags used in device provisioning flows
pub const LABEL_PROVISION_PREFIX: &str = "llamenos:provision-";

/// PBKDF2 salt for Tauri Stronghold key derivation (desktop only)
pub const LABEL_STRONGHOLD: &str = "llamenos:stronghold:v1";

// =============================================================================
// LABEL REGISTRY — maps numeric IDs (u8) to label strings.
//
// The index IS the labelId in the HPKE envelope wire format.
// Indices are stable and MUST NEVER be reordered or reused.
//
// Indices 0-35: existing labels (from crypto-labels.json ordering)
// Indices 36-46: new v3 labels (PUK, device auth, items key, SFrame, MLS)
// =============================================================================

pub const LABEL_REGISTRY: &[&str] = &[
    // 0-3: Key wrapping
    LABEL_NOTE_KEY,        // 0
    LABEL_FILE_KEY,        // 1
    LABEL_FILE_METADATA,   // 2
    LABEL_HUB_KEY_WRAP,    // 3
    // 4-7: Content encryption
    LABEL_TRANSCRIPTION,   // 4
    LABEL_MESSAGE,         // 5
    LABEL_CALL_META,       // 6
    LABEL_SHIFT_SCHEDULE,  // 7
    // 8-12: HKDF contexts
    HKDF_SALT,             // 8
    HKDF_CONTEXT_NOTES,    // 9
    HKDF_CONTEXT_DRAFTS,   // 10
    HKDF_CONTEXT_EXPORT,   // 11
    LABEL_HUB_EVENT,       // 12
    // 13: Key agreement
    LABEL_DEVICE_PROVISION, // 13
    // 14-15: SAS
    SAS_SALT,              // 14
    SAS_INFO,              // 15
    // 16: Auth
    AUTH_PREFIX,            // 16
    // 17-21: HMAC prefixes
    HMAC_PHONE_PREFIX,     // 17
    HMAC_IP_PREFIX,        // 18
    HMAC_KEYID_PREFIX,     // 19
    HMAC_SUBSCRIBER,       // 20
    HMAC_PREFERENCE_TOKEN, // 21
    // 22-23: Recovery/backup
    RECOVERY_SALT,         // 22
    LABEL_BACKUP,          // 23
    // 24-25: Server identity
    LABEL_SERVER_NOSTR_KEY,      // 24
    LABEL_SERVER_NOSTR_KEY_INFO, // 25
    // 26-27: Push
    LABEL_PUSH_WAKE,       // 26
    LABEL_PUSH_FULL,       // 27
    // 28-34: CMS
    LABEL_CONTACT_ID,      // 28
    LABEL_CONTACT_PROFILE, // 29
    LABEL_CASE_SUMMARY,    // 30
    LABEL_CASE_FIELDS,     // 31
    LABEL_EVENT_DETAILS,   // 32
    LABEL_BLIND_INDEX_KEY, // 33
    LABEL_CROSS_HUB_SHARE, // 34
    // 35-40: CMS HMAC
    HMAC_CONTACT_NAME,     // 35
    HMAC_CONTACT_TAG,      // 36
    HMAC_CASE_STATUS,      // 37
    HMAC_CASE_SEVERITY,    // 38
    HMAC_CASE_CATEGORY,    // 39
    HMAC_EVENT_TYPE,       // 40
    // 41-45: PUK
    LABEL_PUK_SIGN,            // 41
    LABEL_PUK_DH,              // 42
    LABEL_PUK_SECRETBOX,       // 43
    LABEL_PUK_WRAP_TO_DEVICE,  // 44
    LABEL_PUK_PREVIOUS_GEN,    // 45
    // 46: Device auth
    LABEL_DEVICE_AUTH,          // 46
    // 47-48: Items key / note epoch
    LABEL_ITEMS_KEY_EXPORT,     // 47
    LABEL_NOTE_EPOCH_KEY,       // 48
    // 49: Hub PTK
    LABEL_HUB_PTK_PREV_GEN,    // 49
    // 50-51: SFrame
    LABEL_SFRAME_CALL_SECRET,  // 50
    LABEL_SFRAME_BASE_KEY,     // 51
    // 52: MLS
    LABEL_MLS_PROVISION,        // 52
    // 53-56: Salt/derivation labels
    LABEL_ECIES_V2_SALT,        // 53
    LABEL_PROVISIONING_SALT,    // 54
    LABEL_BLIND_INDEX_FIELD,    // 55
    LABEL_HUB_PTK,              // 56
];

/// Look up a label string by its numeric ID.
pub fn id_to_label(id: u8) -> Option<&'static str> {
    LABEL_REGISTRY.get(id as usize).copied()
}

/// Look up the numeric ID for a label string.
pub fn label_to_id(label: &str) -> Option<u8> {
    LABEL_REGISTRY
        .iter()
        .position(|&l| l == label)
        .map(|i| i as u8)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Ensure all label constants match the TypeScript originals exactly.
    #[test]
    fn labels_match_expected_values() {
        assert_eq!(LABEL_NOTE_KEY, "llamenos:note-key");
        assert_eq!(LABEL_FILE_KEY, "llamenos:file-key");
        assert_eq!(LABEL_FILE_METADATA, "llamenos:file-metadata");
        assert_eq!(LABEL_HUB_KEY_WRAP, "llamenos:hub-key-wrap");
        assert_eq!(LABEL_TRANSCRIPTION, "llamenos:transcription");
        assert_eq!(LABEL_MESSAGE, "llamenos:message");
        assert_eq!(LABEL_CALL_META, "llamenos:call-meta");
        assert_eq!(LABEL_SHIFT_SCHEDULE, "llamenos:shift-schedule");
        assert_eq!(HKDF_SALT, "llamenos:hkdf-salt:v1");
        assert_eq!(HKDF_CONTEXT_NOTES, "llamenos:notes");
        assert_eq!(HKDF_CONTEXT_DRAFTS, "llamenos:drafts");
        assert_eq!(HKDF_CONTEXT_EXPORT, "llamenos:export");
        assert_eq!(LABEL_HUB_EVENT, "llamenos:hub-event");
        assert_eq!(LABEL_DEVICE_PROVISION, "llamenos:device-provision");
        assert_eq!(SAS_SALT, "llamenos:sas");
        assert_eq!(SAS_INFO, "llamenos:provisioning-sas");
        assert_eq!(AUTH_PREFIX, "llamenos:auth:");
        assert_eq!(HMAC_PHONE_PREFIX, "llamenos:phone:");
        assert_eq!(HMAC_IP_PREFIX, "llamenos:ip:");
        assert_eq!(HMAC_KEYID_PREFIX, "llamenos:keyid:");
        assert_eq!(HMAC_SUBSCRIBER, "llamenos:subscriber");
        assert_eq!(HMAC_PREFERENCE_TOKEN, "llamenos:preference-token");
        assert_eq!(RECOVERY_SALT, "llamenos:recovery");
        assert_eq!(LABEL_BACKUP, "llamenos:backup");
        assert_eq!(LABEL_SERVER_NOSTR_KEY, "llamenos:server-nostr-key");
        assert_eq!(LABEL_SERVER_NOSTR_KEY_INFO, "llamenos:server-nostr-key:v1");
        assert_eq!(LABEL_PUSH_WAKE, "llamenos:push-wake");
        assert_eq!(LABEL_PUSH_FULL, "llamenos:push-full");
        assert_eq!(LABEL_CONTACT_ID, "llamenos:contact-identifier");
    }

    /// Verify new v3 labels are present.
    #[test]
    fn new_v3_labels() {
        assert_eq!(LABEL_PUK_SIGN, "llamenos:puk:sign:v1");
        assert_eq!(LABEL_PUK_DH, "llamenos:puk:dh:v1");
        assert_eq!(LABEL_PUK_SECRETBOX, "llamenos:puk:secretbox:v1");
        assert_eq!(LABEL_PUK_WRAP_TO_DEVICE, "llamenos:puk:wrap:device:v1");
        assert_eq!(LABEL_PUK_PREVIOUS_GEN, "llamenos:puk:prev-gen:v1");
        assert_eq!(LABEL_DEVICE_AUTH, "llamenos:device-auth:v1");
        assert_eq!(LABEL_ITEMS_KEY_EXPORT, "llamenos:items-key-export:v1");
        assert_eq!(LABEL_NOTE_EPOCH_KEY, "llamenos:note-epoch-key:v1");
        assert_eq!(LABEL_HUB_PTK_PREV_GEN, "llamenos:hub-ptk:prev-gen:v1");
        assert_eq!(LABEL_SFRAME_CALL_SECRET, "llamenos:sframe-call-secret:v1");
        assert_eq!(LABEL_SFRAME_BASE_KEY, "llamenos:sframe-base-key:v1");
        assert_eq!(LABEL_MLS_PROVISION, "llamenos:mls-provision:v1");
        assert_eq!(LABEL_ECIES_V2_SALT, "llamenos:ecies:v2");
        assert_eq!(LABEL_PROVISIONING_SALT, "llamenos:provisioning:v1");
        assert_eq!(LABEL_BLIND_INDEX_FIELD, "llamenos:blind-idx:");
        assert_eq!(LABEL_HUB_PTK, "llamenos:hub-ptk:v1");
    }

    /// Verify registry index stability.
    #[test]
    fn registry_indices_stable() {
        assert_eq!(id_to_label(0), Some(LABEL_NOTE_KEY));
        assert_eq!(id_to_label(5), Some(LABEL_MESSAGE));
        assert_eq!(id_to_label(16), Some(AUTH_PREFIX));
        assert_eq!(id_to_label(26), Some(LABEL_PUSH_WAKE));
        assert_eq!(id_to_label(41), Some(LABEL_PUK_SIGN));
        assert_eq!(id_to_label(46), Some(LABEL_DEVICE_AUTH));
        assert_eq!(id_to_label(52), Some(LABEL_MLS_PROVISION));
        assert_eq!(id_to_label(53), Some(LABEL_ECIES_V2_SALT));
        assert_eq!(id_to_label(54), Some(LABEL_PROVISIONING_SALT));
        assert_eq!(id_to_label(55), Some(LABEL_BLIND_INDEX_FIELD));
        assert_eq!(id_to_label(56), Some(LABEL_HUB_PTK));
    }

    /// Verify bidirectional lookup.
    #[test]
    fn label_id_roundtrip() {
        for (i, &label) in LABEL_REGISTRY.iter().enumerate() {
            assert_eq!(label_to_id(label), Some(i as u8), "label_to_id failed for {label}");
            assert_eq!(id_to_label(i as u8), Some(label), "id_to_label failed for index {i}");
        }
    }

    /// Verify unknown IDs return None.
    #[test]
    fn unknown_id_returns_none() {
        assert_eq!(id_to_label(255), None);
        assert_eq!(label_to_id("nonexistent:label"), None);
    }

    /// Verify no duplicate labels in registry.
    #[test]
    fn no_duplicate_labels() {
        let mut seen = std::collections::HashSet::new();
        for &label in LABEL_REGISTRY {
            assert!(seen.insert(label), "duplicate label in registry: {label}");
        }
    }
}
