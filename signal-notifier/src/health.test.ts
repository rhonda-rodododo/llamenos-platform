import { describe, expect, test, beforeAll, afterAll, beforeEach } from 'vitest'
import { Hono } from 'hono'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { IdentifierStore } from './store'
import { createTestDb } from './test-helpers'

describe('health endpoint', () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>
  let store: IdentifierStore

  beforeAll(async () => {
    ctx = await createTestDb('health')
    store = new IdentifierStore(ctx.db, 'health-test-secret')
  })

  beforeEach(async () => {
    await ctx.truncateAll()
  })

  afterAll(async () => {
    await ctx.cleanup()
  })

  test('returns ok:true when PG is healthy', async () => {
    await store.register('h1', '+15551234567', 'phone')

    const app = new Hono()
    app.get('/health', async (c) => {
      try {
        const count = await store.count()
        return c.json({ ok: true, registeredCount: count })
      } catch (err) {
        return c.json({ ok: false, error: err instanceof Error ? err.message : 'db error' }, 503)
      }
    })

    const res = await app.fetch(new Request('http://localhost/health'))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.registeredCount).toBe(1)
  })

  test('returns 503 when PG is down', async () => {
    const badSql = postgres('postgres://llamenos:dev@localhost:59999/nonexist', {
      max: 1,
      connect_timeout: 1,
    })
    const badDb = drizzle(badSql)
    const badStore = new IdentifierStore(badDb as any, 'secret')

    const app = new Hono()
    app.get('/health', async (c) => {
      try {
        const count = await badStore.count()
        return c.json({ ok: true, registeredCount: count })
      } catch (err) {
        return c.json({ ok: false, error: err instanceof Error ? err.message : 'db error' }, 503)
      }
    })

    const res = await app.fetch(new Request('http://localhost/health'))
    expect(res.status).toBe(503)
    const data = await res.json()
    expect(data.ok).toBe(false)

    await badSql.end()
  })
})
