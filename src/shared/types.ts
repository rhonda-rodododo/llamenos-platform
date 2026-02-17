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

/** Custom field definition — stored as config in SessionManager DO */
export interface CustomFieldDefinition {
  id: string               // unique UUID
  name: string             // internal key (machine-readable, e.g. "severity")
  label: string            // display label (e.g. "Severity Rating")
  type: 'text' | 'number' | 'select' | 'checkbox' | 'textarea'
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
  order: number
  createdAt: string
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

// --- Messaging Channel Types ---

export type MessagingChannelType = 'sms' | 'whatsapp' | 'signal'

/** All possible channel types including voice and reports */
export type ChannelType = 'voice' | MessagingChannelType | 'reports'

/** Transport security level for each channel */
export type TransportSecurity = 'none' | 'provider-encrypted' | 'e2ee-to-bridge' | 'e2ee'

export const CHANNEL_SECURITY: Record<ChannelType, TransportSecurity> = {
  voice: 'provider-encrypted',
  sms: 'none',
  whatsapp: 'provider-encrypted',
  signal: 'e2ee-to-bridge',
  reports: 'e2ee',
}

export const CHANNEL_LABELS: Record<ChannelType, string> = {
  voice: 'Voice Calls',
  sms: 'SMS',
  whatsapp: 'WhatsApp',
  signal: 'Signal',
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

export interface MessagingConfig {
  enabledChannels: MessagingChannelType[]
  sms: SMSConfig | null
  whatsapp: WhatsAppConfig | null
  signal: SignalConfig | null
  autoAssign: boolean               // auto-assign to on-shift volunteers
  inactivityTimeout: number         // minutes before auto-close
  maxConcurrentPerVolunteer: number  // conversation limit per volunteer
}

export const DEFAULT_MESSAGING_CONFIG: MessagingConfig = {
  enabledChannels: [],
  sms: null,
  whatsapp: null,
  signal: null,
  autoAssign: true,
  inactivityTimeout: 60,
  maxConcurrentPerVolunteer: 3,
}

// --- Setup State ---

export interface SetupState {
  setupCompleted: boolean
  completedSteps: string[]
  pendingChannels: ChannelType[]
  selectedChannels: ChannelType[]
}

export const DEFAULT_SETUP_STATE: SetupState = {
  setupCompleted: false,
  completedSteps: [],
  pendingChannels: [],
  selectedChannels: [],
}

// --- Enabled Channels (computed from settings) ---

export interface EnabledChannels {
  voice: boolean
  sms: boolean
  whatsapp: boolean
  signal: boolean
  reports: boolean
}
