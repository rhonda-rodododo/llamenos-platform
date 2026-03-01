//! Authoritative domain separation constants for all cryptographic operations.
//!
//! Every ECIES derivation, HKDF context, HMAC key, and Schnorr signature binding
//! uses a unique context string from this module. This prevents cross-context key
//! reuse attacks where a ciphertext from one domain could be valid in another.
//!
//! RULES:
//! 1. NEVER use raw string literals for crypto contexts — use constants from here
//! 2. New crypto operations MUST add a new constant before implementation
//! 3. All constants are prefixed with "llamenos:" for collision avoidance
//! 4. These MUST be identical to `src/shared/crypto-labels.ts` in the main repo

// --- ECIES Key Wrapping ---

/// Per-note symmetric key wrapping (V2 forward secrecy)
pub const LABEL_NOTE_KEY: &str = "llamenos:note-key";

/// Per-file symmetric key wrapping
pub const LABEL_FILE_KEY: &str = "llamenos:file-key";

/// File metadata ECIES wrapping
pub const LABEL_FILE_METADATA: &str = "llamenos:file-metadata";

/// Hub key ECIES distribution wrapping (Epic 76.2)
pub const LABEL_HUB_KEY_WRAP: &str = "llamenos:hub-key-wrap";

// --- ECIES Content Encryption ---

/// Server-side transcription encryption
pub const LABEL_TRANSCRIPTION: &str = "llamenos:transcription";

/// E2EE message encryption (Epic 74)
pub const LABEL_MESSAGE: &str = "llamenos:message";

/// Encrypted call record metadata (Epic 77)
pub const LABEL_CALL_META: &str = "llamenos:call-meta";

/// Encrypted shift schedule details (Epic 77)
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

/// Hub event HKDF derivation from hub key (Epic 76.2)
pub const LABEL_HUB_EVENT: &str = "llamenos:hub-event";

// --- ECDH Key Agreement ---

/// Device provisioning ECDH shared key derivation
pub const LABEL_DEVICE_PROVISION: &str = "llamenos:device-provision";

// --- SAS Verification (Epic 76.0) ---

/// SAS HKDF salt for provisioning verification
pub const SAS_SALT: &str = "llamenos:sas";

/// SAS HKDF info parameter
pub const SAS_INFO: &str = "llamenos:provisioning-sas";

// --- Auth Token ---

/// Schnorr auth token message prefix
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

/// Generic backup encryption (Epic 76.0)
pub const LABEL_BACKUP: &str = "llamenos:backup";

// --- Server Nostr Identity (Epic 76.1) ---

/// HKDF derivation for server Nostr keypair from SERVER_NOSTR_SECRET
pub const LABEL_SERVER_NOSTR_KEY: &str = "llamenos:server-nostr-key";

/// HKDF info parameter for server Nostr key (versioned for rotation)
pub const LABEL_SERVER_NOSTR_KEY_INFO: &str = "llamenos:server-nostr-key:v1";

// --- Push Notification Encryption (Epic 86) ---

/// Wake-tier ECIES push payload — decryptable without PIN (minimal metadata only)
pub const LABEL_PUSH_WAKE: &str = "llamenos:push-wake";

/// Full-tier ECIES push payload — decryptable only with volunteer's nsec
pub const LABEL_PUSH_FULL: &str = "llamenos:push-full";

#[cfg(test)]
mod tests {
    use super::*;

    /// Ensure all label constants match the TypeScript originals exactly.
    /// If this test fails, interoperability between clients is broken.
    #[test]
    fn labels_match_typescript() {
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
    }
}
