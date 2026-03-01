import type { TwilioSendMessageResponse } from './types'

const TWILIO_API_BASE = 'https://api.twilio.com/2010-04-01/Accounts'

/**
 * TwilioWhatsAppClient -- sends WhatsApp messages via Twilio's Messaging API.
 *
 * Twilio handles WhatsApp by prefixing phone numbers with "whatsapp:"
 * and routing through the same Messaging API used for SMS.
 */
export class TwilioWhatsAppClient {
  private readonly accountSid: string
  private readonly authToken: string
  private readonly whatsappNumber: string

  constructor(accountSid: string, authToken: string, whatsappNumber: string) {
    this.accountSid = accountSid
    this.authToken = authToken
    this.whatsappNumber = whatsappNumber
  }

  /**
   * Send a plain text message via Twilio WhatsApp.
   */
  async sendTextMessage(
    to: string,
    body: string,
  ): Promise<TwilioSendMessageResponse> {
    const params = new URLSearchParams({
      From: `whatsapp:+${this.whatsappNumber.replace(/^\+/, '')}`,
      To: `whatsapp:+${to.replace(/^\+/, '')}`,
      Body: body,
    })

    return this.postMessage(params)
  }

  /**
   * Send a media message via Twilio WhatsApp.
   * Twilio accepts a MediaUrl parameter alongside the body.
   */
  async sendMediaMessage(
    to: string,
    mediaUrl: string,
    _mediaType: string,
    caption?: string,
  ): Promise<TwilioSendMessageResponse> {
    const params = new URLSearchParams({
      From: `whatsapp:+${this.whatsappNumber.replace(/^\+/, '')}`,
      To: `whatsapp:+${to.replace(/^\+/, '')}`,
      MediaUrl: mediaUrl,
    })
    if (caption) {
      params.set('Body', caption)
    }

    return this.postMessage(params)
  }

  /**
   * Validate an incoming Twilio webhook signature.
   * Uses HMAC-SHA1 of the request URL + sorted form params with the auth token.
   * Identical to the voice webhook validation used by TwilioAdapter.
   */
  async validateSignature(request: Request): Promise<boolean> {
    const signature = request.headers.get('X-Twilio-Signature')
    if (!signature) return false

    const url = new URL(request.url)
    const body = await request.clone().text()
    const params = new URLSearchParams(body)

    // Build the data string: full URL + sorted key/value pairs concatenated
    let dataString = url.toString()
    const sortedKeys = Array.from(params.keys()).sort()
    for (const key of sortedKeys) {
      dataString += key + params.get(key)
    }

    const encoder = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(this.authToken),
      { name: 'HMAC', hash: 'SHA-1' },
      false,
      ['sign'],
    )
    const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(dataString))
    const expected = btoa(String.fromCharCode(...new Uint8Array(sig)))

    // Constant-time comparison to prevent timing attacks
    if (signature.length !== expected.length) return false
    const aBuf = encoder.encode(signature)
    const bBuf = encoder.encode(expected)
    let result = 0
    for (let i = 0; i < aBuf.length; i++) {
      result |= aBuf[i] ^ bBuf[i]
    }
    return result === 0
  }

  /**
   * Check if the Twilio API is reachable with valid credentials.
   */
  async checkHealth(): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch(
        `${TWILIO_API_BASE}/${this.accountSid}.json`,
        {
          headers: {
            Authorization: 'Basic ' + btoa(`${this.accountSid}:${this.authToken}`),
          },
        },
      )
      if (res.ok) {
        return { ok: true }
      }
      const body = await res.text()
      return { ok: false, error: `Twilio API returned ${res.status}: ${body}` }
    } catch (err) {
      return { ok: false, error: `Twilio API unreachable: ${err instanceof Error ? err.message : String(err)}` }
    }
  }

  // --- Private helpers ---

  private async postMessage(
    params: URLSearchParams,
  ): Promise<TwilioSendMessageResponse> {
    const res = await fetch(
      `${TWILIO_API_BASE}/${this.accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + btoa(`${this.accountSid}:${this.authToken}`),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params,
      },
    )

    if (!res.ok) {
      const errorBody = await res.text()
      throw new Error(`Twilio WhatsApp send failed (${res.status}): ${errorBody}`)
    }

    return res.json() as Promise<TwilioSendMessageResponse>
  }
}
