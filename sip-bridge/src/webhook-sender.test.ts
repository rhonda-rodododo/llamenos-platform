import { describe, it, expect, mock, beforeEach } from 'bun:test'
import { WebhookSender } from './webhook-sender'
import type { BridgeConfig, WebhookPayload } from './types'

const baseConfig: BridgeConfig = {
  pbxType: 'asterisk',
  ariUrl: '',
  ariRestUrl: '',
  ariUsername: '',
  ariPassword: '',
  eslHost: '',
  eslPort: 8021,
  eslPassword: '',
  kamailioJsonrpcUrl: '',
  workerWebhookUrl: 'http://worker:3000',
  bridgeSecret: 'test-secret-key-for-hmac',
  bridgePort: 3000,
  bridgeHost: '0.0.0.0',
  stasisApp: 'llamenos',
  connectionTimeoutMs: 300000,
}

describe('WebhookSender', () => {
  let sender: WebhookSender

  beforeEach(() => {
    sender = new WebhookSender(baseConfig)
  })

  describe('verifySignature', () => {
    it('verifies a valid signature', async () => {
      // Generate a webhook to get a valid signature
      const payload: WebhookPayload = {
        event: 'incoming',
        channelId: 'ch-1',
        callerNumber: '+15551234567',
        calledNumber: '+15559876543',
      }

      const fetchMock = mock(() =>
        Promise.resolve(new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }))
      )
      const originalFetch = globalThis.fetch
      globalThis.fetch = fetchMock as typeof fetch

      try {
        await sender.sendWebhook('/api/telephony/incoming', payload)

        // Extract the signature and timestamp from the fetch call
        const callArgs = fetchMock.mock.calls[0]
        const requestInit = callArgs[1] as RequestInit
        const headers = requestInit.headers as Record<string, string>
        const signature = headers['X-Bridge-Signature']
        const timestamp = headers['X-Bridge-Timestamp']
        const url = callArgs[0] as string
        const body = requestInit.body as string

        const isValid = sender.verifySignature(url, body, timestamp, signature)
        expect(isValid).toBe(true)
      } finally {
        globalThis.fetch = originalFetch
      }
    })

    it('rejects an invalid signature', () => {
      const isValid = sender.verifySignature(
        'http://worker:3000/api/telephony/incoming',
        '{"event":"incoming"}',
        Date.now().toString(),
        'invalid-signature-here'
      )
      expect(isValid).toBe(false)
    })

    it('rejects mismatched length signatures', () => {
      const isValid = sender.verifySignature(
        'http://worker:3000/api/test',
        'body',
        '123',
        'short'
      )
      expect(isValid).toBe(false)
    })
  })

  describe('sendWebhookForCommands', () => {
    it('returns parsed commands from JSON array response', async () => {
      const commands = [
        { action: 'playback', channelId: 'ch-1', media: 'sound:beep' },
        { action: 'hangup', channelId: 'ch-1' },
      ]

      const fetchMock = mock(() =>
        Promise.resolve(new Response(JSON.stringify(commands), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }))
      )
      const originalFetch = globalThis.fetch
      globalThis.fetch = fetchMock as typeof fetch

      try {
        const result = await sender.sendWebhookForCommands(
          '/api/telephony/incoming',
          { event: 'incoming', channelId: 'ch-1', callerNumber: '+1555' }
        )
        expect(result).toHaveLength(2)
        expect(result![0].action).toBe('playback')
        expect(result![1].action).toBe('hangup')
      } finally {
        globalThis.fetch = originalFetch
      }
    })

    it('returns parsed commands from { commands: [...] } wrapper', async () => {
      const fetchMock = mock(() =>
        Promise.resolve(new Response(JSON.stringify({ commands: [{ action: 'hangup', channelId: 'ch-1' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }))
      )
      const originalFetch = globalThis.fetch
      globalThis.fetch = fetchMock as typeof fetch

      try {
        const result = await sender.sendWebhookForCommands(
          '/api/test',
          { event: 'incoming', channelId: 'ch-1', callerNumber: '+1555' }
        )
        expect(result).toHaveLength(1)
        expect(result![0].action).toBe('hangup')
      } finally {
        globalThis.fetch = originalFetch
      }
    })

    it('returns null for non-OK response', async () => {
      const fetchMock = mock(() =>
        Promise.resolve(new Response('error', { status: 500 }))
      )
      const originalFetch = globalThis.fetch
      globalThis.fetch = fetchMock as typeof fetch

      try {
        const result = await sender.sendWebhookForCommands(
          '/api/test',
          { event: 'incoming', channelId: 'ch-1', callerNumber: '+1555' }
        )
        expect(result).toBeNull()
      } finally {
        globalThis.fetch = originalFetch
      }
    })

    it('appends query params to URL', async () => {
      const fetchMock = mock(() =>
        Promise.resolve(new Response('[]', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }))
      )
      const originalFetch = globalThis.fetch
      globalThis.fetch = fetchMock as typeof fetch

      try {
        await sender.sendWebhookForCommands(
          '/api/test',
          { event: 'incoming', channelId: 'ch-1', callerNumber: '+1555' },
          { parentCallSid: 'parent-1', pubkey: 'abc123' }
        )

        const url = fetchMock.mock.calls[0][0] as string
        expect(url).toContain('parentCallSid=parent-1')
        expect(url).toContain('pubkey=abc123')
      } finally {
        globalThis.fetch = originalFetch
      }
    })
  })

  describe('sendWebhook', () => {
    it('sends JSON content type', async () => {
      const fetchMock = mock(() =>
        Promise.resolve(new Response('ok', { status: 200 }))
      )
      const originalFetch = globalThis.fetch
      globalThis.fetch = fetchMock as typeof fetch

      try {
        await sender.sendWebhook(
          '/api/test',
          { event: 'incoming', channelId: 'ch-1', callerNumber: '+1555' }
        )

        const requestInit = fetchMock.mock.calls[0][1] as RequestInit
        const headers = requestInit.headers as Record<string, string>
        expect(headers['Content-Type']).toBe('application/json')
        expect(headers['X-Bridge-Signature']).toBeTruthy()
        expect(headers['X-Bridge-Timestamp']).toBeTruthy()
      } finally {
        globalThis.fetch = originalFetch
      }
    })
  })
})
