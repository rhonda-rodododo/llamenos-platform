import { TwilioAdapter } from './twilio'

/**
 * SignalWire adapter — extends TwilioAdapter since SignalWire is API-compatible.
 * Only the base URLs and authentication differ.
 * SignalWire uses a "space" subdomain: https://{space}.signalwire.com
 */
export class SignalWireAdapter extends TwilioAdapter {
  private space: string

  constructor(projectId: string, apiToken: string, phoneNumber: string, space: string) {
    super(projectId, apiToken, phoneNumber)
    this.space = space
  }

  protected override getApiBaseUrl(): string {
    return `https://${this.space}.signalwire.com/api/laml/2010-04-01/Accounts/${this.accountSid}`
  }

  protected override getRecordingBaseUrl(): string {
    return `https://${this.space}.signalwire.com/api/laml/2010-04-01/Accounts/${this.accountSid}`
  }

  override async validateWebhook(request: Request): Promise<boolean> {
    // SignalWire uses the same X-Twilio-Signature HMAC-SHA1 validation as Twilio
    // but may send X-SignalWire-Signature header instead
    const signature = request.headers.get('X-SignalWire-Signature') || request.headers.get('X-Twilio-Signature')
    if (!signature) return false

    const url = new URL(request.url)
    const body = await request.clone().text()
    const params = new URLSearchParams(body)

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
      ['sign']
    )
    const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(dataString))
    const expected = btoa(String.fromCharCode(...new Uint8Array(sig)))

    if (signature.length !== expected.length) return false
    const aBuf = encoder.encode(signature)
    const bBuf = encoder.encode(expected)
    let result = 0
    for (let i = 0; i < aBuf.length; i++) {
      result |= aBuf[i] ^ bBuf[i]
    }
    return result === 0
  }
}
