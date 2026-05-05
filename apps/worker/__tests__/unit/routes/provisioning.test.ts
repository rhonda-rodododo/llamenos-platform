import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import type { AppEnv } from '@worker/types'

// Mock auth middleware — provisioning.ts mounts `auth` inline on the payload route.
// In unit tests we pre-populate the context, so the real auth is bypassed.
vi.mock('@worker/middleware/auth', () => ({
  auth: vi.fn(async (_c: unknown, next: () => Promise<void>) => next()),
}))

import provisioningRoutes from '@worker/routes/provisioning'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTestApp(opts: {
  pubkey?: string
  serviceMock?: Record<string, unknown>
  hmacSecret?: string
} = {}) {
  const {
    pubkey = 'a'.repeat(64),
    serviceMock = {},
    // Must be 64 hex chars — hashIP calls hexToBytes() on the secret
    hmacSecret = 'a'.repeat(64),
  } = opts

  const app = new Hono<AppEnv>()

  app.use('*', async (c, next) => {
    c.set('pubkey', pubkey)
    c.set('permissions', ['*'])
    c.set('services', {
      identity: serviceMock.identity || {},
      settings: serviceMock.settings || { checkRateLimit: vi.fn().mockResolvedValue({ limited: false }) },
      audit: { log: vi.fn().mockResolvedValue(undefined) },
    } as unknown as AppEnv['Variables']['services'])
    c.set('allRoles', [])
    c.set('requestId', 'test-req-1')
    c.set('user', {
      pubkey,
      name: 'Test User',
      phone: '+1555000000',
      roles: ['role-super-admin'],
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
    c.env = { HMAC_SECRET: hmacSecret } as unknown as AppEnv['Bindings']
    await next()
  })

  app.route('/provision', provisioningRoutes)

  return { app }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('provisioning routes', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  // -------------------------------------------------------------------------
  // POST /provision/rooms — Create provisioning room (public)
  // -------------------------------------------------------------------------

  describe('POST /provision/rooms', () => {
    it('creates a provisioning room with ephemeral pubkey', async () => {
      const createProvisionRoomSpy = vi.fn().mockResolvedValue({
        roomId: 'room-1',
        token: 'tok-abc',
      })
      const { app } = createTestApp({
        serviceMock: { identity: { createProvisionRoom: createProvisionRoomSpy } },
      })

      const res = await app.request('/provision/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ephemeralPubkey: 'b'.repeat(64) }),
      })

      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.roomId).toBe('room-1')
      expect(json.token).toBe('tok-abc')
      expect(createProvisionRoomSpy).toHaveBeenCalledWith('b'.repeat(64))
    })

    it('rejects missing ephemeralPubkey with 400', async () => {
      const { app } = createTestApp({
        serviceMock: { identity: { createProvisionRoom: vi.fn() } },
      })

      const res = await app.request('/provision/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      expect(res.status).toBe(400)
    })

    it('rejects invalid ephemeralPubkey format with 400', async () => {
      const { app } = createTestApp({
        serviceMock: { identity: { createProvisionRoom: vi.fn() } },
      })

      const res = await app.request('/provision/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ephemeralPubkey: 'not-a-valid-pubkey' }),
      })

      expect(res.status).toBe(400)
    })
  })

  // -------------------------------------------------------------------------
  // GET /provision/rooms/:id — Poll provisioning room (public, rate limited)
  // -------------------------------------------------------------------------

  describe('GET /provision/rooms/:id', () => {
    it('returns room status when token is valid', async () => {
      const getProvisionRoomSpy = vi.fn().mockResolvedValue({
        status: 'waiting',
      })
      const { app } = createTestApp({
        serviceMock: {
          identity: { getProvisionRoom: getProvisionRoomSpy },
          settings: { checkRateLimit: vi.fn().mockResolvedValue({ limited: false }) },
        },
      })

      const res = await app.request('/provision/rooms/room-1?token=tok-abc')
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.status).toBe('waiting')
      expect(getProvisionRoomSpy).toHaveBeenCalledWith('room-1', 'tok-abc')
    })

    it('returns 400 when token query param is missing', async () => {
      const { app } = createTestApp({
        serviceMock: {
          identity: { getProvisionRoom: vi.fn() },
          settings: { checkRateLimit: vi.fn().mockResolvedValue({ limited: false }) },
        },
      })

      // No rate limit hit needed for missing token — check happens before rate limit
      const res = await app.request('/provision/rooms/room-1')
      expect(res.status).toBe(400)
      const json = await res.json()
      expect(json.error).toMatch(/missing token/i)
    })

    it('returns 429 when rate limited', async () => {
      const { app } = createTestApp({
        serviceMock: {
          identity: { getProvisionRoom: vi.fn() },
          settings: { checkRateLimit: vi.fn().mockResolvedValue({ limited: true }) },
        },
      })

      const res = await app.request('/provision/rooms/room-1?token=tok-abc')
      expect(res.status).toBe(429)
      const json = await res.json()
      expect(json.error).toMatch(/rate limited/i)
    })

    it('returns ready status with encrypted nsec when payload is delivered', async () => {
      const getProvisionRoomSpy = vi.fn().mockResolvedValue({
        status: 'ready',
        encryptedNsec: 'base64encodednsec',
        primaryPubkey: 'c'.repeat(64),
      })
      const { app } = createTestApp({
        serviceMock: {
          identity: { getProvisionRoom: getProvisionRoomSpy },
          settings: { checkRateLimit: vi.fn().mockResolvedValue({ limited: false }) },
        },
      })

      const res = await app.request('/provision/rooms/room-1?token=tok-abc')
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.status).toBe('ready')
      expect(json.encryptedNsec).toBe('base64encodednsec')
      expect(json.primaryPubkey).toBe('c'.repeat(64))
    })
  })

  // -------------------------------------------------------------------------
  // POST /provision/rooms/:id/payload — Send encrypted payload (authenticated)
  // -------------------------------------------------------------------------

  describe('POST /provision/rooms/:id/payload', () => {
    it('delivers encrypted nsec to room', async () => {
      const setProvisionPayloadSpy = vi.fn().mockResolvedValue(undefined)
      const { app } = createTestApp({
        pubkey: 'a'.repeat(64),
        serviceMock: {
          identity: { setProvisionPayload: setProvisionPayloadSpy },
          settings: { checkRateLimit: vi.fn().mockResolvedValue({ limited: false }) },
        },
      })

      const res = await app.request('/provision/rooms/room-1/payload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: 'tok-abc',
          encryptedNsec: 'base64nsec',
          primaryPubkey: 'b'.repeat(64),
        }),
      })

      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.ok).toBe(true)
      expect(setProvisionPayloadSpy).toHaveBeenCalledWith('room-1', {
        token: 'tok-abc',
        encryptedNsec: 'base64nsec',
        primaryPubkey: 'b'.repeat(64),
        senderPubkey: 'a'.repeat(64),
      })
    })

    it('rejects missing required fields with 400', async () => {
      const { app } = createTestApp({
        serviceMock: {
          identity: { setProvisionPayload: vi.fn() },
          settings: { checkRateLimit: vi.fn().mockResolvedValue({ limited: false }) },
        },
      })

      const res = await app.request('/provision/rooms/room-1/payload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      expect(res.status).toBe(400)
    })
  })
})
