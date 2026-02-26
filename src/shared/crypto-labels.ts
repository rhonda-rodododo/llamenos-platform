/**
 * Authoritative domain separation constants for all cryptographic operations.
 *
 * Every ECIES derivation, HKDF context, HMAC key, and Schnorr signature binding
 * uses a unique context string from this file. This prevents cross-context key
 * reuse attacks where a ciphertext from one domain could be valid in another.
 *
 * RULES:
 * 1. NEVER use raw string literals for crypto contexts — import from here
 * 2. New crypto operations MUST add a new constant before implementation
 * 3. All constants are prefixed with 'llamenos:' for collision avoidance
 */

// --- ECIES Key Wrapping ---

/** Per-note symmetric key wrapping (V2 forward secrecy) */
export const LABEL_NOTE_KEY = 'llamenos:note-key'

/** Per-file symmetric key wrapping */
export const LABEL_FILE_KEY = 'llamenos:file-key'

/** File metadata ECIES wrapping */
export const LABEL_FILE_METADATA = 'llamenos:file-metadata'

/** Hub key ECIES distribution wrapping (Epic 76.2) */
export const LABEL_HUB_KEY_WRAP = 'llamenos:hub-key-wrap'

// --- ECIES Content Encryption ---

/** Server-side transcription encryption */
export const LABEL_TRANSCRIPTION = 'llamenos:transcription'

/** E2EE message encryption (Epic 74) */
export const LABEL_MESSAGE = 'llamenos:message'

/** Encrypted call record metadata (Epic 77) — call assignments in history */
export const LABEL_CALL_META = 'llamenos:call-meta'

/** Encrypted shift schedule details (Epic 77) — full schedule beyond routing pubkeys */
export const LABEL_SHIFT_SCHEDULE = 'llamenos:shift-schedule'

// --- HKDF Derivation ---

/** HKDF salt for legacy symmetric key derivation */
export const HKDF_SALT = 'llamenos:hkdf-salt:v1'

/** HKDF context: legacy V1 note encryption */
export const HKDF_CONTEXT_NOTES = 'llamenos:notes'

/** HKDF context: draft encryption */
export const HKDF_CONTEXT_DRAFTS = 'llamenos:drafts'

/** HKDF context: export encryption */
export const HKDF_CONTEXT_EXPORT = 'llamenos:export'

/** Hub event HKDF derivation from hub key (Epic 76.2) */
export const LABEL_HUB_EVENT = 'llamenos:hub-event'

// --- ECDH Key Agreement ---

/** Device provisioning ECDH shared key derivation */
export const LABEL_DEVICE_PROVISION = 'llamenos:device-provision'

// --- SAS Verification (Epic 76.0) ---

/** SAS HKDF salt for provisioning verification */
export const SAS_SALT = 'llamenos:sas'

/** SAS HKDF info parameter */
export const SAS_INFO = 'llamenos:provisioning-sas'

// --- Auth Token ---

/** Schnorr auth token message prefix */
export const AUTH_PREFIX = 'llamenos:auth:'

// --- HMAC Domain Separation ---

/** Phone number hashing prefix */
export const HMAC_PHONE_PREFIX = 'llamenos:phone:'

/** IP address hashing prefix */
export const HMAC_IP_PREFIX = 'llamenos:ip:'

/** Key identification hashing prefix */
export const HMAC_KEYID_PREFIX = 'llamenos:keyid:'

/** Subscriber identifier HMAC key */
export const HMAC_SUBSCRIBER = 'llamenos:subscriber'

/** Preference token HMAC key */
export const HMAC_PREFERENCE_TOKEN = 'llamenos:preference-token'

// --- Recovery / Backup ---

/** Recovery key PBKDF2 fallback salt (legacy) */
export const RECOVERY_SALT = 'llamenos:recovery'

/** Generic backup encryption (Epic 76.0 — new format) */
export const LABEL_BACKUP = 'llamenos:backup'

// --- Server Nostr Identity (Epic 76.1) ---

/** HKDF derivation for server Nostr keypair from SERVER_NOSTR_SECRET */
export const LABEL_SERVER_NOSTR_KEY = 'llamenos:server-nostr-key'

/** HKDF info parameter for server Nostr key (versioned for rotation) */
export const LABEL_SERVER_NOSTR_KEY_INFO = 'llamenos:server-nostr-key:v1'
