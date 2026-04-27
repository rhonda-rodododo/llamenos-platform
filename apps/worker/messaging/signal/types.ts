/**
 * Signal-specific types for signal-cli-rest-api webhook payloads and API requests.
 */

export interface SignalWebhookPayload {
  envelope: {
    source: string          // phone number
    sourceUuid?: string     // Signal UUID
    sourceName?: string     // profile name
    sourceDevice?: number
    timestamp: number       // Unix timestamp in milliseconds
    dataMessage?: {
      message?: string
      timestamp: number
      groupInfo?: {
        groupId: string
        type: string
      }
      attachments?: SignalAttachment[]
      reaction?: {
        emoji: string
        targetAuthor: string
        targetTimestamp: number
      }
    }
    receiptMessage?: {
      type: string
      timestamps: number[]
    }
    typingMessage?: {
      action: string
      timestamp: number
    }
  }
}

export interface SignalAttachment {
  contentType: string
  filename?: string
  id: string
  size: number
  width?: number
  height?: number
}

export interface SignalSendRequest {
  number: string           // sender (bridge registered number)
  recipients: string[]     // recipient phone numbers
  message?: string
  base64_attachments?: string[]
}

export interface SignalSendResponse {
  timestamp: number
}

export interface SignalAboutResponse {
  versions: {
    'signal-cli': string
    'signal-cli-rest-api': string
  }
  mode: string
  number?: string
}

// ---------------------------------------------------------------------------
// Registration & provisioning types
// ---------------------------------------------------------------------------

export interface SignalRegisterRequest {
  number: string
  use_voice?: boolean       // true = voice verification call instead of SMS
  captcha?: string          // captcha token if required
}

export interface SignalVerifyRequest {
  number: string
  token: string             // verification code from SMS/voice
}

export interface SignalAccountInfo {
  number: string
  uuid?: string
  registered: boolean
}

// ---------------------------------------------------------------------------
// Identity trust types
// ---------------------------------------------------------------------------

export interface SignalIdentity {
  number: string
  uuid: string
  fingerprint: string       // safety number fingerprint
  trustLevel: 'UNTRUSTED' | 'TRUSTED_UNVERIFIED' | 'TRUSTED_VERIFIED'
  addedDate: number
}

export interface SignalTrustRequest {
  number: string
  verified_safety_number?: string
  trust_all_known_keys?: boolean
}

// ---------------------------------------------------------------------------
// Reaction types
// ---------------------------------------------------------------------------

export interface SignalReaction {
  emoji: string
  targetAuthor: string      // phone number or UUID of the message author
  targetTimestamp: number   // timestamp of the message being reacted to
  isRemove?: boolean        // true if this is a reaction removal
}
