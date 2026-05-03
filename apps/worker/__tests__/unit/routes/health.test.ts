import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Hono } from 'hono'
import type { AppEnv } from '@worker/types'
import healthRoute from '@worker/routes/health'

vi.mock('@worker/db', () => ({
  getDb: vi.fn().mockReturnValue({
    execute: vi.fn().mockResolvedValue(undefined),
  }),
}))

function createTestApp(opts: {
  env?: Record<string, string | undefined>
} = {}) {
  const app = new Hono<AppEnv>()

  app.use('*', async (c, next) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(c as any).env = {
      STORAGE_ENDPOINT: 'http://storage:9000',
      NOSTR_RELAY_URL: 'ws://relay:7777',
      SIP_BRIDGE_URL: 'http://sip-bridge:3000',
      ...opts.env,
    }
    await next()
  })

  app.route('/', healthRoute)
  return app
}

describe('health route', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async (url) => {
      const urlStr = String(url)
      if (urlStr.includes('storage:9000')) {
        return new Response(null, { status: 403 })
      }
      if (urlStr.includes('relay:7777')) {
        return new Response('relay info', { status: 200 })
      }
      if (urlStr.includes('sip-bridge')) {
        return new Response('ok', { status: 200 })
      }
      return new Response(null, { status: 500 })
    })
  })

  afterEach(() => {
    fetchSpy.mockRestore()
  })

  describe('GET /', () => {
    it('returns 200 when all dependencies are healthy', async () => {
      const app = createTestApp()

      const res = await app.request('/')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.status).toBe('ok')
      expect(body.checks.postgres.status).toBe('ok')
      expect(body.checks.storage.status).toBe('ok')
      expect(body.checks.relay.status).toBe('ok')
      expect(body.checks.sipBridge.status).toBe('ok')
      expect(body.version).toBeDefined()
      expect(body.uptime).toBeDefined()
    })

    it('returns 503 when postgres fails', async () => {
      const { getDb } = await import('@worker/db')
      vi.mocked(getDb).mockReturnValueOnce({
        execute: vi.fn().mockRejectedValue(new Error('Connection refused')),
      } as unknown as ReturnType<typeof getDb>)

      const app = createTestApp()
      const res = await app.request('/')
      expect(res.status).toBe(503)
      const body = await res.json()
      expect(body.status).toBe('degraded')
      expect(body.checks.postgres.status).toBe('failing')
      expect(body.checks.postgres.detail).toContain('Connection refused')
    })

    it('returns 503 when storage is unreachable', async () => {
      fetchSpy.mockImplementation(async () => {
        return new Response(null, { status: 500 })
      })

      const app = createTestApp()
      const res = await app.request('/')
      expect(res.status).toBe(503)
      const body = await res.json()
      expect(body.checks.storage.status).toBe('failing')
    })

    it('returns 503 when relay is unreachable', async () => {
      fetchSpy.mockImplementation(async (url: unknown) => {
        if (String(url).includes('relay')) {
          return new Response(null, { status: 502 })
        }
        return new Response(null, { status: 403 })
      })

      const app = createTestApp()
      const res = await app.request('/')
      expect(res.status).toBe(503)
      const body = await res.json()
      expect(body.checks.relay.status).toBe('failing')
      expect(body.checks.relay.detail).toContain('502')
    })

    it('returns 503 when sip bridge fails', async () => {
      fetchSpy.mockImplementation(async (url: unknown) => {
        if (String(url).includes('sip-bridge')) {
          return new Response(null, { status: 500 })
        }
        return new Response(null, { status: 403 })
      })

      const app = createTestApp()
      const res = await app.request('/')
      expect(res.status).toBe(503)
      const body = await res.json()
      expect(body.checks.sipBridge.status).toBe('failing')
    })

    it('skips sipBridge check when SIP_BRIDGE_URL not configured', async () => {
      const app = createTestApp({ env: { SIP_BRIDGE_URL: undefined } })
      const res = await app.request('/')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.checks.sipBridge).toBeUndefined()
    })

    it('treats storage 403 as ok (RustFS unauthenticated path behavior)', async () => {
      fetchSpy.mockImplementation(async (url: unknown) => {
        const urlStr = String(url)
        if (urlStr.includes('storage:9000')) {
          return new Response(null, { status: 403 })
        }
        if (urlStr.includes('relay:7777')) {
          return new Response('relay info', { status: 200 })
        }
        if (urlStr.includes('sip-bridge')) {
          return new Response('ok', { status: 200 })
        }
        return new Response(null, { status: 500 })
      })

      const app = createTestApp()
      const res = await app.request('/')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.checks.storage.status).toBe('ok')
    })

    it('marks storage failing when STORAGE_ENDPOINT not configured', async () => {
      const app = createTestApp({ env: { STORAGE_ENDPOINT: undefined, MINIO_ENDPOINT: undefined } })
      const res = await app.request('/')
      expect(res.status).toBe(503)
      const body = await res.json()
      expect(body.checks.storage.status).toBe('failing')
      expect(body.checks.storage.detail).toContain('STORAGE_ENDPOINT not configured')
    })

    it('marks relay failing when NOSTR_RELAY_URL not configured', async () => {
      const app = createTestApp({ env: { NOSTR_RELAY_URL: undefined } })
      const res = await app.request('/')
      expect(res.status).toBe(503)
      const body = await res.json()
      expect(body.checks.relay.status).toBe('failing')
      expect(body.checks.relay.detail).toContain('NOSTR_RELAY_URL not configured')
    })

    it('includes latency measurements for all checks', async () => {
      const app = createTestApp()
      const res = await app.request('/')
      const body = await res.json()
      expect(body.checks.postgres.latencyMs).toBeGreaterThanOrEqual(0)
      expect(body.checks.storage.latencyMs).toBeGreaterThanOrEqual(0)
      expect(body.checks.relay.latencyMs).toBeGreaterThanOrEqual(0)
      expect(body.checks.sipBridge.latencyMs).toBeGreaterThanOrEqual(0)
    })

    it('includes memory usage when process.memoryUsage is available', async () => {
      const app = createTestApp()
      const res = await app.request('/')
      const body = await res.json()
      expect(body.memory).toBeDefined()
      expect(body.memory.heapUsedMb).toBeGreaterThanOrEqual(0)
      expect(body.memory.heapTotalMb).toBeGreaterThanOrEqual(0)
      expect(body.memory.rssMb).toBeGreaterThanOrEqual(0)
    })
  })

  describe('GET /live', () => {
    it('returns 200 with process status', async () => {
      const app = createTestApp()
      const res = await app.request('/live')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.status).toBe('ok')
      expect(body.eventLoopLagMs).toBeGreaterThanOrEqual(0)
      expect(body.heapUsedMb).toBeGreaterThanOrEqual(0)
    })
  })

  describe('GET /ready', () => {
    it('returns 200 when all dependencies ready', async () => {
      const app = createTestApp()
      const res = await app.request('/ready')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.status).toBe('ok')
      expect(body.checks).toBeDefined()
      expect(body.version).toBeDefined()
    })

    it('returns 503 when dependencies are degraded', async () => {
      const { getDb } = await import('@worker/db')
      vi.mocked(getDb).mockReturnValueOnce({
        execute: vi.fn().mockRejectedValue(new Error('DB down')),
      } as unknown as ReturnType<typeof getDb>)

      const app = createTestApp()
      const res = await app.request('/ready')
      expect(res.status).toBe(503)
      const body = await res.json()
      expect(body.status).toBe('degraded')
    })

    it('omits memory metrics (not included in readiness)', async () => {
      const app = createTestApp()
      const res = await app.request('/ready')
      const body = await res.json()
      expect(body.memory).toBeUndefined()
    })
  })
})
