import { describe, it, expect, beforeEach, jest } from 'bun:test'
import { Hono } from 'hono'
import type { AppEnv } from '@worker/types'
import shiftRoutes from '@worker/routes/shifts'

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

  const services: Record<string, unknown> = {
    shifts: serviceMock.shifts || {},
    settings: serviceMock.settings || {},
    audit: serviceMock.audit || { log: jest.fn().mockResolvedValue(undefined) },
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
    await next()
  })

  app.route('/shifts', shiftRoutes)

  return { app }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('shifts routes', () => {
  beforeEach(() => {
    jest.restoreAllMocks()
  })

  // -------------------------------------------------------------------------
  // GET /shifts/my-status — Any authenticated user
  // -------------------------------------------------------------------------

  describe('GET /shifts/my-status', () => {
    it('returns shift status for current user', async () => {
      const getMyStatusSpy = jest.fn().mockResolvedValue({
        onShift: true,
        currentShift: { name: 'Morning', startTime: '09:00', endTime: '12:00' },
        nextShift: null,
      })
      const { app } = createTestApp({
        permissions: ['shifts:read-own'],
        hubId: 'hub-1',
        serviceMock: { shifts: { getMyStatus: getMyStatusSpy } },
      })

      const res = await app.request('/shifts/my-status')
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.onShift).toBe(true)
      expect(getMyStatusSpy).toHaveBeenCalledWith('hub-1', 'a'.repeat(64))
    })

    it('uses empty string hubId when not set', async () => {
      const getMyStatusSpy = jest.fn().mockResolvedValue({
        onShift: false,
        currentShift: null,
        nextShift: null,
      })
      const { app } = createTestApp({
        permissions: ['shifts:read-own'],
        serviceMock: { shifts: { getMyStatus: getMyStatusSpy } },
      })

      const res = await app.request('/shifts/my-status')
      expect(res.status).toBe(200)
      expect(getMyStatusSpy).toHaveBeenCalledWith('', 'a'.repeat(64))
    })
  })

  // -------------------------------------------------------------------------
  // GET /shifts/fallback — Permission-gated
  // -------------------------------------------------------------------------

  describe('GET /shifts/fallback', () => {
    it('returns fallback group config', async () => {
      const getFallbackGroupSpy = jest.fn().mockResolvedValue({
        userPubkeys: ['b'.repeat(64), 'c'.repeat(64)],
      })
      const { app } = createTestApp({
        permissions: ['shifts:manage-fallback'],
        hubId: 'hub-1',
        serviceMock: { settings: { getFallbackGroup: getFallbackGroupSpy } },
      })

      const res = await app.request('/shifts/fallback')
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.userPubkeys).toEqual(['b'.repeat(64), 'c'.repeat(64)])
      expect(getFallbackGroupSpy).toHaveBeenCalledWith('hub-1')
    })

    it('requires shifts:manage-fallback permission', async () => {
      const { app } = createTestApp({ permissions: ['shifts:read'] })
      const res = await app.request('/shifts/fallback')
      expect(res.status).toBe(403)
    })
  })

  // -------------------------------------------------------------------------
  // PUT /shifts/fallback — Permission-gated
  // -------------------------------------------------------------------------

  describe('PUT /shifts/fallback', () => {
    it('updates fallback group config', async () => {
      const setFallbackGroupSpy = jest.fn().mockResolvedValue({
        userPubkeys: ['d'.repeat(64), 'e'.repeat(64)],
      })
      const { app } = createTestApp({
        permissions: ['shifts:manage-fallback'],
        hubId: 'hub-1',
        serviceMock: { settings: { setFallbackGroup: setFallbackGroupSpy } },
      })

      const res = await app.request('/shifts/fallback', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userPubkeys: ['d'.repeat(64), 'e'.repeat(64)] }),
      })

      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.userPubkeys).toEqual(['d'.repeat(64), 'e'.repeat(64)])
      expect(setFallbackGroupSpy).toHaveBeenCalledWith({ userPubkeys: ['d'.repeat(64), 'e'.repeat(64)] }, 'hub-1')
    })

    it('requires shifts:manage-fallback permission', async () => {
      const { app } = createTestApp({ permissions: ['shifts:read'] })
      const res = await app.request('/shifts/fallback', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userPubkeys: ['d'.repeat(64)] }),
      })
      expect(res.status).toBe(403)
    })
  })

  // -------------------------------------------------------------------------
  // GET /shifts — List (via entity-router)
  // -------------------------------------------------------------------------

  describe('GET /shifts', () => {
    it('lists shifts', async () => {
      const listSpy = jest.fn().mockResolvedValue({
        shifts: [{ id: 's1', name: 'Morning', startTime: '09:00', endTime: '12:00', days: [1, 2, 3], userPubkeys: ['b'.repeat(64)] }],
      })
      const { app } = createTestApp({
        permissions: ['shifts:read'],
        hubId: 'hub-1',
        serviceMock: { shifts: { list: listSpy } },
      })

      const res = await app.request('/shifts')
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.shifts).toHaveLength(1)
      expect(listSpy).toHaveBeenCalledWith('hub-1')
    })

    it('requires shifts:read permission', async () => {
      const { app } = createTestApp({ permissions: ['other:read'] })
      const res = await app.request('/shifts')
      expect(res.status).toBe(403)
    })
  })

  // -------------------------------------------------------------------------
  // POST /shifts — Create (via entity-router)
  // -------------------------------------------------------------------------

  describe('POST /shifts', () => {
    it('creates a shift', async () => {
      const createSpy = jest.fn().mockResolvedValue({
        id: 's1',
        name: 'Morning',
        startTime: '09:00',
        endTime: '12:00',
        days: [1, 2, 3],
        userPubkeys: ['b'.repeat(64)],
      })
      const { app } = createTestApp({
        permissions: ['shifts:create'],
        hubId: 'hub-1',
        serviceMock: { shifts: { list: jest.fn(), create: createSpy } },
      })

      const res = await app.request('/shifts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Morning', startTime: '09:00', endTime: '12:00', days: [1, 2, 3], userPubkeys: ['b'.repeat(64)] }),
      })

      expect(res.status).toBe(201)
      expect(createSpy).toHaveBeenCalledWith('hub-1', { name: 'Morning', startTime: '09:00', endTime: '12:00', days: [1, 2, 3], userPubkeys: ['b'.repeat(64)] })
    })

    it('requires shifts:create permission', async () => {
      const { app } = createTestApp({ permissions: ['shifts:read'] })
      const res = await app.request('/shifts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Morning', startTime: '09:00', endTime: '12:00', days: [1, 2, 3], userPubkeys: ['b'.repeat(64)] }),
      })
      expect(res.status).toBe(403)
    })
  })

  // -------------------------------------------------------------------------
  // PATCH /shifts/:id — Update (via entity-router)
  // -------------------------------------------------------------------------

  describe('PATCH /shifts/:id', () => {
    it('updates a shift', async () => {
      const updateSpy = jest.fn().mockResolvedValue({
        id: 's1',
        name: 'Evening',
        startTime: '18:00',
        endTime: '21:00',
        days: [1, 2],
        userPubkeys: ['b'.repeat(64)],
      })
      const { app } = createTestApp({
        permissions: ['shifts:update'],
        hubId: 'hub-1',
        serviceMock: { shifts: { list: jest.fn(), update: updateSpy } },
      })

      const res = await app.request('/shifts/s1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Evening' }),
      })

      expect(res.status).toBe(200)
      expect(updateSpy).toHaveBeenCalledWith('hub-1', 's1', { name: 'Evening' })
    })

    it('requires shifts:update permission', async () => {
      const { app } = createTestApp({ permissions: ['shifts:read'] })
      const res = await app.request('/shifts/s1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Evening' }),
      })
      expect(res.status).toBe(403)
    })
  })

  // -------------------------------------------------------------------------
  // DELETE /shifts/:id — Delete (via entity-router)
  // -------------------------------------------------------------------------

  describe('DELETE /shifts/:id', () => {
    it('deletes a shift', async () => {
      const deleteSpy = jest.fn().mockResolvedValue({ ok: true })
      const { app } = createTestApp({
        permissions: ['shifts:delete'],
        hubId: 'hub-1',
        serviceMock: { shifts: { list: jest.fn(), delete: deleteSpy } },
      })

      const res = await app.request('/shifts/s1', { method: 'DELETE' })
      expect(res.status).toBe(200)
      expect(deleteSpy).toHaveBeenCalledWith('hub-1', 's1')
    })

    it('requires shifts:delete permission', async () => {
      const { app } = createTestApp({ permissions: ['shifts:read'] })
      const res = await app.request('/shifts/s1', { method: 'DELETE' })
      expect(res.status).toBe(403)
    })
  })
})
