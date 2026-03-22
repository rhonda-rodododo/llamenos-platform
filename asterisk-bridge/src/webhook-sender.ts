import type { BridgeConfig, WebhookPayload, BridgeCommand } from './types'

/**
 * WebhookSender — sends HMAC-SHA256 signed HTTP webhooks to the
 * Cloudflare Worker. Formats payloads as form-urlencoded to match
 * Twilio's format, so the Worker's existing parsing works unchanged.
 *
 * The Worker responds with JSON commands that the bridge translates
 * to ARI REST calls.
 */
export class WebhookSender {
  private config: BridgeConfig

  constructor(config: BridgeConfig) {
    this.config = config
  }

  /**
   * Send a webhook to the CF Worker and parse the response as commands.
   *
   * The Worker's telephony routes respond with TwiML (for Twilio) or
   * JSON commands (for Asterisk). We send form-urlencoded data so the
   * Worker can parse it the same way as Twilio webhooks.
   *
   * Returns the raw Response so the caller can inspect status/headers
   * and parse the body appropriately.
   */
  async sendWebhook(
    path: string,
    payload: WebhookPayload,
    queryParams?: Record<string, string>,
  ): Promise<Response> {
    // Build the URL
    let url = `${this.config.workerWebhookUrl}${path}`
    if (queryParams && Object.keys(queryParams).length > 0) {
      const params = new URLSearchParams(queryParams)
      url += `?${params}`
    }

    // Build form-urlencoded body (matching Twilio format)
    const formData = new URLSearchParams()
    for (const [key, value] of Object.entries(payload)) {
      if (value !== undefined && key !== 'event') {
        formData.set(key, String(value))
      }
    }
    const body = formData.toString()

    // Sign the request with HMAC-SHA256
    const signature = await this.sign(url, body)

    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Asterisk-Signature': signature,
      'X-Asterisk-Bridge-Timestamp': Date.now().toString(),
      // Also set Twilio-style header so the Worker's validation can
      // be extended to check either header
      'X-Twilio-Signature': signature,
    }

    console.log(`[webhook] POST ${path} CallSid=${payload.CallSid}`)

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body,
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
   * Parse a TwiML or JSON response from the Worker into bridge commands.
   *
   * The Worker currently returns TwiML for all providers. For the Asterisk
   * adapter, we'll parse the TwiML into bridge commands. This translation
   * layer means we don't need to modify the Worker at all — it speaks TwiML,
   * and we translate to ARI.
   */
  parseTwimlToCommands(twiml: string, channelId: string): BridgeCommand[] {
    const commands: BridgeCommand[] = []

    // Parse TwiML using regex (intentionally simple — TwiML is well-structured)
    // In production, a proper XML parser would be better, but this avoids
    // adding dependencies.

    // <Reject reason="..."/>
    const rejectMatch = twiml.match(/<Reject\s*(?:reason="([^"]*)")?\s*\/>/)
    if (rejectMatch) {
      commands.push({
        action: 'reject',
        channelId,
        cause: 21, // Call Rejected
      })
      return commands
    }

    // <Hangup/>
    if (/<Hangup\s*\/>/.test(twiml)) {
      // Will be added at the end after other commands
    }

    // <Say language="...">text</Say>
    const sayMatches = twiml.matchAll(/<Say\s+language="([^"]*)">([\s\S]*?)<\/Say>/g)
    for (const match of sayMatches) {
      const language = match[1]
      const text = match[2].trim()
      commands.push({
        action: 'playback',
        channelId,
        media: `sound:custom/tts`, // Asterisk TTS or pre-rendered audio
        text,
        language,
      })
    }

    // <Play>url</Play>
    const playMatches = twiml.matchAll(/<Play>([\s\S]*?)<\/Play>/g)
    for (const match of playMatches) {
      const url = match[1].trim()
      commands.push({
        action: 'playback',
        channelId,
        media: url,
      })
    }

    // <Gather numDigits="..." action="..." method="..." timeout="...">
    const gatherMatch = twiml.match(/<Gather\s+([^>]*)>([\s\S]*?)<\/Gather>/s)
    if (gatherMatch) {
      const attrs = gatherMatch[1]
      const inner = gatherMatch[2]
      const numDigits = parseInt(attrs.match(/numDigits="(\d+)"/)?.[1] ?? '1')
      const timeout = parseInt(attrs.match(/timeout="(\d+)"/)?.[1] ?? '5')
      const action = attrs.match(/action="([^"]*)"/)?.[1] ?? ''

      // Parse the action URL for path and params
      const actionUrl = new URL(action, this.config.workerWebhookUrl)
      const callbackPath = actionUrl.pathname
      const callbackParams: Record<string, string> = {}
      for (const [key, value] of actionUrl.searchParams) {
        callbackParams[key] = value
      }

      // Extract inner <Say> for the gather prompt
      const innerSayMatch = inner.match(/<Say\s+language="([^"]*)">([\s\S]*?)<\/Say>/)
      const text = innerSayMatch ? innerSayMatch[2].trim() : undefined
      const language = innerSayMatch ? innerSayMatch[1] : undefined

      commands.push({
        action: 'gather',
        channelId,
        numDigits,
        timeout,
        text,
        language,
        callbackPath,
        callbackParams,
      })
    }

    // <Enqueue waitUrl="..." action="...">queueName</Enqueue>
    const enqueueMatch = twiml.match(/<Enqueue\s+([^>]*)>([\s\S]*?)<\/Enqueue>/)
    if (enqueueMatch) {
      const attrs = enqueueMatch[1]
      const waitUrl = attrs.match(/waitUrl="([^"]*)"/)?.[1] ?? ''
      const action = attrs.match(/action="([^"]*)"/)?.[1] ?? ''

      const waitUrlParsed = new URL(waitUrl, this.config.workerWebhookUrl)
      const actionUrlParsed = new URL(action, this.config.workerWebhookUrl)

      const waitParams: Record<string, string> = {}
      for (const [key, value] of waitUrlParsed.searchParams) {
        waitParams[key] = value
      }

      const exitParams: Record<string, string> = {}
      for (const [key, value] of actionUrlParsed.searchParams) {
        exitParams[key] = value
      }

      commands.push({
        action: 'queue',
        channelId,
        waitCallbackPath: waitUrlParsed.pathname,
        waitCallbackInterval: 10,
        exitCallbackPath: actionUrlParsed.pathname,
        callbackParams: { ...waitParams, ...exitParams },
      })
    }

    // <Dial record="..." recordingStatusCallback="..."><Queue>name</Queue></Dial>
    const dialMatch = twiml.match(/<Dial\s+([^>]*)>([\s\S]*?)<\/Dial>/)
    if (dialMatch) {
      const attrs = dialMatch[1]
      const inner = dialMatch[2]

      const record = attrs.includes('record="')
      const recordingCallback = attrs.match(/recordingStatusCallback="([^"]*)"/)?.[1]

      const queueMatch = inner.match(/<Queue>([\s\S]*?)<\/Queue>/)
      if (queueMatch) {
        // This means "bridge volunteer to caller via queue"
        // The queue name is the parent call SID
        const parentCallSid = queueMatch[1].trim()

        let recordingCallbackPath: string | undefined
        let recordingCallbackParams: Record<string, string> | undefined

        if (recordingCallback) {
          const cbUrl = new URL(recordingCallback, this.config.workerWebhookUrl)
          recordingCallbackPath = cbUrl.pathname
          recordingCallbackParams = {}
          for (const [key, value] of cbUrl.searchParams) {
            recordingCallbackParams[key] = value
          }
        }

        commands.push({
          action: 'bridge',
          callerChannelId: parentCallSid, // resolved later by command handler
          volunteerChannelId: channelId,
          record,
          recordingCallbackPath,
          recordingCallbackParams,
        })
      }
    }

    // <Record maxLength="..." action="..." recordingStatusCallback="..."/>
    const recordMatch = twiml.match(/<Record\s+([^/]*)\/?>/)
    if (recordMatch) {
      const attrs = recordMatch[1]
      const maxLength = parseInt(attrs.match(/maxLength="(\d+)"/)?.[1] ?? '120')
      const action = attrs.match(/action="([^"]*)"/)?.[1] ?? ''
      const statusCallback = attrs.match(/recordingStatusCallback="([^"]*)"/)?.[1] ?? ''

      const actionUrl = new URL(action, this.config.workerWebhookUrl)
      const statusUrl = new URL(statusCallback, this.config.workerWebhookUrl)

      const callbackParams: Record<string, string> = {}
      for (const [key, value] of statusUrl.searchParams) {
        callbackParams[key] = value
      }

      commands.push({
        action: 'record',
        channelId,
        name: `voicemail-${channelId}-${Date.now()}`,
        maxDuration: maxLength,
        beep: true,
        callbackPath: statusUrl.pathname,
        callbackParams,
      })
    }

    // <Redirect method="POST">path</Redirect>
    const redirectMatch = twiml.match(/<Redirect\s+[^>]*>([\s\S]*?)<\/Redirect>/)
    if (redirectMatch) {
      const redirectPath = redirectMatch[1].trim()
      const redirectUrl = new URL(redirectPath, this.config.workerWebhookUrl)
      const params: Record<string, string> = {}
      for (const [key, value] of redirectUrl.searchParams) {
        params[key] = value
      }
      commands.push({
        action: 'redirect',
        path: redirectUrl.pathname,
        params,
        channelId,
      })
    }

    // <Leave/> inside wait music means "leave the queue" → triggers voicemail
    if (/<Leave\s*\/>/.test(twiml)) {
      // Signal to exit the queue (handled by command handler)
      commands.push({
        action: 'redirect',
        path: '__leave_queue__',
        channelId,
      })
    }

    // Hangup at the end
    if (/<Hangup\s*\/>/.test(twiml) && !rejectMatch) {
      commands.push({
        action: 'hangup',
        channelId,
      })
    }

    return commands
  }

  /**
   * Sign a request with HMAC-SHA256.
   * Signature covers: URL + sorted form body params (same as Twilio's scheme).
   */
  private async sign(url: string, body: string): Promise<string> {
    const params = new URLSearchParams(body)
    let dataString = url
    const sortedKeys = Array.from(params.keys()).sort()
    for (const key of sortedKeys) {
      dataString += key + params.get(key)
    }

    const encoder = new TextEncoder()
    const keyData = encoder.encode(this.config.bridgeSecret)

    // Use Node.js/Bun crypto for HMAC
    const { createHmac } = await import('crypto')
    const hmac = createHmac('sha256', keyData)
    hmac.update(dataString)
    return hmac.digest('base64')
  }

  /**
   * Verify an incoming webhook signature from the Worker.
   * The Worker signs commands sent to the bridge.
   */
  async verifySignature(url: string, body: string, signature: string): Promise<boolean> {
    const expected = await this.sign(url, body)

    // Constant-time comparison
    if (signature.length !== expected.length) return false
    const encoder = new TextEncoder()
    const aBuf = encoder.encode(signature)
    const bBuf = encoder.encode(expected)
    let result = 0
    for (let i = 0; i < aBuf.length; i++) {
      result |= aBuf[i] ^ bBuf[i]
    }
    return result === 0
  }
}
