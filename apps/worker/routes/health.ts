import { Hono } from 'hono'
import { describeRoute } from 'hono-openapi'
import type { AppEnv } from '../types'

declare const __BUILD_VERSION__: string

const health = new Hono<AppEnv>()

interface HealthResult {
  status: 'ok' | 'degraded'
  checks: Record<string, 'ok' | 'failing'>
  details: Record<string, string>
}

async function runChecks(env: Record<string, unknown>): Promise<HealthResult> {
  const checks: Record<string, 'ok' | 'failing'> = {}
  const details: Record<string, string> = {}

  // PostgreSQL check (Node.js self-hosted only — CF Workers use Durable Objects)
  const isSelfHosted = typeof process !== 'undefined' && process.env?.PLATFORM === 'bun'
  if (isSelfHosted) {
    try {
      const { getPool } = await import('../../../src/platform/bun/storage/postgres-pool')
      const sql = getPool()
      await sql`SELECT 1`
      checks.postgres = 'ok'
    } catch (err) {
      checks.postgres = 'failing'
      details.postgres = err instanceof Error ? err.message : 'Connection failed'
    }
  }

  // Blob storage check (R2 on CF, MinIO on Node.js)
  if (env.R2_BUCKET) {
    checks.storage = 'ok'
  } else {
    checks.storage = 'failing'
    details.storage = 'Blob storage not configured'
  }

  // Nostr relay configuration check
  // Actual connectivity is verified by strfry's own healthcheck in Docker/K8s
  if (env.NOSTR_RELAY_URL) {
    checks.relay = 'ok'
  } else {
    checks.relay = 'failing'
    details.relay = 'NOSTR_RELAY_URL not configured'
  }

  const status = Object.values(checks).every(v => v === 'ok') ? 'ok' : 'degraded'
  return { status, checks, details }
}

// Full health check — dependency status
health.get('/',
  describeRoute({
    tags: ['Health'],
    summary: 'Full health check with dependency status',
    responses: {
      200: { description: 'All dependencies healthy' },
      503: { description: 'One or more dependencies degraded or failing' },
    },
  }),
  async (c) => {
  const { status, checks, details } = await runChecks(c.env as unknown as Record<string, unknown>)
  const hasDetails = Object.keys(details).length > 0

  return c.json({
    status,
    checks,
    ...(hasDetails && { details }),
    version: typeof __BUILD_VERSION__ !== 'undefined' ? __BUILD_VERSION__ : 'dev',
    uptime: typeof process !== 'undefined' ? Math.floor(process.uptime()) : undefined,
  }, status === 'ok' ? 200 : 503)
})

// Kubernetes liveness probe — process is alive, always returns 200
health.get('/live',
  describeRoute({
    tags: ['Health'],
    summary: 'Kubernetes liveness probe',
    responses: {
      200: { description: 'Process is alive' },
    },
  }),
  (c) => c.json({ status: 'ok' }),
)

// Kubernetes readiness probe — verifies all dependencies
health.get('/ready',
  describeRoute({
    tags: ['Health'],
    summary: 'Kubernetes readiness probe with dependency verification',
    responses: {
      200: { description: 'All dependencies ready' },
      503: { description: 'One or more dependencies not ready' },
    },
  }),
  async (c) => {
  const { status, checks, details } = await runChecks(c.env as unknown as Record<string, unknown>)
  const hasDetails = Object.keys(details).length > 0

  return c.json({
    status,
    checks,
    ...(hasDetails && { details }),
    version: typeof __BUILD_VERSION__ !== 'undefined' ? __BUILD_VERSION__ : 'dev',
  }, status === 'ok' ? 200 : 503)
})

export default health
