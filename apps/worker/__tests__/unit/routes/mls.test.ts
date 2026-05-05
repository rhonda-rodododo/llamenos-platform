import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import type { AppEnv } from '@worker/types'
import mlsRoutes from '@worker/routes/mls'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTestApp(opts: {
  hubId?: string
  pubkey?: string
  serviceMock?: Record<string, unknown>
} = {}) {
  const {
    hubId = 'hub-1',
    pubkey = 'a'.repeat(64),
    serviceMock = {},
  } = opts

  const app = new Hono<AppEnv>()

  app.use('*', async (c, next) => {
    c.set('pubkey', pubkey)
    c.set('permissions', ['*'])
    c.set('services', {
      cryptoKeys: serviceMock.cryptoKeys || {},
    } as unknown as AppEnv['Variables']['services'])
    c.set('allRoles', [])
    c.set('requestId', 'test-req-1')
    c.set('user', {
      pubkey,
      name: 'Test User',
      phone: '+1555000000',
      roles: ['role-volunteer'],
      active: true,
      createdAt: new Date().toISOString(),
      encryptedSecretKey: '',
      transcriptionEnabled: false,
      spokenLanguages: ['en'],
      uiLanguage: 'en',
      profileCompleted: true,
      onBreak: false,
      callPreference: 'phone',
    })
    c.set('hubId', hubId)
    await next()
  })

  // MLS routes are nested under /hubs/:hubId/mls in the main app.
  // In unit tests, the :hubId param is not set by a parent router, so
  // the route uses c.get('hubId') from the context as fallback.
  app.route('/mls', mlsRoutes)

  return { app }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('mls routes', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  // -------------------------------------------------------------------------
  // POST /mls/commit — Fan-out commit to group members
  // -------------------------------------------------------------------------

  describe('POST /mls/commit', () => {
    it('enqueues commit messages for all recipients and returns 204', async () => {
      const enqueueSpy = vi.fn().mockResolvedValue(undefined)
      const { app } = createTestApp({
        hubId: 'hub-1',
        serviceMock: { cryptoKeys: { enqueueMlsMessages: enqueueSpy } },
      })

      const res = await app.request('/mls/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientDeviceIds: ['device-1', 'device-2', 'device-3'],
          payload: 'base64urlencodedcommit',
        }),
      })

      expect(res.status).toBe(204)
      expect(enqueueSpy).toHaveBeenCalledWith(
        'hub-1',
        [
          { recipientDeviceId: 'device-1', messageType: 'commit', payload: 'base64urlencodedcommit' },
          { recipientDeviceId: 'device-2', messageType: 'commit', payload: 'base64urlencodedcommit' },
          { recipientDeviceId: 'device-3', messageType: 'commit', payload: 'base64urlencodedcommit' },
        ],
      )
    })

    it('returns 400 when recipientDeviceIds is empty', async () => {
      const { app } = createTestApp({
        serviceMock: { cryptoKeys: { enqueueMlsMessages: vi.fn() } },
      })

      const res = await app.request('/mls/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientDeviceIds: [],
          payload: 'base64urlencodedcommit',
        }),
      })

      expect(res.status).toBe(400)
    })

    it('returns 400 when payload is empty string', async () => {
      const { app } = createTestApp({
        serviceMock: { cryptoKeys: { enqueueMlsMessages: vi.fn() } },
      })

      const res = await app.request('/mls/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientDeviceIds: ['device-1'],
          payload: '',
        }),
      })

      expect(res.status).toBe(400)
    })

    it('fans commit out to each recipient device individually', async () => {
      const enqueueSpy = vi.fn().mockResolvedValue(undefined)
      const { app } = createTestApp({
        hubId: 'hub-2',
        serviceMock: { cryptoKeys: { enqueueMlsMessages: enqueueSpy } },
      })

      await app.request('/mls/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientDeviceIds: ['d1', 'd2'],
          payload: 'commit-payload',
        }),
      })

      // All recipients get the same payload in one batch call
      const [hubId, messages] = enqueueSpy.mock.calls[0] as [string, { recipientDeviceId: string }[]]
      expect(hubId).toBe('hub-2')
      expect(messages.map(m => m.recipientDeviceId)).toEqual(['d1', 'd2'])
    })
  })

  // -------------------------------------------------------------------------
  // POST /mls/welcome — Deliver Welcome to new member device
  // -------------------------------------------------------------------------

  describe('POST /mls/welcome', () => {
    it('enqueues welcome message for the recipient device and returns 204', async () => {
      const enqueueSpy = vi.fn().mockResolvedValue(undefined)
      const { app } = createTestApp({
        hubId: 'hub-1',
        serviceMock: { cryptoKeys: { enqueueMlsMessages: enqueueSpy } },
      })

      const res = await app.request('/mls/welcome', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientDeviceId: 'new-device-1',
          payload: 'base64urlencodedwelcome',
        }),
      })

      expect(res.status).toBe(204)
      expect(enqueueSpy).toHaveBeenCalledWith(
        'hub-1',
        [{ recipientDeviceId: 'new-device-1', messageType: 'welcome', payload: 'base64urlencodedwelcome' }],
      )
    })

    it('returns 400 when recipientDeviceId is empty', async () => {
      const { app } = createTestApp({
        serviceMock: { cryptoKeys: { enqueueMlsMessages: vi.fn() } },
      })

      const res = await app.request('/mls/welcome', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientDeviceId: '',
          payload: 'base64urlencodedwelcome',
        }),
      })

      expect(res.status).toBe(400)
    })

    it('returns 400 when payload is missing', async () => {
      const { app } = createTestApp({
        serviceMock: { cryptoKeys: { enqueueMlsMessages: vi.fn() } },
      })

      const res = await app.request('/mls/welcome', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientDeviceId: 'new-device-1' }),
      })

      expect(res.status).toBe(400)
    })
  })

  // -------------------------------------------------------------------------
  // GET /mls/messages — Fetch pending messages (fetch-and-clear)
  // -------------------------------------------------------------------------

  describe('GET /mls/messages', () => {
    it('returns pending messages for the caller device', async () => {
      const fetchAndClearSpy = vi.fn().mockResolvedValue([
        { id: 'msg-1', hubId: 'hub-1', recipientDeviceId: 'dev-1', messageType: 'commit', payload: 'payload1', createdAt: new Date().toISOString() },
        { id: 'msg-2', hubId: 'hub-1', recipientDeviceId: 'dev-1', messageType: 'welcome', payload: 'payload2', createdAt: new Date().toISOString() },
      ])
      const { app } = createTestApp({
        hubId: 'hub-1',
        serviceMock: { cryptoKeys: { fetchAndClearMlsMessages: fetchAndClearSpy } },
      })

      const res = await app.request('/mls/messages?deviceId=dev-1')
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.messages).toHaveLength(2)
      expect(json.messages[0].messageType).toBe('commit')
      expect(fetchAndClearSpy).toHaveBeenCalledWith('hub-1', 'dev-1')
    })

    it('returns 400 when deviceId query param is missing', async () => {
      const { app } = createTestApp({
        serviceMock: { cryptoKeys: { fetchAndClearMlsMessages: vi.fn() } },
      })

      const res = await app.request('/mls/messages')
      expect(res.status).toBe(400)
      const json = await res.json()
      expect(json.error).toMatch(/deviceId query parameter is required/i)
    })

    it('returns empty messages array when no pending messages', async () => {
      const fetchAndClearSpy = vi.fn().mockResolvedValue([])
      const { app } = createTestApp({
        serviceMock: { cryptoKeys: { fetchAndClearMlsMessages: fetchAndClearSpy } },
      })

      const res = await app.request('/mls/messages?deviceId=dev-1')
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.messages).toHaveLength(0)
    })
  })

  // -------------------------------------------------------------------------
  // POST /mls/key-packages — Upload KeyPackages for a device
  // -------------------------------------------------------------------------

  describe('POST /mls/key-packages', () => {
    it('uploads key packages for device and returns 204', async () => {
      const uploadSpy = vi.fn().mockResolvedValue(undefined)
      const { app } = createTestApp({
        hubId: 'hub-1',
        serviceMock: { cryptoKeys: { uploadKeyPackage: uploadSpy } },
      })

      const res = await app.request('/mls/key-packages?deviceId=dev-1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyPackages: ['package-1', 'package-2', 'package-3'],
        }),
      })

      expect(res.status).toBe(204)
      // Each key package uploaded individually
      expect(uploadSpy).toHaveBeenCalledTimes(3)
      expect(uploadSpy).toHaveBeenCalledWith('hub-1', 'dev-1', 'package-1')
      expect(uploadSpy).toHaveBeenCalledWith('hub-1', 'dev-1', 'package-2')
      expect(uploadSpy).toHaveBeenCalledWith('hub-1', 'dev-1', 'package-3')
    })

    it('returns 400 when deviceId query param is missing', async () => {
      const { app } = createTestApp({
        serviceMock: { cryptoKeys: { uploadKeyPackage: vi.fn() } },
      })

      const res = await app.request('/mls/key-packages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyPackages: ['pkg-1'] }),
      })

      expect(res.status).toBe(400)
      const json = await res.json()
      expect(json.error).toMatch(/deviceId query parameter is required/i)
    })

    it('returns 400 when keyPackages array is empty', async () => {
      const { app } = createTestApp({
        serviceMock: { cryptoKeys: { uploadKeyPackage: vi.fn() } },
      })

      const res = await app.request('/mls/key-packages?deviceId=dev-1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyPackages: [] }),
      })

      expect(res.status).toBe(400)
    })

    it('returns 400 when a key package is an empty string', async () => {
      const { app } = createTestApp({
        serviceMock: { cryptoKeys: { uploadKeyPackage: vi.fn() } },
      })

      const res = await app.request('/mls/key-packages?deviceId=dev-1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyPackages: [''] }),
      })

      expect(res.status).toBe(400)
    })
  })
})
