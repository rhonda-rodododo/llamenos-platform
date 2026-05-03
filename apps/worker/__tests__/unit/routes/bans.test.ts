import { describe, it, expect, beforeEach, jest } from 'bun:test'
import { Hono } from 'hono'
import type { AppEnv } from '@worker/types'
import banRoutes from '@worker/routes/bans'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTestApp(opts: {
  permissions?: string[]
  hubId?: string
  pubkey?: string
  serviceMock?: Record<string, unknown>
  auditLogSpy?: ReturnType<typeof jest.fn>
} = {}) {
  const {
    permissions = ['*'],
    hubId,
    pubkey = 'a'.repeat(64),
    serviceMock = {},
    auditLogSpy = jest.fn().mockResolvedValue(undefined),
  } = opts

  const mockAuditService = { log: auditLogSpy }

  const services: Record<string, unknown> = {
    records: serviceMock.records || {},
    audit: mockAuditService,
  }

  const app = new Hono<AppEnv>()

  app.use('*', async (c, next) => {
    c.set('pubkey', pubkey)
    c.set('permissions', permissions)
    c.set('services', services as unknown as AppEnv['Variables']['services'])
    c.set('allRoles', [])
    c.set('requestId', 'test-req-1')
    c.set('user', {
      pubkey,
      name: 'Test User',
      phone: '+1555000000',
      roles: permissions.includes('*') ? ['role-super-admin'] : ['role-volunteer'],
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
    if (hubId !== undefined) {
      c.set('hubId', hubId)
    }
    c.env = {
      HMAC_SECRET: 'a'.repeat(64),
    } as unknown as AppEnv['Bindings']
    await next()
  })

  app.route('/bans', banRoutes)

  return { app, auditLogSpy }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('bans routes', () => {
  beforeEach(() => {
    jest.restoreAllMocks()
  })

  // -------------------------------------------------------------------------
  // GET /bans — List (via entity-router)
  // -------------------------------------------------------------------------

  describe('GET /bans', () => {
    it('lists bans', async () => {
      const listBansSpy = jest.fn().mockResolvedValue({
        bans: [{ phone: '+12125551234', reason: 'Spam', bannedBy: 'admin', bannedAt: new Date().toISOString() }],
      })
      const { app } = createTestApp({
        permissions: ['bans:read'],
        hubId: 'hub-1',
        serviceMock: { records: { listBans: listBansSpy } },
      })

      const res = await app.request('/bans')
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.bans).toHaveLength(1)
      expect(listBansSpy).toHaveBeenCalledWith('hub-1')
    })

    it('requires bans:read permission', async () => {
      const { app } = createTestApp({ permissions: ['other:read'] })
      const res = await app.request('/bans')
      expect(res.status).toBe(403)
    })
  })

  // -------------------------------------------------------------------------
  // POST /bans — Ban a number
  // -------------------------------------------------------------------------

  describe('POST /bans', () => {
    it('bans a valid phone number', async () => {
      const addBanSpy = jest.fn().mockResolvedValue({
        phone: '+12125551234',
        reason: 'Spam',
        bannedBy: 'a'.repeat(64),
        bannedAt: new Date().toISOString(),
      })
      const { app, auditLogSpy } = createTestApp({
        permissions: ['bans:create'],
        hubId: 'hub-1',
        serviceMock: { records: { addBan: addBanSpy } },
      })

      const res = await app.request('/bans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: '+12125551234', reason: 'Spam' }),
      })

      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.ban.phone).toBe('+12125551234')
      expect(addBanSpy).toHaveBeenCalledWith({
        hubId: 'hub-1',
        phone: '+12125551234',
        reason: 'Spam',
        bannedBy: 'a'.repeat(64),
      })
      expect(auditLogSpy).toHaveBeenCalledTimes(1)
    })

    it('rejects invalid phone number', async () => {
      const { app } = createTestApp({
        permissions: ['bans:create'],
        serviceMock: { records: {} },
      })

      const res = await app.request('/bans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: 'invalid', reason: 'Spam' }),
      })

      expect(res.status).toBe(400)
    })

    it('returns 403 without bans:create permission', async () => {
      const { app } = createTestApp({ permissions: ['bans:read'] })
      const res = await app.request('/bans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: '+12125551234' }),
      })
      expect(res.status).toBe(403)
    })
  })

  // -------------------------------------------------------------------------
  // POST /bans/bulk — Bulk ban
  // -------------------------------------------------------------------------

  describe('POST /bans/bulk', () => {
    it('bulk bans valid phone numbers', async () => {
      const bulkAddBansSpy = jest.fn().mockResolvedValue(2)
      const { app, auditLogSpy } = createTestApp({
        permissions: ['bans:bulk-create'],
        hubId: 'hub-1',
        serviceMock: { records: { bulkAddBans: bulkAddBansSpy } },
      })

      const res = await app.request('/bans/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phones: ['+12125551234', '+12125555678'], reason: 'Spam' }),
      })

      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.count).toBe(2)
      expect(bulkAddBansSpy).toHaveBeenCalledWith(['+12125551234', '+12125555678'], 'Spam', 'a'.repeat(64), 'hub-1')
      expect(auditLogSpy).toHaveBeenCalledTimes(1)
    })

    it('rejects when any phone is invalid', async () => {
      const { app } = createTestApp({
        permissions: ['bans:bulk-create'],
        serviceMock: { records: {} },
      })

      const res = await app.request('/bans/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phones: ['+12125551234', 'invalid'], reason: 'Spam' }),
      })

      expect(res.status).toBe(400)
    })

    it('returns 403 without bans:bulk-create permission', async () => {
      const { app } = createTestApp({ permissions: ['bans:read'] })
      const res = await app.request('/bans/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phones: ['+12125551234'], reason: 'Spam' }),
      })
      expect(res.status).toBe(403)
    })
  })

  // -------------------------------------------------------------------------
  // DELETE /bans/:phone — Unban
  // -------------------------------------------------------------------------

  describe('DELETE /bans/:phone', () => {
    it('unbans a phone number', async () => {
      const removeBanSpy = jest.fn().mockResolvedValue(undefined)
      const { app, auditLogSpy } = createTestApp({
        permissions: ['bans:delete'],
        hubId: 'hub-1',
        serviceMock: { records: { removeBan: removeBanSpy } },
      })

      const res = await app.request('/bans/%2B12125551234', { method: 'DELETE' })
      expect(res.status).toBe(200)
      expect(removeBanSpy).toHaveBeenCalledWith('+12125551234', 'hub-1')
      expect(auditLogSpy).toHaveBeenCalledTimes(1)
    })

    it('unbans a phone number with percent-encoded characters correctly', async () => {
      const removeBanSpy = jest.fn().mockResolvedValue(undefined)
      const { app } = createTestApp({
        permissions: ['bans:delete'],
        hubId: 'hub-1',
        serviceMock: { records: { removeBan: removeBanSpy } },
      })

      // %25 is the percent-encoded % — Hono decodes to %, should NOT double-decode
      const res = await app.request('/bans/%252B12125551234', { method: 'DELETE' })
      expect(res.status).toBe(200)
      // The phone passed to removeBan should be "%2B12125551234" (single decoded),
      // NOT "+12125551234" (double decoded)
      expect(removeBanSpy).toHaveBeenCalledWith('%2B12125551234', 'hub-1')
    })

    it('returns 403 without bans:delete permission', async () => {
      const { app } = createTestApp({ permissions: ['bans:read'] })
      const res = await app.request('/bans/+12125551234', { method: 'DELETE' })
      expect(res.status).toBe(403)
    })
  })
})
