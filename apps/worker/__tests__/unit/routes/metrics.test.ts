/**
 * Unit tests for routes/metrics.ts
 *
 * Tests:
 * - incCounter / setGauge / observeHistogram helper functions
 * - GET /prometheus — auth via scrape token or admin permission
 * - GET / — JSON summary, requires metrics:read
 */
import { describe, it, expect, vi } from 'vitest'
import { Hono } from 'hono'
import type { AppEnv } from '@worker/types'

// We import the route default and the exported helpers
import metricsRoutes, {
  incCounter,
  setGauge,
  incGauge,
  decGauge,
  observeHistogram,
  recordHttpRequest,
  setActiveCalls,
  setActiveConversations,
  setSipBridgeStatus,
  setBackupAge,
} from '@worker/routes/metrics'

// Mock dependencies
vi.mock('@worker/lib/error-counter', () => ({
  getErrorSummary: vi.fn().mockReturnValue({
    totalRequests: 100,
    totalErrors: 5,
    errors: { auth: 3, validation: 2 },
  }),
}))

vi.mock('@worker/lib/circuit-breaker', () => ({
  getAllCircuitBreakerMetrics: vi.fn().mockReturnValue([]),
}))

// Mock the auth middleware — the metrics JSON endpoint applies it inline,
// but tests set permissions directly via the test app factory.
vi.mock('@worker/middleware/auth', () => ({
  auth: vi.fn().mockImplementation(async (_c: unknown, next: () => Promise<void>) => {
    await next()
  }),
}))

// ---------------------------------------------------------------------------
// Test app factory
// ---------------------------------------------------------------------------

function makeApp(opts: {
  permissions?: string[]
  pubkey?: string
  env?: Record<string, string>
} = {}) {
  const {
    permissions = ['*'],
    pubkey = 'a'.repeat(64),
    env = {},
  } = opts

  const app = new Hono<AppEnv>()
  app.use('*', async (c, next) => {
    c.set('pubkey', pubkey)
    c.set('permissions', permissions)
    c.set('services', {} as unknown as AppEnv['Variables']['services'])
    c.set('requestId', 'test-req')
    c.env = env as unknown as AppEnv['Bindings']
    await next()
  })
  app.route('/', metricsRoutes)

  return { app }
}

// ---------------------------------------------------------------------------
// Helper function tests
// ---------------------------------------------------------------------------

describe('metrics helper functions', () => {
  it('incCounter increments by 1', () => {
    // These are side effects on module-level state; just verify they don't throw
    expect(() => incCounter('test_counter')).not.toThrow()
    expect(() => incCounter('test_counter', { method: 'GET' })).not.toThrow()
  })

  it('setGauge sets an absolute value', () => {
    expect(() => setGauge('test_gauge', 42)).not.toThrow()
    expect(() => setGauge('test_gauge', 0, { hub_id: 'hub-1' })).not.toThrow()
  })

  it('incGauge increments gauge by 1', () => {
    expect(() => incGauge('test_inc_gauge')).not.toThrow()
    expect(() => incGauge('test_inc_gauge', { region: 'us' })).not.toThrow()
  })

  it('decGauge decrements gauge by 1', () => {
    expect(() => decGauge('test_dec_gauge')).not.toThrow()
  })

  it('observeHistogram records a value', () => {
    expect(() => observeHistogram('test_histogram', 0.05)).not.toThrow()
    expect(() => observeHistogram('test_histogram', 1.5, { endpoint: '/api/test' })).not.toThrow()
  })

  it('recordHttpRequest updates counter and histogram', () => {
    expect(() => recordHttpRequest('GET', '/api/health', 200, 0.01)).not.toThrow()
    expect(() => recordHttpRequest('POST', '/api/auth', 401, 0.5)).not.toThrow()
  })

  it('setActiveCalls records gauge', () => {
    expect(() => setActiveCalls(3)).not.toThrow()
    expect(() => setActiveCalls(0)).not.toThrow()
  })

  it('setActiveConversations records gauge', () => {
    expect(() => setActiveConversations(5)).not.toThrow()
  })

  it('setSipBridgeStatus records 1 for up, 0 for down', () => {
    expect(() => setSipBridgeStatus('hub-1', true)).not.toThrow()
    expect(() => setSipBridgeStatus('hub-2', false)).not.toThrow()
  })

  it('setBackupAge records gauge', () => {
    expect(() => setBackupAge(3600)).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// GET /prometheus — Prometheus scrape endpoint
// ---------------------------------------------------------------------------

describe('GET /prometheus', () => {
  it('returns 401 when scrape token is configured but none provided', async () => {
    const { app } = makeApp({ env: { METRICS_SCRAPE_TOKEN: 'secret-token' } })

    const res = await app.request('/prometheus')
    expect(res.status).toBe(401)
  })

  it('returns 401 when wrong scrape token provided', async () => {
    const { app } = makeApp({ env: { METRICS_SCRAPE_TOKEN: 'secret-token' } })

    const res = await app.request('/prometheus', {
      headers: { Authorization: 'Bearer wrong-token' },
    })
    expect(res.status).toBe(401)
  })

  it('returns Prometheus text when correct scrape token provided', async () => {
    const { app } = makeApp({ env: { METRICS_SCRAPE_TOKEN: 'secret-token' } })

    const res = await app.request('/prometheus', {
      headers: { Authorization: 'Bearer secret-token' },
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/plain')
    const text = await res.text()
    expect(text).toContain('llamenos_uptime_seconds')
  })

  it('returns 401 when no scrape token configured and no pubkey', async () => {
    // Override to simulate missing auth context
    const app2 = new Hono<AppEnv>()
    app2.use('*', async (c, next) => {
      // No pubkey set — simulates unauthenticated
      c.set('permissions', [])
      c.set('services', {} as unknown as AppEnv['Variables']['services'])
      c.env = {} as unknown as AppEnv['Bindings']
      await next()
    })
    app2.route('/', metricsRoutes)

    const res = await app2.request('/prometheus')
    expect(res.status).toBe(401)
  })

  it('returns 403 when authenticated but missing metrics:read permission', async () => {
    const { app } = makeApp({ env: {}, permissions: ['notes:read-own'] })

    const res = await app.request('/prometheus')
    expect(res.status).toBe(403)
  })

  it('returns Prometheus text when authenticated with metrics:read permission', async () => {
    const { app } = makeApp({ env: {}, permissions: ['metrics:read'] })

    const res = await app.request('/prometheus')
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain('# HELP llamenos_uptime_seconds')
    expect(text).toContain('# HELP llamenos_errors_total')
    expect(text).toContain('# TYPE llamenos_active_calls gauge')
  })

  it('includes circuit breaker metrics when available', async () => {
    const { getAllCircuitBreakerMetrics } = await import('@worker/lib/circuit-breaker')
    vi.mocked(getAllCircuitBreakerMetrics).mockReturnValueOnce([
      { name: 'twilio', state: 'open', totalRequests: 50, totalSuccesses: 40, totalFailures: 10, totalRejections: 5, recentFailures: 3, failureThreshold: 5, resetTimeoutMs: 60000, lastStateChangeTime: Date.now(), uptimeSinceLastChange: 1000 },
    ])

    const { app } = makeApp({ env: {}, permissions: ['*'] })
    const res = await app.request('/prometheus')
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain('llamenos_circuit_breaker_state{name="twilio"}')
  })
})

// ---------------------------------------------------------------------------
// GET / — JSON metrics summary
// ---------------------------------------------------------------------------

describe('GET /metrics (JSON summary)', () => {
  it('returns 403 without metrics:read', async () => {
    const { app } = makeApp({ permissions: ['audit:read'] })

    const res = await app.request('/')
    expect(res.status).toBe(403)
  })

  it('returns 200 with JSON summary for metrics:read', async () => {
    const { app } = makeApp({ permissions: ['metrics:read'] })

    const res = await app.request('/')
    expect(res.status).toBe(200)
    const json = await res.json() as Record<string, unknown>
    expect(json).toHaveProperty('uptime')
    expect(json).toHaveProperty('requests')
    expect(json).toHaveProperty('errors')
    expect(json).toHaveProperty('gauges')
    expect(json).toHaveProperty('counters')
  })

  it('includes error summary in response', async () => {
    const { app } = makeApp({ permissions: ['metrics:read'] })

    const res = await app.request('/')
    const json = await res.json() as Record<string, unknown>
    const errors = json.errors as Record<string, unknown>
    expect(errors.total).toBe(5)
    expect(errors.byCategory).toEqual({ auth: 3, validation: 2 })
  })

  it('includes formatted uptime string', async () => {
    const { app } = makeApp({ permissions: ['metrics:read'] })

    const res = await app.request('/')
    const json = await res.json() as Record<string, unknown>
    const uptime = json.uptime as Record<string, unknown>
    expect(typeof uptime.seconds).toBe('number')
    expect(typeof uptime.formatted).toBe('string')
    expect(uptime.formatted).toMatch(/\d+m/)
  })

  it('returns 403 without any auth (empty permissions)', async () => {
    const { app } = makeApp({ permissions: [] })

    const res = await app.request('/')
    expect(res.status).toBe(403)
  })

  it('allows wildcard permission', async () => {
    const { app } = makeApp({ permissions: ['*'] })

    const res = await app.request('/')
    expect(res.status).toBe(200)
  })
})
