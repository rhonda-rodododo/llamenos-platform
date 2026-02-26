/**
 * Nostr event kind definitions for Llamenos server-published events.
 *
 * We use the NIP-01 custom kind ranges:
 *   - Regular events (1000-9999): persisted, returned in queries
 *   - Ephemeral events (20000-29999): not persisted, broadcast only
 *   - Replaceable events (30000-39999): latest replaces previous
 *
 * All server-published events are signed with the server Nostr keypair
 * (derived from SERVER_NOSTR_SECRET). Clients verify the signature
 * against the server's pubkey (fetched from /api/config).
 */

// --- Regular Events (persisted) ---

/** Incoming call notification — triggers volunteer ringing */
export const KIND_CALL_RING = 1000

/** Call state update — answered, completed, etc. */
export const KIND_CALL_UPDATE = 1001

/** Voicemail received for a call */
export const KIND_CALL_VOICEMAIL = 1002

/** New conversation message (inbound from external channel) */
export const KIND_MESSAGE_NEW = 1010

/** Conversation assignment changed */
export const KIND_CONVERSATION_ASSIGNED = 1011

/** Shift schedule changed */
export const KIND_SHIFT_UPDATE = 1020

/** Settings changed (global or hub-scoped) */
export const KIND_SETTINGS_CHANGED = 1030

// --- Ephemeral Events (not persisted, broadcast only) ---

/** Volunteer presence update — online counts, availability */
export const KIND_PRESENCE_UPDATE = 20000

/** Call answer/hangup signals — real-time coordination */
export const KIND_CALL_SIGNAL = 20001

// --- NIP-42 Auth (standard) ---

/** NIP-42 authentication event kind */
export const KIND_NIP42_AUTH = 22242
