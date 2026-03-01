import type {
  MetaSendTextRequest,
  MetaSendMediaRequest,
  MetaSendTemplateRequest,
  MetaSendResponse,
  MetaMediaUrlResponse,
  MetaTemplateComponent,
} from './types'
import { MIME_TO_META_TYPE } from './types'

const GRAPH_API_BASE = 'https://graph.facebook.com/v21.0'

/**
 * MetaDirectClient -- direct Meta Graph API client for WhatsApp Cloud API.
 *
 * Handles sending messages, downloading media, and validating webhook
 * signatures using the Meta-issued app secret and permanent access token.
 */
export class MetaDirectClient {
  private readonly phoneNumberId: string
  private readonly businessAccountId: string
  private readonly accessToken: string
  private readonly appSecret: string

  constructor(
    phoneNumberId: string,
    businessAccountId: string,
    accessToken: string,
    appSecret: string,
  ) {
    this.phoneNumberId = phoneNumberId
    this.businessAccountId = businessAccountId
    this.accessToken = accessToken
    this.appSecret = appSecret
  }

  /**
   * Send a plain text message.
   */
  async sendTextMessage(to: string, body: string): Promise<MetaSendResponse> {
    const payload: MetaSendTextRequest = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { body },
    }
    return this.postMessage(payload)
  }

  /**
   * Send a media message (image, video, audio, or document).
   * The mediaType should be a MIME type string (e.g., "image/jpeg").
   */
  async sendMediaMessage(
    to: string,
    mediaUrl: string,
    mediaType: string,
  ): Promise<MetaSendResponse> {
    const metaType = MIME_TO_META_TYPE[mediaType]
    if (!metaType || metaType === 'text' || metaType === 'location' || metaType === 'contacts' || metaType === 'reaction' || metaType === 'interactive') {
      throw new Error(`Unsupported media type for WhatsApp: ${mediaType}`)
    }

    let payload: MetaSendMediaRequest
    switch (metaType) {
      case 'image':
        payload = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          type: 'image',
          image: { link: mediaUrl },
        }
        break
      case 'video':
        payload = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          type: 'video',
          video: { link: mediaUrl },
        }
        break
      case 'audio':
        payload = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          type: 'audio',
          audio: { link: mediaUrl },
        }
        break
      case 'document':
        payload = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          type: 'document',
          document: { link: mediaUrl },
        }
        break
      default: {
        // Exhaustiveness check
        const _exhaustive: never = metaType
        throw new Error(`Unhandled media type: ${_exhaustive}`)
      }
    }

    return this.postMessage(payload)
  }

  /**
   * Send a template message.
   * Required when replying outside the 24-hour conversation window.
   */
  async sendTemplateMessage(
    to: string,
    templateName: string,
    languageCode: string,
    components?: MetaTemplateComponent[],
  ): Promise<MetaSendResponse> {
    const payload: MetaSendTemplateRequest = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        ...(components ? { components } : {}),
      },
    }
    return this.postMessage(payload)
  }

  /**
   * Download media by ID.
   * Two-step process: first get the URL from Meta, then download the binary.
   */
  async downloadMedia(mediaId: string): Promise<{ data: ArrayBuffer; mimeType: string }> {
    // Step 1: Get the media URL
    const urlRes = await fetch(`${GRAPH_API_BASE}/${mediaId}`, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    })

    if (!urlRes.ok) {
      const errorText = await urlRes.text()
      throw new Error(`Failed to get media URL for ${mediaId}: ${urlRes.status} ${errorText}`)
    }

    const mediaInfo = await urlRes.json() as MetaMediaUrlResponse

    // Step 2: Download the actual media binary
    const mediaRes = await fetch(mediaInfo.url, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    })

    if (!mediaRes.ok) {
      throw new Error(`Failed to download media ${mediaId}: ${mediaRes.status}`)
    }

    return {
      data: await mediaRes.arrayBuffer(),
      mimeType: mediaInfo.mime_type,
    }
  }

  /**
   * Validate an incoming webhook request from Meta.
   * Uses HMAC-SHA256 of the raw request body with the app secret,
   * compared against the X-Hub-Signature-256 header.
   */
  async validateSignature(request: Request): Promise<boolean> {
    const signatureHeader = request.headers.get('X-Hub-Signature-256')
    if (!signatureHeader) return false

    // Header format: "sha256=<hex>"
    const expectedHex = signatureHeader.startsWith('sha256=')
      ? signatureHeader.slice(7)
      : signatureHeader

    const rawBody = await request.clone().arrayBuffer()

    const encoder = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(this.appSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )

    const signature = await crypto.subtle.sign('HMAC', key, rawBody)
    const computedHex = Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')

    // Constant-time comparison to prevent timing attacks
    if (computedHex.length !== expectedHex.length) return false
    const aBuf = encoder.encode(computedHex)
    const bBuf = encoder.encode(expectedHex)
    let result = 0
    for (let i = 0; i < aBuf.length; i++) {
      result |= aBuf[i] ^ bBuf[i]
    }
    return result === 0
  }

  /**
   * Check if the Meta Graph API is reachable with valid credentials.
   */
  async checkHealth(): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch(
        `${GRAPH_API_BASE}/${this.phoneNumberId}`,
        { headers: { Authorization: `Bearer ${this.accessToken}` } },
      )
      if (res.ok) {
        return { ok: true }
      }
      const body = await res.text()
      return { ok: false, error: `Meta API returned ${res.status}: ${body}` }
    } catch (err) {
      return { ok: false, error: `Meta API unreachable: ${err instanceof Error ? err.message : String(err)}` }
    }
  }

  // --- Private helpers ---

  private async postMessage(
    payload: MetaSendTextRequest | MetaSendMediaRequest | MetaSendTemplateRequest,
  ): Promise<MetaSendResponse> {
    const res = await fetch(
      `${GRAPH_API_BASE}/${this.phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      },
    )

    if (!res.ok) {
      const errorBody = await res.text()
      throw new Error(`Meta send message failed (${res.status}): ${errorBody}`)
    }

    return res.json() as Promise<MetaSendResponse>
  }
}
