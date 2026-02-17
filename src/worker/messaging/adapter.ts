import type { MessagingChannelType } from '../../shared/types'

/**
 * MessagingAdapter — abstract interface for messaging channel providers.
 * Each channel (SMS, WhatsApp, Signal) implements this interface.
 * Deliberately simpler than TelephonyAdapter (no IVR, queues, DTMF).
 */
export interface MessagingAdapter {
  readonly channelType: MessagingChannelType

  // Inbound: parse provider-specific webhook into normalized message
  parseIncomingMessage(request: Request): Promise<IncomingMessage>

  // Validate webhook signature (each provider has its own scheme)
  validateWebhook(request: Request): Promise<boolean>

  // Outbound: send a text message
  sendMessage(params: SendMessageParams): Promise<SendResult>

  // Outbound: send a message with media attachment
  sendMediaMessage(params: SendMediaParams): Promise<SendResult>

  // Check if the channel is properly configured and reachable
  getChannelStatus(): Promise<ChannelStatus>
}

export interface IncomingMessage {
  channelType: MessagingChannelType
  externalId: string              // provider's message ID
  senderIdentifier: string        // phone number, WhatsApp ID, Signal UUID
  senderIdentifierHash: string    // hashed for storage
  body?: string                   // text content (plaintext from transport)
  mediaUrls?: string[]            // attachment URLs from provider
  mediaTypes?: string[]           // MIME types of attachments
  timestamp: string
  metadata?: Record<string, string>
}

export interface SendMessageParams {
  recipientIdentifier: string
  body: string
  conversationId: string
}

export interface SendMediaParams extends SendMessageParams {
  mediaUrl: string
  mediaType: string
}

export interface SendResult {
  success: boolean
  externalId?: string
  error?: string
}

export interface ChannelStatus {
  connected: boolean
  details?: Record<string, unknown>
  error?: string
}
