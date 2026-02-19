import type { BlobStorage, TranscriptionService } from '../platform/types'
import type { MessagingChannelType } from '../shared/types'

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

  // Transcription (CF: Ai binding, Node: Whisper HTTP client)
  AI: TranscriptionService

  // Static assets (CF: Fetcher, Node: null — served by Hono serveStatic)
  ASSETS: { fetch(request: Request): Promise<Response> } | null

  // Blob storage (CF: R2Bucket, Node: MinIO S3 client)
  R2_BUCKET: BlobStorage

  // Plain env vars / secrets (same on both platforms)
  TWILIO_ACCOUNT_SID: string
  TWILIO_AUTH_TOKEN: string
  TWILIO_PHONE_NUMBER: string
  ADMIN_PUBKEY: string
  HOTLINE_NAME: string
  ENVIRONMENT: string
}

export type UserRole = 'volunteer' | 'admin' | 'reporter'

export interface Volunteer {
  pubkey: string
  name: string
  phone: string
  role: UserRole
  active: boolean
  createdAt: string
  encryptedSecretKey: string // Admin-encrypted copy of the volunteer's nsec
  transcriptionEnabled: boolean
  spokenLanguages: string[]  // Languages volunteer can take calls in (e.g. ['en', 'es'])
  uiLanguage: string         // Preferred UI language
  profileCompleted: boolean  // Whether first-login setup is done
  onBreak: boolean           // Temporarily unavailable (still on shift)
  callPreference: 'phone' | 'browser' | 'both'  // How to receive calls (default: 'phone')
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
}

export interface EncryptedNote {
  id: string
  callId: string
  authorPubkey: string
  encryptedContent: string
  createdAt: string
  updatedAt: string
  ephemeralPubkey?: string // hex-encoded, present for server-encrypted transcriptions (ECIES)
  // V2 per-note ECIES envelopes (forward secrecy)
  authorEnvelope?: { encryptedNoteKey: string; ephemeralPubkey: string }
  adminEnvelope?: { encryptedNoteKey: string; ephemeralPubkey: string }
}

export interface AuditLogEntry {
  id: string
  event: string
  actorPubkey: string
  details: Record<string, unknown>
  createdAt: string
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
  role: UserRole
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

export interface EncryptedMessage {
  id: string
  conversationId: string
  direction: 'inbound' | 'outbound'
  authorPubkey: string             // volunteer pubkey or 'system:inbound'
  encryptedContent: string         // ECIES-encrypted message text
  ephemeralPubkey: string          // for ECIES decryption
  encryptedContentAdmin: string    // admin copy
  ephemeralPubkeyAdmin: string
  hasAttachments: boolean
  attachmentIds?: string[]         // references to R2 encrypted blobs
  createdAt: string
  externalId?: string              // provider's message ID
}

// Hono typed context
export type AppEnv = {
  Bindings: Env
  Variables: {
    pubkey: string
    volunteer: Volunteer
    isAdmin: boolean
    role: UserRole
  }
}
