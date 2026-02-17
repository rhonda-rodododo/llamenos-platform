import type {
  MessagingAdapter,
  IncomingMessage,
  SendMessageParams,
  SendMediaParams,
  SendResult,
  ChannelStatus,
} from '../adapter'
import type { SignalConfig } from '../../../shared/types'
import type {
  SignalWebhookPayload,
  SignalSendRequest,
  SignalSendResponse,
  SignalAboutResponse,
} from './types'
import { hashPhone } from '../../lib/crypto'

/**
 * SignalAdapter — MessagingAdapter implementation for the Signal channel.
 *
 * Communicates with a signal-cli-rest-api bridge instance to send/receive
 * Signal messages. The bridge handles the Signal protocol; this adapter
 * normalizes its HTTP API into the MessagingAdapter interface.
 */
export class SignalAdapter implements MessagingAdapter {
  readonly channelType = 'signal' as const

  private readonly bridgeUrl: string
  private readonly bridgeApiKey: string
  private readonly webhookSecret: string
  private readonly registeredNumber: string

  constructor(config: SignalConfig) {
    // Strip trailing slash from bridge URL for consistent path construction
    this.bridgeUrl = config.bridgeUrl.replace(/\/+$/, '')
    this.bridgeApiKey = config.bridgeApiKey
    this.webhookSecret = config.webhookSecret
    this.registeredNumber = config.registeredNumber
  }

  /**
   * Parse an incoming signal-cli-rest-api webhook into a normalized IncomingMessage.
   */
  async parseIncomingMessage(request: Request): Promise<IncomingMessage> {
    const payload: SignalWebhookPayload = await request.json()
    const { envelope } = payload

    const source = envelope.source
    const sourceUuid = envelope.sourceUuid
    // Use Signal UUID as the sender identifier when available, fall back to phone
    const senderIdentifier = sourceUuid ?? source

    const dataMessage = envelope.dataMessage
    const body = dataMessage?.message ?? undefined

    // Extract attachment URLs and MIME types
    const attachments = dataMessage?.attachments
    const mediaUrls: string[] = []
    const mediaTypes: string[] = []
    if (attachments && attachments.length > 0) {
      for (const att of attachments) {
        // signal-cli-rest-api serves attachments at /v1/attachments/{id}
        mediaUrls.push(`${this.bridgeUrl}/v1/attachments/${att.id}`)
        mediaTypes.push(att.contentType)
      }
    }

    // Build metadata from available envelope fields
    const metadata: Record<string, string> = {}
    if (source) {
      metadata['source'] = source
    }
    if (sourceUuid) {
      metadata['sourceUuid'] = sourceUuid
    }
    if (envelope.sourceName) {
      metadata['sourceName'] = envelope.sourceName
    }
    if (envelope.sourceDevice !== undefined) {
      metadata['sourceDevice'] = String(envelope.sourceDevice)
    }
    if (dataMessage?.groupInfo) {
      metadata['groupId'] = dataMessage.groupInfo.groupId
    }

    return {
      channelType: 'signal',
      externalId: String(envelope.timestamp),
      senderIdentifier,
      senderIdentifierHash: hashPhone(source),
      body,
      mediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
      mediaTypes: mediaTypes.length > 0 ? mediaTypes : undefined,
      timestamp: new Date(envelope.timestamp).toISOString(),
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    }
  }

  /**
   * Validate the webhook request by checking the Authorization bearer token.
   * Uses constant-time comparison to prevent timing attacks.
   */
  async validateWebhook(request: Request): Promise<boolean> {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader) {
      return false
    }

    const parts = authHeader.split(' ')
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return false
    }

    const token = parts[1]
    return constantTimeEqual(token, this.webhookSecret)
  }

  /**
   * Send a text message via the signal-cli-rest-api bridge.
   */
  async sendMessage(params: SendMessageParams): Promise<SendResult> {
    const sendRequest: SignalSendRequest = {
      number: this.registeredNumber,
      recipients: [params.recipientIdentifier],
      message: params.body,
    }

    try {
      const response = await fetch(`${this.bridgeUrl}/v2/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.bridgeApiKey}`,
        },
        body: JSON.stringify(sendRequest),
      })

      if (!response.ok) {
        const errorText = await response.text()
        return {
          success: false,
          error: `Signal bridge returned ${response.status}: ${errorText}`,
        }
      }

      const result: SignalSendResponse = await response.json()
      return {
        success: true,
        externalId: String(result.timestamp),
      }
    } catch (err) {
      return {
        success: false,
        error: `Signal bridge request failed: ${err instanceof Error ? err.message : String(err)}`,
      }
    }
  }

  /**
   * Send a message with a media attachment via the signal-cli-rest-api bridge.
   * Downloads the media from the provided URL, base64-encodes it, and includes
   * it in the send request as a base64 attachment.
   */
  async sendMediaMessage(params: SendMediaParams): Promise<SendResult> {
    try {
      // Download the media from the provided URL
      const mediaResponse = await fetch(params.mediaUrl)
      if (!mediaResponse.ok) {
        return {
          success: false,
          error: `Failed to download media from ${params.mediaUrl}: ${mediaResponse.status}`,
        }
      }

      const mediaBuffer = await mediaResponse.arrayBuffer()
      const base64Data = uint8ArrayToBase64(new Uint8Array(mediaBuffer))

      // Format: data:{mimeType};base64,{data} as expected by signal-cli-rest-api
      const base64Attachment = `data:${params.mediaType};base64,${base64Data}`

      const sendRequest: SignalSendRequest = {
        number: this.registeredNumber,
        recipients: [params.recipientIdentifier],
        message: params.body,
        base64_attachments: [base64Attachment],
      }

      const response = await fetch(`${this.bridgeUrl}/v2/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.bridgeApiKey}`,
        },
        body: JSON.stringify(sendRequest),
      })

      if (!response.ok) {
        const errorText = await response.text()
        return {
          success: false,
          error: `Signal bridge returned ${response.status}: ${errorText}`,
        }
      }

      const result: SignalSendResponse = await response.json()
      return {
        success: true,
        externalId: String(result.timestamp),
      }
    } catch (err) {
      return {
        success: false,
        error: `Signal media send failed: ${err instanceof Error ? err.message : String(err)}`,
      }
    }
  }

  /**
   * Check the Signal bridge status by querying its /v1/about endpoint.
   */
  async getChannelStatus(): Promise<ChannelStatus> {
    try {
      const response = await fetch(`${this.bridgeUrl}/v1/about`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.bridgeApiKey}`,
        },
      })

      if (!response.ok) {
        return {
          connected: false,
          error: `Signal bridge returned ${response.status}`,
        }
      }

      const about: SignalAboutResponse = await response.json()
      return {
        connected: true,
        details: {
          signalCliVersion: about.versions['signal-cli'],
          apiVersion: about.versions['signal-cli-rest-api'],
          mode: about.mode,
          registeredNumber: about.number ?? this.registeredNumber,
        },
      }
    } catch (err) {
      return {
        connected: false,
        error: `Signal bridge unreachable: ${err instanceof Error ? err.message : String(err)}`,
      }
    }
  }
}

/**
 * Constant-time string comparison to prevent timing attacks on webhook secrets.
 * Both strings are compared byte-by-byte; the total time is always proportional
 * to the length of the expected string regardless of where a mismatch occurs.
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still perform a comparison to avoid leaking length via timing,
    // but we know the result will be false.
    const dummy = b
    let result = a.length ^ b.length
    for (let i = 0; i < dummy.length; i++) {
      result |= (a.charCodeAt(i % a.length) ?? 0) ^ dummy.charCodeAt(i)
    }
    return result === 0
  }

  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}

/**
 * Convert a Uint8Array to a base64 string.
 * Uses btoa which is available in Cloudflare Workers.
 */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}
