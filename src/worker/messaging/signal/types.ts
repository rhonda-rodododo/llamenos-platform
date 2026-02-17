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
