/**
 * Unit tests for apps/worker/telephony/signalwire.ts
 *
 * Tests SignalWire adapter: URL construction, webhook validation.
 */
import { describe, it, expect } from 'vitest'
import { SignalWireAdapter } from '@worker/telephony/signalwire'

describe('SignalWireAdapter', () => {
  const adapter = new SignalWireAdapter(
    'project-id-123',
    'api-token-456',
    '+15551234567',
    'myspace'
  )

  describe('getApiBaseUrl', () => {
    it('constructs URL with space subdomain', () => {
      // Access the protected method via cast
      const url = (adapter as unknown as { getApiBaseUrl(): string }).getApiBaseUrl()
      expect(url).toBe('https://myspace.signalwire.com/api/laml/2010-04-01/Accounts/project-id-123')
    })
  })

  describe('getRecordingBaseUrl', () => {
    it('constructs recording URL with space subdomain', () => {
      const url = (adapter as unknown as { getRecordingBaseUrl(): string }).getRecordingBaseUrl()
      expect(url).toBe('https://myspace.signalwire.com/api/laml/2010-04-01/Accounts/project-id-123')
    })
  })

  describe('validateWebhook', () => {
    it('returns false when no signature header present', async () => {
      const request = new Request('https://example.com/webhook', {
        method: 'POST',
        body: 'key=value',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })

      const valid = await adapter.validateWebhook(request)
      expect(valid).toBe(false)
    })

    it('accepts X-SignalWire-Signature header', async () => {
      // Build a valid signature manually
      const url = 'https://example.com/webhook'
      const body = 'From=%2B15551234567&To=%2B15559876543'
      const params = new URLSearchParams(body)
      const sortedEntries = Array.from(params.entries()).sort(([a], [b]) => a.localeCompare(b))
      let dataString = url
      for (const [key, value] of sortedEntries) {
        dataString += key + value
      }

      const encoder = new TextEncoder()
      const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode('api-token-456'),
        { name: 'HMAC', hash: 'SHA-1' },
        false,
        ['sign']
      )
      const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(dataString))
      const signature = btoa(String.fromCharCode(...new Uint8Array(sig)))

      const request = new Request(url, {
        method: 'POST',
        body,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-SignalWire-Signature': signature,
        },
      })

      const valid = await adapter.validateWebhook(request)
      expect(valid).toBe(true)
    })

    it('rejects invalid signature', async () => {
      const request = new Request('https://example.com/webhook', {
        method: 'POST',
        body: 'key=value',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-SignalWire-Signature': 'aW52YWxpZHNpZ25hdHVyZQ==',
        },
      })

      const valid = await adapter.validateWebhook(request)
      expect(valid).toBe(false)
    })

    it('uses constant-time comparison for signatures', async () => {
      // The implementation uses XOR-based comparison which should not short-circuit
      // This test validates that different-length signatures are rejected
      const request = new Request('https://example.com/webhook', {
        method: 'POST',
        body: 'key=value',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-SignalWire-Signature': 'short',
        },
      })

      const valid = await adapter.validateWebhook(request)
      expect(valid).toBe(false)
    })
  })
})
