import type { BlobStorage, TranscriptionService } from '../../src/platform/types'
import type { MessagingChannelType, RecipientEnvelope, KeyEnvelope } from '@shared/types'

/**
 * Environment bindings.
 *
 * On Cloudflare Workers: these are real CF bindings (DurableObjectNamespace, Ai, R2Bucket, Fetcher).
 * On Node.js: these are shims from src/platform/node/ that implement the same method signatures.
 *
 * We use structural typing — the interfaces only require the methods we actually call.
 */

/** Minimal DurableObjectStub — only .fetch() is used */
export interface DOStub {
  fetch(request: Request): Promise<Response>
}

/** Minimal DurableObjectNamespace — only .idFromName() and .get() are used */
export interface DONamespace {
  idFromName(name: string): { toString(): string }
  get(id: { toString(): string }): DOStub
}

export interface Env {
  // Durable Object namespaces (CF: DurableObjectNamespace, Node: shim)
  CALL_ROUTER: DONamespace
  SHIFT_MANAGER: DONamespace
  IDENTITY_DO: DONamespace
  SETTINGS_DO: DONamespace
  RECORDS_DO: DONamespace
  CONVERSATION_DO: DONamespace
  BLAST_DO: DONamespace
  CONTACT_DIRECTORY: DONamespace
  CASE_MANAGER: DONamespace

  // Transcription (CF: Ai binding, Node: Whisper HTTP client)
  AI: TranscriptionService

  // Blob storage (CF: R2Bucket, Node: MinIO S3 client)
  R2_BUCKET: BlobStorage

  // Nostr relay service binding (CF: Fetcher to Nosflare, Node: null)
  NOSFLARE?: { fetch(request: Request): Promise<Response> }

  // Plain env vars / secrets (same on both platforms)
  TWILIO_ACCOUNT_SID: string
  TWILIO_AUTH_TOKEN: string
  TWILIO_PHONE_NUMBER: string
  ADMIN_PUBKEY: string
  ADMIN_DECRYPTION_PUBKEY?: string // Separate pubkey for note/hub key encryption (falls back to ADMIN_PUBKEY)
  HOTLINE_NAME: string
  ENVIRONMENT: string
  HMAC_SECRET: string
  METRICS_SCRAPE_TOKEN?: string
  E2E_TEST_SECRET?: string
  DEV_RESET_SECRET?: string

  // Demo mode (CF Cron Trigger resets all DOs on schedule)
  DEMO_MODE?: string              // "true" to enable
  DEMO_RESET_CRON?: string        // Human-readable schedule label (e.g., "every 4 hours")

  // Server Nostr identity (Epic 76.1) — hex secret for HKDF keypair derivation
  SERVER_NOSTR_SECRET?: string
  // Relay URL for Node.js persistent WebSocket (Docker/self-hosted)
  NOSTR_RELAY_URL?: string
  // Public-facing relay URL for client browser connections (e.g., wss://relay.example.com)
  // Falls back to /nostr (reverse-proxied via Caddy) if not set but relay is configured
  NOSTR_RELAY_PUBLIC_URL?: string

  // GlitchTip/Sentry DSN for client-side crash reporting (Epic 293)
  GLITCHTIP_DSN?: string

  // Push notifications (Epic 86) — APNs (iOS)
  APNS_KEY_P8?: string       // Apple Push Notification auth key (PEM format)
  APNS_KEY_ID?: string       // Key ID from Apple Developer Portal
  APNS_TEAM_ID?: string      // Apple Developer Team ID

  // Push notifications (Epic 86) — FCM (Android)
  FCM_SERVICE_ACCOUNT_KEY?: string  // Google Cloud service account JSON

  // Pre-configured NostrPublisher (Node.js only — set by createNodeEnv with outbox wired)
  NOSTR_PUBLISHER?: import('./lib/nostr-publisher').NostrPublisher
}

// --- Push Notification Types (Epic 86) ---

export interface DeviceRecord {
  platform: 'ios' | 'android'
  pushToken: string
  wakeKeyPublic: string      // secp256k1 compressed pubkey (hex) for wake-tier ECIES
  registeredAt: string
  lastSeenAt: string
}

export type PushNotificationType = 'message' | 'voicemail' | 'shift_reminder' | 'assignment'

/** Wake-tier payload — decryptable without PIN (minimal metadata) */
export interface WakePayload {
  type: PushNotificationType
  conversationId?: string
  channelType?: string
  callId?: string
  shiftId?: string
  startsAt?: string
}

/** Full-tier payload — decryptable only with volunteer's nsec */
export interface FullPushPayload extends WakePayload {
  senderLast4?: string
  previewText?: string
  duration?: number
  callerLast4?: string
  shiftName?: string
  role?: string
}

/** @deprecated Use roles array + permission system instead */
export type UserRole = 'volunteer' | 'admin' | 'reporter'

export interface Volunteer {
  pubkey: string
  name: string
  phone: string
  roles: string[]            // Global role IDs (e.g., ['role-super-admin', 'role-volunteer'])
  hubRoles?: { hubId: string; roleIds: string[] }[]  // Per-hub role assignments
  active: boolean
  createdAt: string
  encryptedSecretKey: string // Admin-encrypted copy of the volunteer's nsec
  transcriptionEnabled: boolean
  spokenLanguages: string[]  // Languages volunteer can take calls in (e.g. ['en', 'es'])
  uiLanguage: string         // Preferred UI language
  profileCompleted: boolean  // Whether first-login setup is done
  onBreak: boolean           // Temporarily unavailable (still on shift)
  callPreference: 'phone' | 'browser' | 'both'  // How to receive calls (default: 'phone')
  // Messaging channel capabilities (Epic 68)
  supportedMessagingChannels?: MessagingChannelType[]  // SMS, WhatsApp, Signal, RCS (empty = all)
  messagingEnabled?: boolean  // Whether volunteer can handle messaging conversations
  // Volunteer profile extensions (Epic 340)
  specializations?: string[]        // e.g., ["immigration", "domestic_violence", "legal_observer"]
  maxCaseAssignments?: number       // Capacity limit (0 = unlimited, default: 0)
  teamId?: string                   // Team/group membership
  supervisorPubkey?: string         // Who reviews this volunteer's cases
}

export interface Shift {
  id: string
  name: string
  startTime: string
  endTime: string
  days: number[]
  volunteerPubkeys: string[]
  createdAt: string
}

export interface BanEntry {
  phone: string
  reason: string
  bannedBy: string
  bannedAt: string
}

export interface CallRecord {
  id: string
  callerNumber: string
  callerLast4?: string
  answeredBy: string | null
  startedAt: string
  endedAt?: string
  duration?: number
  status: 'ringing' | 'in-progress' | 'completed' | 'unanswered'
  hasTranscription: boolean
  hasVoicemail: boolean
  recordingSid?: string
  hasRecording?: boolean
}

/**
 * Encrypted call record for history storage (Epic 77).
 *
 * Active calls remain as plaintext CallRecord (routing necessity).
 * When a call completes, sensitive metadata (answeredBy, full callerNumber)
 * is encrypted into an envelope and stored per-record as `callrecord:${id}`.
 *
 * Plaintext fields: callerLast4, timestamp, duration, status, hasTranscription, hasVoicemail
 * Encrypted fields: answeredBy, callerNumber (original hash), outcome details
 */
export interface EncryptedCallRecord {
  id: string
  callerLast4?: string           // For display (not sensitive)
  startedAt: string              // Needed for ordering/pagination
  endedAt?: string               // Needed for duration display
  duration?: number              // Acceptable trade-off (no PII)
  status: 'completed' | 'unanswered'
  hasTranscription: boolean
  hasVoicemail: boolean
  hasRecording?: boolean
  recordingSid?: string          // Twilio ID (not PII, server needs to update post-encryption)

  // Envelope-pattern encryption for admin(s)
  encryptedContent: string       // hex: nonce(24) + ciphertext (XChaCha20-Poly1305)
  adminEnvelopes: RecipientEnvelope[]  // Per-record key wrapped for each admin
}

/**
 * Plaintext inside EncryptedCallRecord.encryptedContent.
 * Only visible after admin decryption.
 */
export interface CallRecordMetadata {
  answeredBy: string | null      // Volunteer pubkey
  callerNumber: string           // HMAC-hashed phone number
}

export interface EncryptedNote {
  id: string
  callId?: string              // links to a voice call
  conversationId?: string      // links to a conversation (NEW: Epic 123)
  contactHash?: string         // links to a contact for contact-level view (NEW: Epic 123)
  authorPubkey: string
  encryptedContent: string
  createdAt: string
  updatedAt: string
  ephemeralPubkey?: string // hex-encoded, present for server-encrypted transcriptions (ECIES)
  // V2 per-note ECIES envelopes (forward secrecy)
  authorEnvelope?: KeyEnvelope
  adminEnvelopes?: RecipientEnvelope[]
  replyCount?: number          // cached count of replies (NEW: Epic 123)
}

export interface AuditLogEntry {
  id: string
  event: string
  actorPubkey: string
  details: Record<string, unknown>
  createdAt: string
  // Tamper detection (Epic 77)
  previousEntryHash?: string     // SHA-256 of previous entry (chain link)
  entryHash?: string             // SHA-256 of this entry's content (for chain verification)
}

export interface SpamSettings {
  voiceCaptchaEnabled: boolean
  rateLimitEnabled: boolean
  maxCallsPerMinute: number
  blockDurationMinutes: number
}

export interface CallSettings {
  queueTimeoutSeconds: number   // 30-300, default 90
  voicemailMaxSeconds: number   // 30-300, default 120
}

export interface InviteCode {
  code: string
  name: string
  phone: string
  roleIds: string[]          // Role IDs to assign on redemption
  createdBy: string
  createdAt: string
  expiresAt: string
  usedAt?: string
  usedBy?: string
}

export interface WebAuthnCredential {
  id: string              // Base64URL credential ID
  publicKey: string       // Base64URL public key bytes
  counter: number         // Signature counter (clone detection)
  transports: string[]    // ['internal', 'hybrid', etc.]
  backedUp: boolean       // Cloud-synced passkey
  label: string           // User-assigned name ("My Phone")
  createdAt: string
  lastUsedAt: string
}

export interface WebAuthnSettings {
  requireForAdmins: boolean
  requireForVolunteers: boolean
}

export interface ServerSession {
  token: string           // Random 256-bit hex
  pubkey: string          // Which user
  createdAt: string
  expiresAt: string       // 8-hour expiry
}

export interface AuthPayload {
  pubkey: string
  timestamp: number
  token: string
}

// --- Conversation / Messaging Types ---

export type ConversationStatus = 'active' | 'waiting' | 'closed'

export interface Conversation {
  id: string
  channelType: MessagingChannelType | 'web'
  contactIdentifierHash: string   // hashed phone/ID
  contactLast4?: string           // last 4 digits (admin-only, like callerLast4)
  assignedTo?: string             // volunteer pubkey
  status: ConversationStatus
  createdAt: string
  updatedAt: string
  lastMessageAt: string
  messageCount: number
  metadata?: {
    linkedCallId?: string         // if conversation started from a call
    reportId?: string             // if conversation is a report thread
    type?: 'report'               // report conversations
    reportTitle?: string          // encrypted
    reportCategory?: string
    customFieldValues?: string    // encrypted JSON of custom field values
  }
}

export type MessageDeliveryStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed'

/**
 * Encrypted message using the envelope pattern (Epic 74).
 *
 * Single ciphertext encrypted with a random per-message symmetric key.
 * The key is ECIES-wrapped separately for each authorized reader.
 * Domain separation label: 'llamenos:message'.
 */
export interface EncryptedMessage {
  id: string
  conversationId: string
  direction: 'inbound' | 'outbound'
  authorPubkey: string             // volunteer pubkey or 'system:inbound'
  encryptedContent: string         // hex: nonce(24) + ciphertext (XChaCha20-Poly1305)
  // Per-reader key envelopes (ECIES-wrapped message key)
  readerEnvelopes: RecipientEnvelope[]
  hasAttachments: boolean
  attachmentIds?: string[]         // references to R2 encrypted blobs
  createdAt: string
  externalId?: string              // provider's message ID
  // Delivery status tracking (Epic 71)
  status?: MessageDeliveryStatus   // delivery status (default: 'pending' for outbound)
  deliveredAt?: string             // ISO timestamp when delivered
  readAt?: string                  // ISO timestamp when read (if supported)
  failureReason?: string           // error message for failed messages
  retryCount?: number              // number of retry attempts
}

/** @deprecated Use RecipientEnvelope from @shared/types instead. */
export type MessageKeyEnvelope = RecipientEnvelope

// --- Blast Queue ---

export interface BlastQueueItem {
  subscriberId: string
  channel: MessagingChannelType
  identifier: string            // actual phone/contact (server-only, not stored)
  status: 'pending' | 'sent' | 'failed'
  error?: string
  sentAt?: string
}

export interface BlastDeliveryQueue {
  blastId: string
  items: BlastQueueItem[]
  processedCount: number
  totalCount: number
}

// Hono typed context
export type AppEnv = {
  Bindings: Env
  Variables: {
    pubkey: string
    volunteer: Volunteer
    /** Effective permissions resolved from all roles */
    permissions: string[]
    /** All role definitions (loaded once per request) */
    allRoles: import('@shared/permissions').Role[]
    /** Current hub ID (set by hub middleware for hub-scoped routes) */
    hubId?: string
    /** Hub-scoped permissions (resolved for the current hub) */
    hubPermissions?: string[]
    /** Unique request ID for correlation (set by request-id middleware) */
    requestId: string
  }
}
