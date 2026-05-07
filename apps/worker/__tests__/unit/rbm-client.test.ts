import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { RBMClient } from '@worker/messaging/rcs/rbm-client'
import type { GoogleServiceAccountKey } from '@worker/messaging/rcs/types'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const fakeServiceAccount: GoogleServiceAccountKey = {
  type: 'service_account',
  project_id: 'test-project',
  private_key_id: 'key-123',
  // Use a minimal PEM-encoded RSA key for testing (sign will be mocked)
  private_key: '-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAAS=\n-----END PRIVATE KEY-----',
  client_email: 'test@test-project.iam.gserviceaccount.com',
  client_id: '12345',
  auth_uri: 'https://accounts.google.com/o/oauth2/auth',
  token_uri: 'https://oauth2.googleapis.com/token',
  auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
  client_x509_cert_url: 'https://www.googleapis.com/robot/v1/metadata/x509/test',
}

describe('RBMClient', () => {
  let client: RBMClient

  beforeEach(() => {
    mockFetch.mockReset()
    client = new RBMClient('agent-001', fakeServiceAccount)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('sendMessage', () => {
    it('strips + prefix from phone number for RBM API path', async () => {
      // Mock token exchange
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'tok-abc', expires_in: 3600 }),
      })
      // Mock send
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ name: 'phones/1234/agentMessages/uuid' }),
      })

      // The createJWT will fail because the test key is invalid, but let's test the flow
      // by mocking at a higher level - mock the crypto.subtle.importKey to make JWT creation work
      const originalImportKey = crypto.subtle.importKey
      const originalSign = crypto.subtle.sign

      vi.spyOn(crypto.subtle, 'importKey').mockResolvedValue({} as CryptoKey)
      vi.spyOn(crypto.subtle, 'sign').mockResolvedValue(new ArrayBuffer(32))

      await client.sendMessage('+15551234567', { text: 'Hello RCS' })

      // The send message call (second fetch) should have the phone without +
      const sendUrl = mockFetch.mock.calls[1]?.[0] as string
      expect(sendUrl).toContain('/phones/15551234567/agentMessages')
      expect(sendUrl).toContain('agentId=agent-001')
      expect(sendUrl).not.toContain('/phones/+')

      crypto.subtle.importKey = originalImportKey
      crypto.subtle.sign = originalSign
    })

    it('caches OAuth tokens until expiry', async () => {
      vi.spyOn(crypto.subtle, 'importKey').mockResolvedValue({} as CryptoKey)
      vi.spyOn(crypto.subtle, 'sign').mockResolvedValue(new ArrayBuffer(32))

      // First token exchange
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'tok-1', expires_in: 3600 }),
      })
      // First send
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ name: 'msg1' }),
      })
      // Second send (should reuse token — no second token call)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ name: 'msg2' }),
      })

      await client.sendMessage('1234', { text: 'msg1' })
      await client.sendMessage('1234', { text: 'msg2' })

      // 3 fetch calls total: 1 token + 2 sends (not 2 tokens + 2 sends)
      expect(mockFetch).toHaveBeenCalledTimes(3)

      vi.restoreAllMocks()
    })
  })

  describe('checkCapabilities', () => {
    it('returns supported:false on non-ok response', async () => {
      vi.spyOn(crypto.subtle, 'importKey').mockResolvedValue({} as CryptoKey)
      vi.spyOn(crypto.subtle, 'sign').mockResolvedValue(new ArrayBuffer(32))

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'tok', expires_in: 3600 }),
      })
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 })

      const result = await client.checkCapabilities('+1234')
      expect(result).toEqual({ supported: false })

      vi.restoreAllMocks()
    })

    it('returns supported:false on network error', async () => {
      vi.spyOn(crypto.subtle, 'importKey').mockResolvedValue({} as CryptoKey)
      vi.spyOn(crypto.subtle, 'sign').mockResolvedValue(new ArrayBuffer(32))

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'tok', expires_in: 3600 }),
      })
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const result = await client.checkCapabilities('+5678')
      expect(result).toEqual({ supported: false })

      vi.restoreAllMocks()
    })
  })

  describe('checkStatus', () => {
    it('returns connected:true when API responds (not 401/403)', async () => {
      vi.spyOn(crypto.subtle, 'importKey').mockResolvedValue({} as CryptoKey)
      vi.spyOn(crypto.subtle, 'sign').mockResolvedValue(new ArrayBuffer(32))

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'tok', expires_in: 3600 }),
      })
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 })

      const result = await client.checkStatus()
      expect(result.connected).toBe(true)
      expect(result.details?.agentId).toBe('agent-001')

      vi.restoreAllMocks()
    })

    it('returns connected:false on 401', async () => {
      vi.spyOn(crypto.subtle, 'importKey').mockResolvedValue({} as CryptoKey)
      vi.spyOn(crypto.subtle, 'sign').mockResolvedValue(new ArrayBuffer(32))

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'tok', expires_in: 3600 }),
      })
      mockFetch.mockResolvedValueOnce({ ok: false, status: 401 })

      const result = await client.checkStatus()
      expect(result.connected).toBe(false)

      vi.restoreAllMocks()
    })

    it('returns connected:false on fetch error', async () => {
      vi.spyOn(crypto.subtle, 'importKey').mockResolvedValue({} as CryptoKey)
      vi.spyOn(crypto.subtle, 'sign').mockResolvedValue(new ArrayBuffer(32))

      mockFetch.mockRejectedValueOnce(new Error('Connection refused'))

      const result = await client.checkStatus()
      expect(result.connected).toBe(false)
      expect(result.error).toContain('Connection refused')

      vi.restoreAllMocks()
    })
  })
})
