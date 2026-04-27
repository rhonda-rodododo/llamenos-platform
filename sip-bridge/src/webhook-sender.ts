import { timingSafeEqual, createHmac } from 'node:crypto'
import type { BridgeCommand, BridgeConfig, WebhookPayload } from './types'

/**
 * WebhookSender — sends HMAC-SHA256 signed JSON webhooks to the Worker.
 *
 * JSON-only mode: no TwiML parsing. The Worker responds with JSON commands
 * that the CommandHandler executes via BridgeClient.
 */
export class WebhookSender {
  private readonly config: BridgeConfig

  constructor(config: BridgeConfig) {
    this.config = config
  }

  /**
   * Send a webhook to the Worker and parse the JSON response as commands.
   * Returns null if the request fails or the response is not OK.
   */
  async sendWebhookForCommands(
    path: string,
    payload: WebhookPayload,
    queryParams?: Record<string, string>
  ): Promise<BridgeCommand[] | null> {
    const response = await this.sendWebhook(path, payload, queryParams)
    if (!response.ok) return null

    try {
      const body = (await response.json()) as BridgeCommand[] | { commands: BridgeCommand[] }
      // Accept both a raw array and a { commands: [...] } wrapper
      if (Array.isArray(body)) return body
      if (Array.isArray(body.commands)) return body.commands
      return null
    } catch {
      // Non-JSON response or empty body
      return null
    }
  }

  /**
   * Send a signed JSON webhook to the Worker.
   * Returns the raw Response for callers that need status/headers.
   */
  async sendWebhook(
    path: string,
    payload: WebhookPayload,
    queryParams?: Record<string, string>
  ): Promise<Response> {
    // Build the URL
    let url = `${this.config.workerWebhookUrl}${path}`
    if (queryParams && Object.keys(queryParams).length > 0) {
      const params = new URLSearchParams(queryParams)
      url += `?${params}`
    }

    const body = JSON.stringify(payload)

    // Sign the request with HMAC-SHA256
    const timestamp = Date.now().toString()
    const signature = this.sign(url, body, timestamp)

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Bridge-Signature': signature,
      'X-Bridge-Timestamp': timestamp,
    }

    console.log(`[webhook] POST ${path} channelId=${payload.channelId}`)

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(30_000),
      })

      if (!response.ok) {
        const text = await response.text()
        console.error(`[webhook] ${path} returned ${response.status}: ${text}`)
      }

      return response
    } catch (err) {
      console.error(`[webhook] Failed to send webhook to ${path}:`, err)
      throw err
    }
  }

  /**
   * Sign a request with HMAC-SHA256.
   * Signature covers: timestamp + URL + JSON body.
   */
  private sign(url: string, body: string, timestamp: string): string {
    const dataString = `${timestamp}.${url}.${body}`
    const hmac = createHmac('sha256', this.config.bridgeSecret)
    hmac.update(dataString)
    return hmac.digest('base64')
  }

  /**
   * Verify an incoming webhook signature from the Worker.
   * Uses node:crypto timingSafeEqual for constant-time comparison.
   */
  verifySignature(url: string, body: string, timestamp: string, signature: string): boolean {
    const expected = this.sign(url, body, timestamp)

    const sigBuf = Buffer.from(signature, 'utf-8')
    const expectedBuf = Buffer.from(expected, 'utf-8')

    if (sigBuf.length !== expectedBuf.length) return false
    return timingSafeEqual(sigBuf, expectedBuf)
  }
}
