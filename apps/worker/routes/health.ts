import { Hono } from 'hono'
import { describeRoute, resolver } from 'hono-openapi'
import type { AppEnv } from '../types'
import { healthResponseSchema, livenessResponseSchema, readinessResponseSchema } from '@protocol/schemas/health'

declare const __BUILD_VERSION__: string

const health = new Hono<AppEnv>()

interface CheckResult {
  status: 'ok' | 'failing'
  latencyMs?: number
  detail?: string
}

interface HealthResult {
  status: 'ok' | 'degraded'
  checks: Record<string, CheckResult>
}

async function checkPostgres(): Promise<CheckResult> {
  const t0 = Date.now()
  try {
    const { getDb } = await import('../db')
    const db = getDb()
    const { sql } = await import('drizzle-orm')
    await db.execute(sql`SELECT 1`)
    return { status: 'ok', latencyMs: Date.now() - t0 }
  } catch (err) {
    return { status: 'failing', latencyMs: Date.now() - t0, detail: err instanceof Error ? err.message : 'Connection failed' }
  }
}

async function checkMinio(env: Record<string, unknown>): Promise<CheckResult> {
  const endpoint = env.MINIO_ENDPOINT as string | undefined
  if (!endpoint) return { status: 'failing', detail: 'MINIO_ENDPOINT not configured' }
  const t0 = Date.now()
  try {
    // Try MinIO health endpoint first, fall back to root path for RustFS
    // (RustFS doesn't support /minio/health/live but returns 403 on /)
    const healthUrl = `${endpoint.replace(/\/$/, '')}/minio/health/live`
    const res = await fetch(healthUrl, { signal: AbortSignal.timeout(3000) })
    if (res.ok) return { status: 'ok', latencyMs: Date.now() - t0 }
    // If health endpoint returns 403, server is running (likely RustFS)
    if (res.status === 403) return { status: 'ok', latencyMs: Date.now() - t0 }
    return { status: 'failing', latencyMs: Date.now() - t0, detail: `HTTP ${res.status}` }
  } catch (err) {
    return { status: 'failing', latencyMs: Date.now() - t0, detail: err instanceof Error ? err.message : 'Unreachable' }
  }
}

async function checkNostrRelay(env: Record<string, unknown>): Promise<CheckResult> {
  const relayUrl = env.NOSTR_RELAY_URL as string | undefined
  if (!relayUrl) return { status: 'failing', detail: 'NOSTR_RELAY_URL not configured' }
  // Convert ws(s):// → http(s):// and probe the HTTP health endpoint
  const httpUrl = relayUrl.replace(/^ws:\/\//, 'http://').replace(/^wss:\/\//, 'https://')
  const t0 = Date.now()
  try {
    const res = await fetch(httpUrl, { signal: AbortSignal.timeout(3000) })
    // strfry returns 200 on HTTP for the relay info endpoint
    if (!res.ok && res.status !== 400 && res.status !== 404) {
      return { status: 'failing', latencyMs: Date.now() - t0, detail: `HTTP ${res.status}` }
    }
    return { status: 'ok', latencyMs: Date.now() - t0 }
  } catch (err) {
    return { status: 'failing', latencyMs: Date.now() - t0, detail: err instanceof Error ? err.message : 'Unreachable' }
  }
}

async function checkSipBridge(env: Record<string, unknown>): Promise<CheckResult | null> {
  const bridgeUrl = env.SIP_BRIDGE_URL as string | undefined
  if (!bridgeUrl) return null  // Not configured — skip
  const t0 = Date.now()
  try {
    const res = await fetch(`${bridgeUrl.replace(/\/$/, '')}/health`, { signal: AbortSignal.timeout(3000) })
    if (!res.ok) return { status: 'failing', latencyMs: Date.now() - t0, detail: `HTTP ${res.status}` }
    return { status: 'ok', latencyMs: Date.now() - t0 }
  } catch (err) {
    return { status: 'failing', latencyMs: Date.now() - t0, detail: err instanceof Error ? err.message : 'Unreachable' }
  }
}

async function runChecks(env: Record<string, unknown>): Promise<HealthResult> {
  const [postgres, minio, relay, sipBridge] = await Promise.all([
    checkPostgres(),
    checkMinio(env),
    checkNostrRelay(env),
    checkSipBridge(env),
  ])

  const checks: Record<string, CheckResult> = { postgres, minio, relay }
  if (sipBridge !== null) checks.sipBridge = sipBridge

  const status = Object.values(checks).every(v => v.status === 'ok') ? 'ok' : 'degraded'
  return { status, checks }
}

function measureEventLoopLag(): Promise<number> {
  return new Promise(resolve => {
    const start = performance.now()
    setImmediate(() => resolve(performance.now() - start))
  })
}

// Full health check — dependency status
health.get('/',
  describeRoute({
    tags: ['Health'],
    summary: 'Full health check with dependency status',
    responses: {
      200: {
        description: 'All dependencies healthy',
        content: {
          'application/json': {
            schema: resolver(healthResponseSchema),
          },
        },
      },
      503: { description: 'One or more dependencies degraded or failing' },
    },
  }),
  async (c) => {
    const { status, checks } = await runChecks(c.env as unknown as Record<string, unknown>)
    const mem = typeof process !== 'undefined' ? process.memoryUsage() : null

    return c.json({
      status,
      checks,
      version: typeof __BUILD_VERSION__ !== 'undefined' ? __BUILD_VERSION__ : 'dev',
      uptime: typeof process !== 'undefined' ? Math.floor(process.uptime()) : undefined,
      ...(mem && {
        memory: {
          heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
          heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
          rssMb: Math.round(mem.rss / 1024 / 1024),
        },
      }),
    }, status === 'ok' ? 200 : 503)
  },
)

// Kubernetes liveness probe — lightweight process check (memory + event loop lag)
health.get('/live',
  describeRoute({
    tags: ['Health'],
    summary: 'Kubernetes liveness probe',
    responses: {
      200: {
        description: 'Process is alive',
        content: {
          'application/json': {
            schema: resolver(livenessResponseSchema),
          },
        },
      },
    },
  }),
  async (c) => {
    const lagMs = await measureEventLoopLag()
    const mem = typeof process !== 'undefined' ? process.memoryUsage() : null

    return c.json({
      status: 'ok',
      eventLoopLagMs: Math.round(lagMs),
      ...(mem && {
        heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
        heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
      }),
    })
  },
)

// Kubernetes readiness probe — verifies all dependencies are reachable
health.get('/ready',
  describeRoute({
    tags: ['Health'],
    summary: 'Kubernetes readiness probe with dependency verification',
    responses: {
      200: {
        description: 'All dependencies ready',
        content: {
          'application/json': {
            schema: resolver(readinessResponseSchema),
          },
        },
      },
      503: { description: 'One or more dependencies not ready' },
    },
  }),
  async (c) => {
    const { status, checks } = await runChecks(c.env as unknown as Record<string, unknown>)

    return c.json({
      status,
      checks,
      version: typeof __BUILD_VERSION__ !== 'undefined' ? __BUILD_VERSION__ : 'dev',
    }, status === 'ok' ? 200 : 503)
  },
)

export default health
