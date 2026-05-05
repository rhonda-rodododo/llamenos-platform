import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import type { AppEnv } from '@worker/types'
import auditRoutes from '@worker/routes/audit'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTestApp(opts: {
  permissions?: string[]
  hubId?: string
  pubkey?: string
  serviceMock?: Record<string, unknown>
} = {}) {
  const {
    permissions = ['*'],
    hubId,
    pubkey = 'a'.repeat(64),
    serviceMock = {},
  } = opts

  const app = new Hono<AppEnv>()

  app.use('*', async (c, next) => {
    c.set('pubkey', pubkey)
    c.set('permissions', permissions)
    c.set('services', {
      audit: serviceMock.audit || {},
    } as unknown as AppEnv['Variables']['services'])
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
    await next()
  })

  app.route('/audit', auditRoutes)

  return { app }
}

const makeEntry = (overrides = {}) => ({
  id: 'entry-1',
  action: 'userCreated',
  actorPubkey: 'a'.repeat(64),
  details: {},
  createdAt: new Date().toISOString(),
  previousEntryHash: null,
  entryHash: 'abc123',
  ...overrides,
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('audit routes', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  // -------------------------------------------------------------------------
  // GET /audit — List audit entries
  // -------------------------------------------------------------------------

  describe('GET /audit', () => {
    it('returns audit entries for super admin', async () => {
      const listSpy = vi.fn().mockResolvedValue({
        entries: [makeEntry(), makeEntry({ id: 'entry-2', action: 'hubCreated' })],
        total: 2,
        page: 1,
        limit: 50,
      })
      const { app } = createTestApp({
        permissions: ['*'],
        serviceMock: { audit: { list: listSpy } },
      })

      const res = await app.request('/audit')
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.entries).toHaveLength(2)
      expect(json.entries[0].action).toBe('userCreated')
    })

    it('requires audit:read permission', async () => {
      const { app } = createTestApp({
        permissions: ['other:read'],
        serviceMock: { audit: { list: vi.fn() } },
      })

      const res = await app.request('/audit')
      expect(res.status).toBe(403)
    })

    it('passes hubId from context to audit service', async () => {
      const listSpy = vi.fn().mockResolvedValue({
        entries: [],
        total: 0,
        page: 1,
        limit: 50,
      })
      const { app } = createTestApp({
        permissions: ['audit:read'],
        hubId: 'hub-42',
        serviceMock: { audit: { list: listSpy } },
      })

      const res = await app.request('/audit')
      expect(res.status).toBe(200)
      // First positional arg is hubId (hubScoped: true)
      expect(listSpy).toHaveBeenCalledWith('hub-42', expect.anything())
    })

    it('passes empty string when no hubId in context', async () => {
      const listSpy = vi.fn().mockResolvedValue({
        entries: [],
        total: 0,
        page: 1,
        limit: 50,
      })
      const { app } = createTestApp({
        permissions: ['audit:read'],
        serviceMock: { audit: { list: listSpy } },
      })

      const res = await app.request('/audit')
      expect(res.status).toBe(200)
      expect(listSpy).toHaveBeenCalledWith('', expect.anything())
    })

    it('forwards actorPubkey filter query param', async () => {
      const listSpy = vi.fn().mockResolvedValue({
        entries: [],
        total: 0,
        page: 1,
        limit: 50,
      })
      const { app } = createTestApp({
        permissions: ['audit:read'],
        hubId: 'hub-1',
        serviceMock: { audit: { list: listSpy } },
      })

      const actor = 'b'.repeat(64)
      const res = await app.request(`/audit?actorPubkey=${actor}`)
      expect(res.status).toBe(200)
      expect(listSpy).toHaveBeenCalledWith(
        'hub-1',
        expect.objectContaining({ actorPubkey: actor }),
      )
    })

    it('forwards eventType filter query param', async () => {
      const listSpy = vi.fn().mockResolvedValue({
        entries: [],
        total: 0,
        page: 1,
        limit: 50,
      })
      const { app } = createTestApp({
        permissions: ['audit:read'],
        hubId: 'hub-1',
        serviceMock: { audit: { list: listSpy } },
      })

      const res = await app.request('/audit?eventType=userCreated')
      expect(res.status).toBe(200)
      expect(listSpy).toHaveBeenCalledWith(
        'hub-1',
        expect.objectContaining({ eventType: 'userCreated' }),
      )
    })

    it('forwards dateFrom and dateTo filters', async () => {
      const listSpy = vi.fn().mockResolvedValue({
        entries: [],
        total: 0,
        page: 1,
        limit: 50,
      })
      const { app } = createTestApp({
        permissions: ['audit:read'],
        hubId: 'hub-1',
        serviceMock: { audit: { list: listSpy } },
      })

      const res = await app.request('/audit?dateFrom=2024-01-01&dateTo=2024-01-31')
      expect(res.status).toBe(200)
      expect(listSpy).toHaveBeenCalledWith(
        'hub-1',
        expect.objectContaining({ dateFrom: '2024-01-01', dateTo: '2024-01-31' }),
      )
    })

    it('returns hash chain fields for verifying log integrity', async () => {
      const listSpy = vi.fn().mockResolvedValue({
        entries: [
          makeEntry({
            id: 'entry-1',
            previousEntryHash: null,
            entryHash: 'hash1',
          }),
          makeEntry({
            id: 'entry-2',
            previousEntryHash: 'hash1',
            entryHash: 'hash2',
          }),
        ],
        total: 2,
        page: 1,
        limit: 50,
      })
      const { app } = createTestApp({
        permissions: ['*'],
        serviceMock: { audit: { list: listSpy } },
      })

      const res = await app.request('/audit')
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.entries[0].entryHash).toBe('hash1')
      expect(json.entries[1].previousEntryHash).toBe('hash1')
      expect(json.entries[1].entryHash).toBe('hash2')
    })
  })

  // -------------------------------------------------------------------------
  // GET, DELETE disabled — verify 404 / not registered
  // -------------------------------------------------------------------------

  describe('disabled methods', () => {
    it('GET /audit/:id returns 404 — single-item get is disabled', async () => {
      const listSpy = vi.fn().mockResolvedValue({ entries: [], total: 0, page: 1, limit: 50 })
      const { app } = createTestApp({
        permissions: ['*'],
        serviceMock: { audit: { list: listSpy } },
      })

      const res = await app.request('/audit/some-entry-id')
      // disableGet: true means no GET /:id route is registered
      expect(res.status).toBe(404)
    })

    it('DELETE /audit/:id returns 404 — delete is disabled', async () => {
      const { app } = createTestApp({ permissions: ['*'] })

      const res = await app.request('/audit/some-entry-id', { method: 'DELETE' })
      expect(res.status).toBe(404)
    })
  })
})
