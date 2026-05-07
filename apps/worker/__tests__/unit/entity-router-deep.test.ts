import { describe, it, expect, vi } from 'vitest'
import { createEntityRouter } from '@worker/lib/entity-router'
import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '@worker/types'

// Build minimal AppEnv context with mocks for testing route registration
function buildTestApp(routerConfig: Parameters<typeof createEntityRouter>[0]) {
  const app = new Hono<AppEnv>()

  // Inject mock auth middleware
  app.use('*', async (c, next) => {
    c.set('pubkey', 'test-pubkey')
    c.set('permissions', ['test:read', 'test:create', 'test:update', 'test:delete'])
    c.set('hubId', 'hub-test')
    c.set('user', { pubkey: 'test-pubkey', roles: ['admin'] } as any)
    c.set('allRoles', [])
    c.set('services', {
      test: {
        list: vi.fn().mockResolvedValue({ items: [] }),
        get: vi.fn().mockResolvedValue({ id: '123', name: 'item' }),
        create: vi.fn().mockResolvedValue({ id: 'new-1', name: 'created' }),
        update: vi.fn().mockResolvedValue({ id: '123', name: 'updated' }),
        delete: vi.fn().mockResolvedValue({ ok: true }),
      },
      audit: {
        log: vi.fn(),
      },
    } as any)
    await next()
  })

  const router = createEntityRouter(routerConfig)
  app.route('/api/test', router)
  return app
}

const itemSchema = z.object({ id: z.string(), name: z.string() })
const listSchema = z.object({ items: z.array(itemSchema) })
const createSchema = z.object({ name: z.string() })
const updateSchema = z.object({ name: z.string().optional() })

describe('createEntityRouter', () => {
  it('registers all CRUD routes by default', () => {
    const config = {
      tag: 'Test',
      domain: 'test',
      service: 'test' as any,
      listResponseSchema: listSchema,
      itemResponseSchema: itemSchema,
      createBodySchema: createSchema,
      updateBodySchema: updateSchema,
    }

    const app = buildTestApp(config)

    // Check that routes exist by inspecting router
    const routes = app.routes
    const paths = routes.map(r => `${r.method} ${r.path}`)

    // Hono flattens routes — check for presence of the patterns
    const getRoutes = paths.filter(p => p.startsWith('GET'))
    const postRoutes = paths.filter(p => p.startsWith('POST'))
    const patchRoutes = paths.filter(p => p.startsWith('PATCH'))
    const deleteRoutes = paths.filter(p => p.startsWith('DELETE'))

    expect(getRoutes.length).toBeGreaterThanOrEqual(2) // list + get
    expect(postRoutes.length).toBeGreaterThanOrEqual(1) // create
    expect(patchRoutes.length).toBeGreaterThanOrEqual(1) // update
    expect(deleteRoutes.length).toBeGreaterThanOrEqual(1) // delete
  })

  it('omits POST when createBodySchema is not provided', () => {
    const config = {
      tag: 'Test',
      domain: 'test',
      service: 'test' as any,
      listResponseSchema: listSchema,
      itemResponseSchema: itemSchema,
      // no createBodySchema
    }

    const app = buildTestApp(config)
    const routes = app.routes
    const methods = routes.filter(r => r.path === '/api/test').map(r => r.method)

    expect(methods).not.toContain('POST')
  })

  it('omits PATCH when updateBodySchema is not provided', () => {
    const config = {
      tag: 'Test',
      domain: 'test',
      service: 'test' as any,
      listResponseSchema: listSchema,
      itemResponseSchema: itemSchema,
      // no updateBodySchema
    }

    const app = buildTestApp(config)
    const routes = app.routes
    const patchRoutes = routes.filter(r => r.method === 'PATCH')

    expect(patchRoutes).toHaveLength(0)
  })

  it('disableList omits GET /', () => {
    const config = {
      tag: 'Test',
      domain: 'test',
      service: 'test' as any,
      listResponseSchema: listSchema,
      itemResponseSchema: itemSchema,
      disableList: true,
    }

    const app = buildTestApp(config)
    const routes = app.routes
    const listRoutes = routes.filter(r => r.path === '/api/test' && r.method === 'GET')

    expect(listRoutes).toHaveLength(0)
  })

  it('disableGet omits GET /:id', () => {
    const config = {
      tag: 'Test',
      domain: 'test',
      service: 'test' as any,
      listResponseSchema: listSchema,
      itemResponseSchema: itemSchema,
      disableGet: true,
    }

    const app = buildTestApp(config)
    const routes = app.routes
    const getRoutes = routes.filter(r => r.path === '/api/test/:id' && r.method === 'GET')

    expect(getRoutes).toHaveLength(0)
  })

  it('disableDelete omits DELETE /:id', () => {
    const config = {
      tag: 'Test',
      domain: 'test',
      service: 'test' as any,
      listResponseSchema: listSchema,
      itemResponseSchema: itemSchema,
      disableDelete: true,
    }

    const app = buildTestApp(config)
    const routes = app.routes
    const deleteRoutes = routes.filter(r => r.method === 'DELETE')

    expect(deleteRoutes).toHaveLength(0)
  })

  it('uses custom idParam in routes', () => {
    const config = {
      tag: 'Test',
      domain: 'test',
      service: 'test' as any,
      listResponseSchema: listSchema,
      itemResponseSchema: itemSchema,
      idParam: 'entityId',
    }

    const app = buildTestApp(config)
    const routes = app.routes
    const getRoutes = routes.filter(r => r.method === 'GET' && r.path.includes(':entityId'))

    expect(getRoutes.length).toBeGreaterThan(0)
  })
})
