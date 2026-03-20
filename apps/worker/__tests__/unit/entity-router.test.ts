import { describe, it, expect, vi } from 'vitest'
import { Hono } from 'hono'
import { z } from 'zod'
import { createEntityRouter } from '../../lib/entity-router'
import type { AppEnv } from '../../types'

// ---------------------------------------------------------------------------
// Helpers — mock services + middleware that sets context variables
// ---------------------------------------------------------------------------

function createTestApp(
  routerConfig: Parameters<typeof createEntityRouter>[0],
  opts: {
    permissions?: string[]
    hubId?: string
    pubkey?: string
    serviceMock?: Record<string, unknown>
    auditLogSpy?: ReturnType<typeof vi.fn>
  } = {},
) {
  const {
    permissions = ['*'],
    hubId,
    pubkey = 'test-pubkey-' + '0'.repeat(50),
    serviceMock = {},
    auditLogSpy = vi.fn().mockResolvedValue(undefined),
  } = opts

  const mockAuditService = { log: auditLogSpy }

  const services: Record<string, unknown> = {
    [routerConfig.service]: serviceMock,
    audit: mockAuditService,
  }

  const app = new Hono<AppEnv>()

  // Middleware to inject context variables that auth middleware normally sets
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
    if (hubId !== undefined) {
      c.set('hubId', hubId)
    }
    await next()
  })

  const router = createEntityRouter(routerConfig)
  app.route('/test', router)

  return { app, auditLogSpy }
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const itemSchema = z.object({ id: z.string(), name: z.string() })
const listSchema = z.object({ items: z.array(itemSchema) })
const createSchema = z.object({ name: z.string() })
const updateSchema = z.object({ name: z.string().optional() })
const querySchema = z.object({ page: z.coerce.number().optional() })

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createEntityRouter', () => {
  // -------------------------------------------------------------------------
  // GET / — List
  // -------------------------------------------------------------------------

  describe('GET / (list)', () => {
    it('calls service[listMethod] and returns result', async () => {
      const listSpy = vi.fn().mockResolvedValue({ items: [] })
      const { app } = createTestApp(
        {
          tag: 'Things',
          domain: 'things',
          service: 'shifts',
          listResponseSchema: listSchema,
          itemResponseSchema: itemSchema,
        },
        { serviceMock: { list: listSpy } },
      )

      const res = await app.request('/test')
      expect(res.status).toBe(200)
      expect(listSpy).toHaveBeenCalledOnce()
    })

    it('passes hubId as first arg when hubScoped is true', async () => {
      const listSpy = vi.fn().mockResolvedValue({ items: [] })
      const { app } = createTestApp(
        {
          tag: 'Things',
          domain: 'things',
          service: 'shifts',
          listResponseSchema: listSchema,
          itemResponseSchema: itemSchema,
          hubScoped: true,
        },
        { serviceMock: { list: listSpy }, hubId: 'hub-123' },
      )

      await app.request('/test')
      expect(listSpy).toHaveBeenCalledWith('hub-123')
    })

    it('does not pass hubId when hubScoped is false', async () => {
      const listSpy = vi.fn().mockResolvedValue({ items: [] })
      const { app } = createTestApp(
        {
          tag: 'Things',
          domain: 'things',
          service: 'shifts',
          listResponseSchema: listSchema,
          itemResponseSchema: itemSchema,
          hubScoped: false,
        },
        { serviceMock: { list: listSpy }, hubId: 'hub-123' },
      )

      await app.request('/test')
      expect(listSpy).toHaveBeenCalledWith()
    })

    it('applies domain:read permission by default', async () => {
      const { app } = createTestApp(
        {
          tag: 'Things',
          domain: 'things',
          service: 'shifts',
          listResponseSchema: listSchema,
          itemResponseSchema: itemSchema,
        },
        {
          serviceMock: { list: vi.fn().mockResolvedValue({ items: [] }) },
          permissions: ['other:read'],
        },
      )

      const res = await app.request('/test')
      expect(res.status).toBe(403)
    })

    it('uses permissionOverrides.list when set', async () => {
      const listSpy = vi.fn().mockResolvedValue({ items: [] })
      const { app } = createTestApp(
        {
          tag: 'Things',
          domain: 'things',
          service: 'shifts',
          listResponseSchema: listSchema,
          itemResponseSchema: itemSchema,
          permissionOverrides: { list: 'custom:list-all' },
        },
        {
          serviceMock: { list: listSpy },
          permissions: ['custom:list-all'],
        },
      )

      const res = await app.request('/test')
      expect(res.status).toBe(200)
      expect(listSpy).toHaveBeenCalledOnce()
    })

    it('passes validated query params when listQuerySchema is provided', async () => {
      const listSpy = vi.fn().mockResolvedValue({ items: [] })
      const { app } = createTestApp(
        {
          tag: 'Things',
          domain: 'things',
          service: 'shifts',
          listResponseSchema: listSchema,
          itemResponseSchema: itemSchema,
          listQuerySchema: querySchema,
        },
        { serviceMock: { list: listSpy } },
      )

      await app.request('/test?page=2')
      expect(listSpy).toHaveBeenCalledWith({ page: 2 })
    })

    it('uses custom method name when methods.list is set', async () => {
      const findAllSpy = vi.fn().mockResolvedValue({ items: [] })
      const { app } = createTestApp(
        {
          tag: 'Things',
          domain: 'things',
          service: 'shifts',
          listResponseSchema: listSchema,
          itemResponseSchema: itemSchema,
          methods: { list: 'findAll' },
        },
        { serviceMock: { findAll: findAllSpy } },
      )

      await app.request('/test')
      expect(findAllSpy).toHaveBeenCalledOnce()
    })
  })

  // -------------------------------------------------------------------------
  // GET /:id — Get single item
  // -------------------------------------------------------------------------

  describe('GET /:id (get)', () => {
    it('calls service[getMethod] with id', async () => {
      const getSpy = vi.fn().mockResolvedValue({ id: 'abc', name: 'Thing' })
      const { app } = createTestApp(
        {
          tag: 'Things',
          domain: 'things',
          service: 'shifts',
          listResponseSchema: listSchema,
          itemResponseSchema: itemSchema,
        },
        { serviceMock: { list: vi.fn(), get: getSpy } },
      )

      const res = await app.request('/test/abc')
      expect(res.status).toBe(200)
      expect(getSpy).toHaveBeenCalledWith('abc')
    })

    it('passes hubId first when hubScoped is true', async () => {
      const getSpy = vi.fn().mockResolvedValue({ id: 'abc', name: 'Thing' })
      const { app } = createTestApp(
        {
          tag: 'Things',
          domain: 'things',
          service: 'shifts',
          listResponseSchema: listSchema,
          itemResponseSchema: itemSchema,
          hubScoped: true,
        },
        { serviceMock: { list: vi.fn(), get: getSpy }, hubId: 'hub-999' },
      )

      await app.request('/test/abc')
      expect(getSpy).toHaveBeenCalledWith('hub-999', 'abc')
    })

    it('is NOT registered when disableGet is true', async () => {
      const { app } = createTestApp(
        {
          tag: 'Things',
          domain: 'things',
          service: 'shifts',
          listResponseSchema: listSchema,
          itemResponseSchema: itemSchema,
          disableGet: true,
        },
        { serviceMock: { list: vi.fn().mockResolvedValue({ items: [] }) } },
      )

      const res = await app.request('/test/abc')
      expect(res.status).toBe(404)
    })

    it('uses custom idParam', async () => {
      const getSpy = vi.fn().mockResolvedValue({ id: 'pk1', name: 'Thing' })
      const { app } = createTestApp(
        {
          tag: 'Things',
          domain: 'things',
          service: 'shifts',
          listResponseSchema: listSchema,
          itemResponseSchema: itemSchema,
          idParam: 'pubkey',
        },
        { serviceMock: { list: vi.fn(), get: getSpy } },
      )

      await app.request('/test/pk1')
      expect(getSpy).toHaveBeenCalledWith('pk1')
    })
  })

  // -------------------------------------------------------------------------
  // POST / — Create
  // -------------------------------------------------------------------------

  describe('POST / (create)', () => {
    it('is NOT registered when createBodySchema is omitted', async () => {
      const { app } = createTestApp(
        {
          tag: 'Things',
          domain: 'things',
          service: 'shifts',
          listResponseSchema: listSchema,
          itemResponseSchema: itemSchema,
        },
        { serviceMock: { list: vi.fn().mockResolvedValue({ items: [] }) } },
      )

      const res = await app.request('/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'New Thing' }),
      })
      expect(res.status).toBe(404)
    })

    it('calls service[createMethod] with body and returns 201', async () => {
      const createSpy = vi.fn().mockResolvedValue({ id: 'new-1', name: 'New Thing' })
      const { app } = createTestApp(
        {
          tag: 'Things',
          domain: 'things',
          service: 'shifts',
          listResponseSchema: listSchema,
          itemResponseSchema: itemSchema,
          createBodySchema: createSchema,
        },
        { serviceMock: { list: vi.fn(), create: createSpy } },
      )

      const res = await app.request('/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'New Thing' }),
      })
      expect(res.status).toBe(201)
      expect(createSpy).toHaveBeenCalledWith({ name: 'New Thing' })
    })

    it('passes hubId first when hubScoped is true', async () => {
      const createSpy = vi.fn().mockResolvedValue({ id: 'new-1', name: 'New Thing' })
      const { app } = createTestApp(
        {
          tag: 'Things',
          domain: 'things',
          service: 'shifts',
          listResponseSchema: listSchema,
          itemResponseSchema: itemSchema,
          createBodySchema: createSchema,
          hubScoped: true,
        },
        { serviceMock: { list: vi.fn(), create: createSpy }, hubId: 'hub-42' },
      )

      await app.request('/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Hub Thing' }),
      })
      expect(createSpy).toHaveBeenCalledWith('hub-42', { name: 'Hub Thing' })
    })

    it('applies domain:create permission', async () => {
      const { app } = createTestApp(
        {
          tag: 'Things',
          domain: 'things',
          service: 'shifts',
          listResponseSchema: listSchema,
          itemResponseSchema: itemSchema,
          createBodySchema: createSchema,
        },
        {
          serviceMock: { list: vi.fn(), create: vi.fn() },
          permissions: ['things:read'],
        },
      )

      const res = await app.request('/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Denied' }),
      })
      expect(res.status).toBe(403)
    })

    it('uses permissionOverrides.create when set', async () => {
      const createSpy = vi.fn().mockResolvedValue({ id: 'x', name: 'X' })
      const { app } = createTestApp(
        {
          tag: 'Things',
          domain: 'things',
          service: 'shifts',
          listResponseSchema: listSchema,
          itemResponseSchema: itemSchema,
          createBodySchema: createSchema,
          permissionOverrides: { create: 'things:add-new' },
        },
        {
          serviceMock: { list: vi.fn(), create: createSpy },
          permissions: ['things:add-new'],
        },
      )

      const res = await app.request('/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Allowed' }),
      })
      expect(res.status).toBe(201)
    })
  })

  // -------------------------------------------------------------------------
  // PATCH /:id — Update
  // -------------------------------------------------------------------------

  describe('PATCH /:id (update)', () => {
    it('is NOT registered when updateBodySchema is omitted', async () => {
      const { app } = createTestApp(
        {
          tag: 'Things',
          domain: 'things',
          service: 'shifts',
          listResponseSchema: listSchema,
          itemResponseSchema: itemSchema,
        },
        { serviceMock: { list: vi.fn().mockResolvedValue({ items: [] }) } },
      )

      const res = await app.request('/test/abc', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated' }),
      })
      expect(res.status).toBe(404)
    })

    it('calls service[updateMethod] with id and body', async () => {
      const updateSpy = vi.fn().mockResolvedValue({ id: 'abc', name: 'Updated' })
      const { app } = createTestApp(
        {
          tag: 'Things',
          domain: 'things',
          service: 'shifts',
          listResponseSchema: listSchema,
          itemResponseSchema: itemSchema,
          updateBodySchema: updateSchema,
        },
        { serviceMock: { list: vi.fn(), update: updateSpy } },
      )

      const res = await app.request('/test/abc', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated' }),
      })
      expect(res.status).toBe(200)
      expect(updateSpy).toHaveBeenCalledWith('abc', { name: 'Updated' })
    })

    it('passes hubId first when hubScoped is true', async () => {
      const updateSpy = vi.fn().mockResolvedValue({ id: 'abc', name: 'Updated' })
      const { app } = createTestApp(
        {
          tag: 'Things',
          domain: 'things',
          service: 'shifts',
          listResponseSchema: listSchema,
          itemResponseSchema: itemSchema,
          updateBodySchema: updateSchema,
          hubScoped: true,
        },
        { serviceMock: { list: vi.fn(), update: updateSpy }, hubId: 'hub-7' },
      )

      await app.request('/test/abc', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Hub Updated' }),
      })
      expect(updateSpy).toHaveBeenCalledWith('hub-7', 'abc', { name: 'Hub Updated' })
    })
  })

  // -------------------------------------------------------------------------
  // DELETE /:id — Delete
  // -------------------------------------------------------------------------

  describe('DELETE /:id (delete)', () => {
    it('calls service[deleteMethod] with id', async () => {
      const deleteSpy = vi.fn().mockResolvedValue({ ok: true })
      const { app } = createTestApp(
        {
          tag: 'Things',
          domain: 'things',
          service: 'shifts',
          listResponseSchema: listSchema,
          itemResponseSchema: itemSchema,
        },
        { serviceMock: { list: vi.fn(), delete: deleteSpy } },
      )

      const res = await app.request('/test/abc', { method: 'DELETE' })
      expect(res.status).toBe(200)
      expect(deleteSpy).toHaveBeenCalledWith('abc')
    })

    it('is NOT registered when disableDelete is true', async () => {
      const { app } = createTestApp(
        {
          tag: 'Things',
          domain: 'things',
          service: 'shifts',
          listResponseSchema: listSchema,
          itemResponseSchema: itemSchema,
          disableDelete: true,
        },
        { serviceMock: { list: vi.fn().mockResolvedValue({ items: [] }) } },
      )

      const res = await app.request('/test/abc', { method: 'DELETE' })
      expect(res.status).toBe(404)
    })

    it('passes hubId first when hubScoped is true', async () => {
      const deleteSpy = vi.fn().mockResolvedValue({ ok: true })
      const { app } = createTestApp(
        {
          tag: 'Things',
          domain: 'things',
          service: 'shifts',
          listResponseSchema: listSchema,
          itemResponseSchema: itemSchema,
          hubScoped: true,
        },
        { serviceMock: { list: vi.fn(), delete: deleteSpy }, hubId: 'hub-del' },
      )

      await app.request('/test/abc', { method: 'DELETE' })
      expect(deleteSpy).toHaveBeenCalledWith('hub-del', 'abc')
    })
  })

  // -------------------------------------------------------------------------
  // Audit events
  // -------------------------------------------------------------------------

  describe('audit events', () => {
    it('emits audit when auditEvents.created is set', async () => {
      const createSpy = vi.fn().mockResolvedValue({ id: 'x', name: 'X' })
      const auditSpy = vi.fn().mockResolvedValue(undefined)
      const { app } = createTestApp(
        {
          tag: 'Things',
          domain: 'things',
          service: 'shifts',
          listResponseSchema: listSchema,
          itemResponseSchema: itemSchema,
          createBodySchema: createSchema,
          auditEvents: { created: 'thingCreated' },
        },
        { serviceMock: { list: vi.fn(), create: createSpy }, auditLogSpy: auditSpy },
      )

      await app.request('/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Audited' }),
      })

      expect(auditSpy).toHaveBeenCalledOnce()
      // audit() calls auditService.log(event, actorPubkey, details, hubId)
      expect(auditSpy.mock.calls[0][0]).toBe('thingCreated')
    })

    it('does NOT emit audit when auditEvents.created is omitted', async () => {
      const createSpy = vi.fn().mockResolvedValue({ id: 'x', name: 'X' })
      const auditSpy = vi.fn().mockResolvedValue(undefined)
      const { app } = createTestApp(
        {
          tag: 'Things',
          domain: 'things',
          service: 'shifts',
          listResponseSchema: listSchema,
          itemResponseSchema: itemSchema,
          createBodySchema: createSchema,
          // No auditEvents
        },
        { serviceMock: { list: vi.fn(), create: createSpy }, auditLogSpy: auditSpy },
      )

      await app.request('/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'No Audit' }),
      })

      expect(auditSpy).not.toHaveBeenCalled()
    })

    it('emits audit with resource id for update', async () => {
      const updateSpy = vi.fn().mockResolvedValue({ id: 'res-1', name: 'U' })
      const auditSpy = vi.fn().mockResolvedValue(undefined)
      const { app } = createTestApp(
        {
          tag: 'Things',
          domain: 'things',
          service: 'shifts',
          listResponseSchema: listSchema,
          itemResponseSchema: itemSchema,
          updateBodySchema: updateSchema,
          auditEvents: { updated: 'thingUpdated' },
        },
        { serviceMock: { list: vi.fn(), update: updateSpy }, auditLogSpy: auditSpy },
      )

      await app.request('/test/res-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated' }),
      })

      expect(auditSpy).toHaveBeenCalledOnce()
      expect(auditSpy.mock.calls[0][0]).toBe('thingUpdated')
    })

    it('emits audit with resource id for delete', async () => {
      const deleteSpy = vi.fn().mockResolvedValue({ ok: true })
      const auditSpy = vi.fn().mockResolvedValue(undefined)
      const { app } = createTestApp(
        {
          tag: 'Things',
          domain: 'things',
          service: 'shifts',
          listResponseSchema: listSchema,
          itemResponseSchema: itemSchema,
          auditEvents: { deleted: 'thingDeleted' },
        },
        { serviceMock: { list: vi.fn(), delete: deleteSpy }, auditLogSpy: auditSpy },
      )

      await app.request('/test/res-1', { method: 'DELETE' })

      expect(auditSpy).toHaveBeenCalledOnce()
      expect(auditSpy.mock.calls[0][0]).toBe('thingDeleted')
    })
  })
})
