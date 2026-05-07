import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MetaDirectClient } from '@worker/messaging/whatsapp/meta-client'

// Mock global fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

describe('MetaDirectClient', () => {
  let client: MetaDirectClient

  beforeEach(() => {
    mockFetch.mockReset()
    client = new MetaDirectClient(
      'phone-123',
      'biz-456',
      'access-token-abc',
      'app-secret-xyz',
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('sendTextMessage', () => {
    it('sends correct payload to the Graph API', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          messaging_product: 'whatsapp',
          contacts: [{ input: '+1234', wa_id: '1234' }],
          messages: [{ id: 'wamid.123' }],
        }),
      })

      const result = await client.sendTextMessage('+1234567890', 'Hello test')

      expect(mockFetch).toHaveBeenCalledOnce()
      const [url, opts] = mockFetch.mock.calls[0]
      expect(url).toBe('https://graph.facebook.com/v21.0/phone-123/messages')
      expect(opts.method).toBe('POST')
      expect(opts.headers.Authorization).toBe('Bearer access-token-abc')

      const body = JSON.parse(opts.body)
      expect(body.messaging_product).toBe('whatsapp')
      expect(body.to).toBe('+1234567890')
      expect(body.type).toBe('text')
      expect(body.text.body).toBe('Hello test')

      expect(result.messages[0].id).toBe('wamid.123')
    })

    it('throws on non-ok response with error body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => '{"error":{"message":"Invalid phone number"}}',
      })

      await expect(
        client.sendTextMessage('+invalid', 'test'),
      ).rejects.toThrow('Meta send message failed (400)')
    })

    it('handles empty message body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          messaging_product: 'whatsapp',
          contacts: [],
          messages: [{ id: 'wamid.empty' }],
        }),
      })

      await client.sendTextMessage('+1234', '')
      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.text.body).toBe('')
    })
  })

  describe('sendMediaMessage', () => {
    it('sends image with correct meta type', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          messaging_product: 'whatsapp',
          contacts: [],
          messages: [{ id: 'wamid.img' }],
        }),
      })

      await client.sendMediaMessage('+1234', 'https://example.com/img.jpg', 'image/jpeg')

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.type).toBe('image')
      expect(body.image.link).toBe('https://example.com/img.jpg')
    })

    it('sends document for PDF', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          messaging_product: 'whatsapp',
          contacts: [],
          messages: [{ id: 'wamid.doc' }],
        }),
      })

      await client.sendMediaMessage('+1234', 'https://example.com/doc.pdf', 'application/pdf')

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.type).toBe('document')
      expect(body.document.link).toBe('https://example.com/doc.pdf')
    })

    it('sends audio correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          messaging_product: 'whatsapp',
          contacts: [],
          messages: [{ id: 'wamid.audio' }],
        }),
      })

      await client.sendMediaMessage('+1234', 'https://example.com/audio.mp3', 'audio/mpeg')

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.type).toBe('audio')
      expect(body.audio.link).toBe('https://example.com/audio.mp3')
    })

    it('sends video correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          messaging_product: 'whatsapp',
          contacts: [],
          messages: [{ id: 'wamid.vid' }],
        }),
      })

      await client.sendMediaMessage('+1234', 'https://example.com/vid.mp4', 'video/mp4')

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.type).toBe('video')
      expect(body.video.link).toBe('https://example.com/vid.mp4')
    })

    it('throws for unsupported MIME type', async () => {
      await expect(
        client.sendMediaMessage('+1234', 'https://example.com/file.xyz', 'application/octet-stream'),
      ).rejects.toThrow('Unsupported media type for WhatsApp: application/octet-stream')
    })

    it('throws for text MIME type (mapped but not a valid media type)', async () => {
      // MIME_TO_META_TYPE doesn't have text/plain, so this throws as unsupported
      await expect(
        client.sendMediaMessage('+1234', 'https://example.com/file.txt', 'text/plain'),
      ).rejects.toThrow('Unsupported media type for WhatsApp: text/plain')
    })
  })

  describe('sendTemplateMessage', () => {
    it('sends template without components', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          messaging_product: 'whatsapp',
          contacts: [],
          messages: [{ id: 'wamid.tpl' }],
        }),
      })

      await client.sendTemplateMessage('+1234', 'hello_world', 'en_US')

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.type).toBe('template')
      expect(body.template.name).toBe('hello_world')
      expect(body.template.language.code).toBe('en_US')
      expect(body.template.components).toBeUndefined()
    })

    it('sends template with components', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          messaging_product: 'whatsapp',
          contacts: [],
          messages: [{ id: 'wamid.tpl2' }],
        }),
      })

      await client.sendTemplateMessage('+1234', 'order_update', 'en', [
        { type: 'body', parameters: [{ type: 'text', text: 'Order #123' }] },
      ])

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.template.components).toHaveLength(1)
      expect(body.template.components[0].parameters[0].text).toBe('Order #123')
    })
  })

  describe('downloadMedia', () => {
    it('performs two-step download (URL lookup then binary fetch)', async () => {
      // Step 1: URL lookup
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          messaging_product: 'whatsapp',
          url: 'https://lookaside.fbsbx.com/media123',
          mime_type: 'image/jpeg',
          sha256: 'abc',
          file_size: 1024,
          id: 'media-123',
        }),
      })

      // Step 2: Binary download
      const mockBuffer = new ArrayBuffer(8)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => mockBuffer,
      })

      const result = await client.downloadMedia('media-123')

      // First call: GET media URL
      expect(mockFetch.mock.calls[0][0]).toBe('https://graph.facebook.com/v21.0/media-123')
      // Second call: GET binary
      expect(mockFetch.mock.calls[1][0]).toBe('https://lookaside.fbsbx.com/media123')
      expect(mockFetch.mock.calls[1][1].headers.Authorization).toBe('Bearer access-token-abc')

      expect(result.mimeType).toBe('image/jpeg')
      expect(result.data).toBe(mockBuffer)
    })

    it('throws when URL lookup fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => 'Not found',
      })

      await expect(client.downloadMedia('bad-id')).rejects.toThrow(
        'Failed to get media URL for bad-id: 404',
      )
    })

    it('throws when binary download fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          url: 'https://example.com/media',
          mime_type: 'image/png',
        }),
      })
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      })

      await expect(client.downloadMedia('media-id')).rejects.toThrow(
        'Failed to download media media-id: 500',
      )
    })
  })

  describe('validateSignature', () => {
    it('rejects request without signature header', async () => {
      const request = new Request('https://example.com/webhook', {
        method: 'POST',
        body: '{}',
        headers: {},
      })

      const result = await client.validateSignature(request)
      expect(result).toBe(false)
    })

    it('validates correct HMAC-SHA256 signature', async () => {
      const body = '{"test":"payload"}'

      // Compute expected HMAC-SHA256 signature
      const encoder = new TextEncoder()
      const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode('app-secret-xyz'),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
      )
      const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(body))
      const hex = Array.from(new Uint8Array(sig))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')

      const request = new Request('https://example.com/webhook', {
        method: 'POST',
        body,
        headers: {
          'X-Hub-Signature-256': `sha256=${hex}`,
        },
      })

      const result = await client.validateSignature(request)
      expect(result).toBe(true)
    })

    it('rejects incorrect signature', async () => {
      const request = new Request('https://example.com/webhook', {
        method: 'POST',
        body: '{"test":"payload"}',
        headers: {
          'X-Hub-Signature-256': 'sha256=0000000000000000000000000000000000000000000000000000000000000000',
        },
      })

      const result = await client.validateSignature(request)
      expect(result).toBe(false)
    })

    it('rejects signature with wrong length', async () => {
      const request = new Request('https://example.com/webhook', {
        method: 'POST',
        body: '{"test":"payload"}',
        headers: {
          'X-Hub-Signature-256': 'sha256=short',
        },
      })

      const result = await client.validateSignature(request)
      expect(result).toBe(false)
    })

    it('handles signature without sha256= prefix', async () => {
      const body = '{"test":"payload"}'

      const encoder = new TextEncoder()
      const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode('app-secret-xyz'),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
      )
      const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(body))
      const hex = Array.from(new Uint8Array(sig))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')

      const request = new Request('https://example.com/webhook', {
        method: 'POST',
        body,
        headers: {
          // No sha256= prefix — the code handles this case
          'X-Hub-Signature-256': hex,
        },
      })

      const result = await client.validateSignature(request)
      expect(result).toBe(true)
    })
  })

  describe('checkHealth', () => {
    it('returns ok:true on 200', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true })

      const result = await client.checkHealth()
      expect(result).toEqual({ ok: true })
      expect(mockFetch.mock.calls[0][0]).toBe('https://graph.facebook.com/v21.0/phone-123')
    })

    it('returns error details on non-ok response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      })

      const result = await client.checkHealth()
      expect(result.ok).toBe(false)
      expect(result.error).toContain('Meta API returned 401')
    })

    it('returns error on network failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network timeout'))

      const result = await client.checkHealth()
      expect(result.ok).toBe(false)
      expect(result.error).toContain('Meta API unreachable')
      expect(result.error).toContain('Network timeout')
    })
  })
})
