// --- ECIES Key Envelopes ---
// Used across notes, messages, files, and hub key wrapping.

/**
 * Unified ECIES-wrapped symmetric key for one recipient.
 * Used everywhere: notes, messages, call records, hub keys.
 * The same ECIES construction with different domain separation labels.
 */
export interface RecipientEnvelope {
  /** Recipient's x-only public key (hex). */
  pubkey: string
  /** Nonce (24 bytes) + ciphertext: ECIES-wrapped symmetric key (hex). */
  wrappedKey: string
  /** Ephemeral secp256k1 compressed public key used for ECDH (hex). */
  ephemeralPubkey: string
}

/** @deprecated Use RecipientEnvelope instead. Kept for gradual migration. */
export type KeyEnvelope = Omit<RecipientEnvelope, 'pubkey'>

/** @deprecated Use RecipientEnvelope instead. */
export type RecipientKeyEnvelope = RecipientEnvelope

// --- Telephony Provider Config ---

export type TelephonyProviderType = 'twilio' | 'signalwire' | 'vonage' | 'plivo' | 'asterisk'

export const TELEPHONY_PROVIDER_LABELS: Record<TelephonyProviderType, string> = {
  twilio: 'Twilio',
  signalwire: 'SignalWire',
  vonage: 'Vonage',
  plivo: 'Plivo',
  asterisk: 'Asterisk (Self-Hosted)',
}

export interface TelephonyProviderConfig {
  type: TelephonyProviderType
  phoneNumber: string      // E.164 hotline number

  // Twilio / SignalWire
  accountSid?: string
  authToken?: string
  signalwireSpace?: string  // SignalWire only: {space}.signalwire.com

  // Vonage
  apiKey?: string
  apiSecret?: string
  applicationId?: string
  privateKey?: string       // Vonage Application private key (PEM)

  // Plivo
  authId?: string
  // authToken shared with Twilio field

  // Asterisk ARI
  ariUrl?: string           // e.g. https://asterisk.example.com:8089/ari
  ariUsername?: string
  ariPassword?: string
  bridgeCallbackUrl?: string // URL the ARI bridge posts webhooks to

  // WebRTC (Twilio/SignalWire require extra API keys; Vonage/Plivo use existing creds)
  webrtcEnabled?: boolean
  apiKeySid?: string        // Twilio/SignalWire API Key SID for Access Token generation
  apiKeySecret?: string     // Twilio/SignalWire API Key Secret
  twimlAppSid?: string      // Twilio/SignalWire TwiML App SID for browser calls

  // SIP VoIP (mobile native clients — Linphone SDK, Epic 91)
  sipDomain?: string            // SIP REGISTER domain
  sipUsername?: string          // SIP REGISTER username
  sipPassword?: string          // SIP REGISTER password
  sipEndpointUsername?: string  // Plivo SIP endpoint username
  sipEndpointPassword?: string  // Plivo SIP endpoint password
  spaceUrl?: string             // SignalWire space URL
  asteriskGateway?: string      // Vonage→Asterisk SIP gateway host
  asteriskSipUsername?: string  // Vonage→Asterisk SIP credentials
  asteriskSipPassword?: string  // Vonage→Asterisk SIP credentials
}

// --- Call Preference ---

export type CallPreference = 'phone' | 'browser' | 'both'

/** Which credential fields each provider requires */
export const PROVIDER_REQUIRED_FIELDS: Record<TelephonyProviderType, (keyof TelephonyProviderConfig)[]> = {
  twilio: ['accountSid', 'authToken', 'phoneNumber'],
  signalwire: ['accountSid', 'authToken', 'signalwireSpace', 'phoneNumber'],
  vonage: ['apiKey', 'apiSecret', 'applicationId', 'phoneNumber'],
  plivo: ['authId', 'authToken', 'phoneNumber'],
  asterisk: ['ariUrl', 'ariUsername', 'ariPassword', 'phoneNumber'],
}

// --- Custom Fields ---

export type CustomFieldContext = 'call-notes' | 'conversation-notes' | 'reports' | 'all'

/** Custom field definition — stored as config in SessionManager DO */
export interface CustomFieldDefinition {
  id: string               // unique UUID
  name: string             // internal key (machine-readable, e.g. "severity")
  label: string            // display label (e.g. "Severity Rating")
  type: 'text' | 'number' | 'select' | 'checkbox' | 'textarea' | 'file'
  required: boolean
  options?: string[]        // for 'select' type only
  validation?: {
    minLength?: number      // text/textarea
    maxLength?: number      // text/textarea
    min?: number            // number
    max?: number            // number
  }
  visibleToVolunteers: boolean
  editableByVolunteers: boolean
  context: CustomFieldContext  // where this field appears
  // File field type options
  maxFileSize?: number        // bytes, for file type
  allowedMimeTypes?: string[] // e.g., ['image/*', 'application/pdf']
  maxFiles?: number           // for multi-file fields (default: 1)
  order: number
  createdAt: string
}

// --- Encrypted File Upload Types ---

export interface EncryptedFileMetadata {
  originalName: string
  mimeType: string
  size: number
  dimensions?: { width: number; height: number }
  duration?: number
  checksum: string   // SHA-256 of plaintext for integrity verification
}

/** ECIES-wrapped file encryption key for one recipient. */
export interface FileKeyEnvelope {
  pubkey: string
  encryptedFileKey: string
  ephemeralPubkey: string
}

export interface FileRecord {
  id: string
  conversationId: string
  messageId?: string
  uploadedBy: string         // pubkey of uploader
  recipientEnvelopes: FileKeyEnvelope[]
  encryptedMetadata: Array<{
    pubkey: string
    encryptedContent: string
    ephemeralPubkey: string
  }>
  totalSize: number          // encrypted size in bytes
  totalChunks: number
  status: 'uploading' | 'complete' | 'failed'
  completedChunks: number
  createdAt: string
  completedAt?: string
}

export interface UploadInit {
  totalSize: number
  totalChunks: number
  conversationId: string
  recipientEnvelopes: FileKeyEnvelope[]
  encryptedMetadata: Array<{
    pubkey: string
    encryptedContent: string
    ephemeralPubkey: string
  }>
}

/** What gets encrypted before storage — replaces plain text */
export interface NotePayload {
  text: string
  fields?: Record<string, string | number | boolean>
}

export const MAX_CUSTOM_FIELDS = 20
export const MAX_SELECT_OPTIONS = 50
export const MAX_FIELD_NAME_LENGTH = 50
export const MAX_FIELD_LABEL_LENGTH = 200
export const MAX_OPTION_LENGTH = 200
export const FIELD_NAME_REGEX = /^[a-zA-Z0-9_]+$/

/** Check if a custom field should appear in a given context */
export function fieldMatchesContext(field: CustomFieldDefinition, context: CustomFieldContext): boolean {
  return field.context === context || field.context === 'all'
}

export const CUSTOM_FIELD_CONTEXT_LABELS: Record<CustomFieldContext, string> = {
  'call-notes': 'Call Notes',
  'conversation-notes': 'Conversation Notes',
  'reports': 'Reports',
  'all': 'All Record Types',
}

// --- Messaging Channel Types ---

export type MessagingChannelType = 'sms' | 'whatsapp' | 'signal' | 'rcs'

/** All possible channel types including voice and reports */
export type ChannelType = 'voice' | MessagingChannelType | 'reports'

/** Transport security level for each channel */
export type TransportSecurity = 'none' | 'provider-encrypted' | 'e2ee-to-bridge' | 'e2ee'

export const CHANNEL_SECURITY: Record<ChannelType, TransportSecurity> = {
  voice: 'provider-encrypted',
  sms: 'none',
  whatsapp: 'provider-encrypted',
  signal: 'e2ee-to-bridge',
  rcs: 'provider-encrypted',
  reports: 'e2ee',
}

export const CHANNEL_LABELS: Record<ChannelType, string> = {
  voice: 'Voice Calls',
  sms: 'SMS',
  whatsapp: 'WhatsApp',
  signal: 'Signal',
  rcs: 'RCS',
  reports: 'Reports',
}

// --- Messaging Configuration ---

export interface SMSConfig {
  // SMS reuses the telephony provider's phone number and credentials
  enabled: boolean
  autoResponse?: string        // auto-reply on first contact
  afterHoursResponse?: string  // auto-reply outside shift hours
}

export interface WhatsAppConfig {
  integrationMode: 'twilio' | 'direct'
  // Direct Meta API fields
  phoneNumberId?: string
  businessAccountId?: string
  accessToken?: string
  verifyToken?: string
  appSecret?: string
  // Twilio mode uses existing telephony provider credentials
  autoResponse?: string
  afterHoursResponse?: string
}

export interface SignalConfig {
  bridgeUrl: string            // e.g., "https://signal-bridge.internal:8080"
  bridgeApiKey: string
  webhookSecret: string
  registeredNumber: string
  autoResponse?: string
  afterHoursResponse?: string
}

export interface RCSConfig {
  agentId: string
  serviceAccountKey: string    // JSON string of Google service account key
  webhookSecret?: string
  fallbackToSms: boolean
  autoResponse?: string
  afterHoursResponse?: string
}

export interface MessagingConfig {
  enabledChannels: MessagingChannelType[]
  sms: SMSConfig | null
  whatsapp: WhatsAppConfig | null
  signal: SignalConfig | null
  rcs: RCSConfig | null
  autoAssign: boolean               // auto-assign to on-shift volunteers
  inactivityTimeout: number         // minutes before auto-close
  maxConcurrentPerVolunteer: number  // conversation limit per volunteer
}

export const DEFAULT_MESSAGING_CONFIG: MessagingConfig = {
  enabledChannels: [],
  sms: null,
  whatsapp: null,
  signal: null,
  rcs: null,
  autoAssign: true,
  inactivityTimeout: 60,
  maxConcurrentPerVolunteer: 3,
}

// --- Message Blasts ---

export interface Subscriber {
  id: string
  identifierHash: string         // HMAC hash of phone/identifier
  channels: SubscriberChannel[]
  tags: string[]
  language: string               // preferred language code
  subscribedAt: string
  status: 'active' | 'paused' | 'unsubscribed'
  doubleOptInConfirmed: boolean
  preferenceToken: string        // HMAC token for self-service preferences
}

export interface SubscriberChannel {
  type: MessagingChannelType
  verified: boolean
}

export interface Blast {
  id: string
  name: string
  content: BlastContent
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'cancelled'
  targetChannels: MessagingChannelType[]
  targetTags: string[]            // empty = all subscribers
  targetLanguages: string[]       // empty = all languages
  scheduledAt?: string
  sentAt?: string
  cancelledAt?: string
  createdBy: string               // pubkey
  createdAt: string
  updatedAt: string
  stats: BlastStats
}

export interface BlastContent {
  text: string
  mediaUrl?: string
  mediaType?: string
  // Per-channel overrides
  smsText?: string
  whatsappTemplateId?: string
  rcsRichCard?: boolean
}

export interface BlastStats {
  totalRecipients: number
  sent: number
  delivered: number
  failed: number
  optedOut: number
}

export interface BlastSettings {
  subscribeKeyword: string        // default: "JOIN"
  unsubscribeKeyword: string      // default: "STOP"
  confirmationMessage: string
  unsubscribeMessage: string
  doubleOptIn: boolean
  optOutFooter: string            // appended to every blast message
  maxBlastsPerDay: number
  rateLimitPerSecond: number      // sending rate
}

export const DEFAULT_BLAST_SETTINGS: BlastSettings = {
  subscribeKeyword: 'JOIN',
  unsubscribeKeyword: 'STOP',
  confirmationMessage: 'You have been subscribed. Reply STOP to unsubscribe.',
  unsubscribeMessage: 'You have been unsubscribed. Reply JOIN to resubscribe.',
  doubleOptIn: false,
  optOutFooter: '\nReply STOP to unsubscribe.',
  maxBlastsPerDay: 10,
  rateLimitPerSecond: 10,
}

// --- Setup State ---

export interface SetupState {
  setupCompleted: boolean
  completedSteps: string[]
  pendingChannels: ChannelType[]
  selectedChannels: ChannelType[]
  demoMode?: boolean
}

export const DEFAULT_SETUP_STATE: SetupState = {
  setupCompleted: false,
  completedSteps: [],
  pendingChannels: [],
  selectedChannels: [],
  demoMode: false,
}

// --- Enabled Channels (computed from settings) ---

export interface EnabledChannels {
  voice: boolean
  sms: boolean
  whatsapp: boolean
  signal: boolean
  rcs: boolean
  reports: boolean
}

// --- Hub Types ---

export interface Hub {
  id: string              // UUID
  name: string            // Display name (e.g., "NYC Hotline")
  slug: string            // URL-safe identifier
  description?: string
  status: 'active' | 'suspended' | 'archived'
  phoneNumber?: string    // Primary hotline number (for routing)
  createdBy: string       // Super admin pubkey
  createdAt: string
  updatedAt: string
}

export interface HubRoleAssignment {
  hubId: string
  roleIds: string[]
}
