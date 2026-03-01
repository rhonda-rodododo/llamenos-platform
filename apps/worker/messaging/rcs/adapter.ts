/**
 * RCSAdapter — implements MessagingAdapter for Google RCS Business Messaging.
 */

import type { MessagingAdapter, IncomingMessage, SendMessageParams, SendMediaParams, SendResult, ChannelStatus } from '../adapter'
import type { RCSConfig } from '@shared/types'
import type { RBMWebhookPayload, GoogleServiceAccountKey } from './types'
import { RBMClient } from './rbm-client'

export class RCSAdapter implements MessagingAdapter {
  readonly channelType = 'rcs' as const
  private client: RBMClient
  private config: RCSConfig
  private hmacSecret: string

  constructor(config: RCSConfig, hmacSecret: string) {
    this.config = config
    this.hmacSecret = hmacSecret

    const serviceAccountKey = typeof config.serviceAccountKey === 'string'
      ? JSON.parse(config.serviceAccountKey) as GoogleServiceAccountKey
      : config.serviceAccountKey as unknown as GoogleServiceAccountKey

    this.client = new RBMClient(config.agentId, serviceAccountKey)
  }

  async parseIncomingMessage(request: Request): Promise<IncomingMessage> {
    const payload = await request.json() as RBMWebhookPayload

    if (!payload.message) {
      throw new Error('RCS webhook has no message content')
    }

    const senderIdentifier = payload.senderId
    const identifierHash = await hashIdentifier(senderIdentifier, this.hmacSecret)

    const mediaUrls: string[] = []
    const mediaTypes: string[] = []
    if (payload.message.userFile) {
      mediaUrls.push(payload.message.userFile.payload.fileUri)
      mediaTypes.push(payload.message.userFile.payload.mimeType)
    }

    return {
      channelType: 'rcs',
      externalId: payload.message.messageId,
      senderIdentifier,
      senderIdentifierHash: identifierHash,
      body: payload.message.text || payload.message.suggestionResponse?.text,
      mediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
      mediaTypes: mediaTypes.length > 0 ? mediaTypes : undefined,
      timestamp: payload.message.sendTime,
      metadata: {
        agentId: payload.agentId,
        ...(payload.message.suggestionResponse && {
          postbackData: payload.message.suggestionResponse.postbackData,
        }),
      },
    }
  }

  async validateWebhook(request: Request): Promise<boolean> {
    if (!this.config.webhookSecret) return true

    // Google RBM uses a bearer token for webhook validation
    const authHeader = request.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) return false

    const token = authHeader.slice(7)
    return token === this.config.webhookSecret
  }

  async sendMessage(params: SendMessageParams): Promise<SendResult> {
    try {
      const response = await this.client.sendMessage(params.recipientIdentifier, {
        text: params.body,
      })

      if (response.error) {
        return { success: false, error: response.error.message }
      }

      return { success: true, externalId: response.name }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  }

  async sendMediaMessage(params: SendMediaParams): Promise<SendResult> {
    try {
      const response = await this.client.sendMessage(params.recipientIdentifier, {
        text: params.body || undefined,
        contentInfo: {
          fileUrl: params.mediaUrl,
          forceRefresh: true,
        },
      })

      if (response.error) {
        return { success: false, error: response.error.message }
      }

      return { success: true, externalId: response.name }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  }

  async getChannelStatus(): Promise<ChannelStatus> {
    const result = await this.client.checkStatus()
    return {
      connected: result.connected,
      error: result.error,
    }
  }
}

async function hashIdentifier(identifier: string, secret: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(identifier))
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32)
}
