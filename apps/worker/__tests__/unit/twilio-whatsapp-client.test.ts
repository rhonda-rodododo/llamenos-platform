import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TwilioWhatsAppClient } from '@worker/messaging/whatsapp/twilio-client'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

describe('TwilioWhatsAppClient', () => {
  let client: TwilioWhatsAppClient

  beforeEach(() => {
    mockFetch.mockReset()
    client = new TwilioWhatsAppClient('AC123', 'auth-token-secret', '+15551234567')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('sendTextMessage', () => {
    it('sends with whatsapp: prefix and correct auth', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sid: 'SM123',
          status: 'queued',
          error_code: null,
          error_message: null,
        }),
      })

      const result = await client.sendTextMessage('+19876543210', 'Hello!')

      expect(mockFetch).toHaveBeenCalledOnce()
      const [url, opts] = mockFetch.mock.calls[0]
      expect(url).toBe('https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json')
      expect(opts.method).toBe('POST')
      expect(opts.headers['Content-Type']).toBe('application/x-www-form-urlencoded')
      // Check Basic auth
      const expectedAuth = 'Basic ' + btoa('AC123:auth-token-secret')
      expect(opts.headers.Authorization).toBe(expectedAuth)

      // Check body params
      const params = new URLSearchParams(opts.body.toString())
      expect(params.get('From')).toBe('whatsapp:+15551234567')
      expect(params.get('To')).toBe('whatsapp:+19876543210')
      expect(params.get('Body')).toBe('Hello!')
      expect(result.sid).toBe('SM123')
    })

    it('strips leading + from numbers to avoid double-plus', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sid: 'SM1', status: 'queued', error_code: null, error_message: null }),
      })

      // Client created with +15551234567 — should not produce whatsapp:++15551234567
      await client.sendTextMessage('+19876543210', 'test')

      const params = new URLSearchParams(mockFetch.mock.calls[0][1].body.toString())
      expect(params.get('From')).toBe('whatsapp:+15551234567')
      expect(params.get('To')).toBe('whatsapp:+19876543210')
      // No double + present
      expect(params.get('From')).not.toContain('++')
      expect(params.get('To')).not.toContain('++')
    })

    it('handles number without + prefix', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sid: 'SM2', status: 'queued', error_code: null, error_message: null }),
      })

      await client.sendTextMessage('19876543210', 'test')

      const params = new URLSearchParams(mockFetch.mock.calls[0][1].body.toString())
      expect(params.get('To')).toBe('whatsapp:+19876543210')
    })

    it('throws on API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => '{"code": 21211, "message": "Invalid phone number"}',
      })

      await expect(
        client.sendTextMessage('+1invalid', 'test'),
      ).rejects.toThrow('Twilio WhatsApp send failed (400)')
    })
  })

  describe('sendMediaMessage', () => {
    it('sends media URL and optional caption', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sid: 'MM1', status: 'queued', error_code: null, error_message: null }),
      })

      await client.sendMediaMessage(
        '+1234',
        'https://example.com/photo.jpg',
        'image/jpeg',
        'Check this out!',
      )

      const params = new URLSearchParams(mockFetch.mock.calls[0][1].body.toString())
      expect(params.get('MediaUrl')).toBe('https://example.com/photo.jpg')
      expect(params.get('Body')).toBe('Check this out!')
    })

    it('sends media without caption — no Body param', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sid: 'MM2', status: 'queued', error_code: null, error_message: null }),
      })

      await client.sendMediaMessage('+1234', 'https://example.com/doc.pdf', 'application/pdf')

      const params = new URLSearchParams(mockFetch.mock.calls[0][1].body.toString())
      expect(params.get('MediaUrl')).toBe('https://example.com/doc.pdf')
      // Body should not be set when no caption is provided
      expect(params.has('Body')).toBe(false)
    })
  })

  describe('validateSignature', () => {
    it('rejects request without X-Twilio-Signature', async () => {
      const request = new Request('https://example.com/webhook', {
        method: 'POST',
        body: 'Body=test',
      })

      const result = await client.validateSignature(request)
      expect(result).toBe(false)
    })

    it('validates correct HMAC-SHA1 signature', async () => {
      const url = 'https://example.com/webhook'
      const body = 'Body=Hello&From=whatsapp%3A%2B1234'

      // Build expected data string: URL + sorted key/value pairs
      const params = new URLSearchParams(body)
      let dataString = url
      const sortedKeys = Array.from(params.keys()).sort()
      for (const key of sortedKeys) {
        dataString += key + params.get(key)
      }

      // Compute HMAC-SHA1
      const encoder = new TextEncoder()
      const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode('auth-token-secret'),
        { name: 'HMAC', hash: 'SHA-1' },
        false,
        ['sign'],
      )
      const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(dataString))
      const expected = btoa(String.fromCharCode(...new Uint8Array(sig)))

      const request = new Request(url, {
        method: 'POST',
        body,
        headers: {
          'X-Twilio-Signature': expected,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      })

      const result = await client.validateSignature(request)
      expect(result).toBe(true)
    })

    it('rejects incorrect signature', async () => {
      const request = new Request('https://example.com/webhook', {
        method: 'POST',
        body: 'Body=test',
        headers: {
          'X-Twilio-Signature': 'AAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        },
      })

      const result = await client.validateSignature(request)
      expect(result).toBe(false)
    })
  })

  describe('checkHealth', () => {
    it('returns ok:true on 200', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true })

      const result = await client.checkHealth()
      expect(result).toEqual({ ok: true })

      const [url] = mockFetch.mock.calls[0]
      expect(url).toBe('https://api.twilio.com/2010-04-01/Accounts/AC123.json')
    })

    it('returns error on 401', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      })

      const result = await client.checkHealth()
      expect(result.ok).toBe(false)
      expect(result.error).toContain('Twilio API returned 401')
    })

    it('returns error on network failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'))

      const result = await client.checkHealth()
      expect(result.ok).toBe(false)
      expect(result.error).toContain('Twilio API unreachable')
    })
  })
})
