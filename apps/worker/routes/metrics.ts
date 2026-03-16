/**
 * Metrics endpoints.
 *
 * Two formats:
 * - GET /api/metrics         — JSON summary (admin-only, for dashboards)
 * - GET /api/metrics/prometheus — Prometheus text exposition (for scrapers)
 *
 * Metrics are collected in-memory and reset on process restart.
 * On CF Workers, this endpoint returns minimal metrics (uptime only)
 * since CF provides its own analytics.
 */
import { Hono } from 'hono'
import { describeRoute } from 'hono-openapi'
import type { AppEnv } from '../types'
import { getErrorSummary } from '../lib/error-counter'
import { auth } from '../middleware/auth'
import { requirePermission } from '../middleware/permission-guard'
import { getAllCircuitBreakerMetrics } from '../lib/circuit-breaker'
import { authErrors } from '../openapi/helpers'

const metrics = new Hono<AppEnv>()

// In-memory counters and histograms (Prometheus format)
const counters: Record<string, number> = {}
const histograms: Record<string, number[]> = {}

const startTime = Date.now()

/** Increment a counter metric */
export function incCounter(name: string, labels?: Record<string, string>): void {
  const key = labels
    ? `${name}{${Object.entries(labels).map(([k, v]) => `${k}="${v}"`).join(',')}}`
    : name
  counters[key] = (counters[key] || 0) + 1
}

/** Record a histogram observation (in seconds) */
export function observeHistogram(name: string, value: number, labels?: Record<string, string>): void {
  const key = labels
    ? `${name}{${Object.entries(labels).map(([k, v]) => `${k}="${v}"`).join(',')}}`
    : name
  if (!histograms[key]) histograms[key] = []
  histograms[key].push(value)
}

/** Format metrics as Prometheus text exposition */
function formatPrometheusMetrics(): string {
  const lines: string[] = []

  // Process uptime
  const uptimeSeconds = (Date.now() - startTime) / 1000
  lines.push('# HELP llamenos_uptime_seconds Process uptime in seconds')
  lines.push('# TYPE llamenos_uptime_seconds gauge')
  lines.push(`llamenos_uptime_seconds ${uptimeSeconds.toFixed(1)}`)

  // Error counters from error-counter module
  const summary = getErrorSummary()
  lines.push('# HELP llamenos_errors_total Total errors by category')
  lines.push('# TYPE llamenos_errors_total counter')
  for (const [category, count] of Object.entries(summary.errors)) {
    lines.push(`llamenos_errors_total{category="${category}"} ${count}`)
  }

  lines.push('# HELP llamenos_requests_total Total requests processed')
  lines.push('# TYPE llamenos_requests_total counter')
  lines.push(`llamenos_requests_total ${summary.totalRequests}`)

  // Custom counters
  for (const [key, value] of Object.entries(counters)) {
    const name = key.split('{')[0]
    if (!lines.some(l => l.includes(`# TYPE ${name}`))) {
      lines.push(`# TYPE ${name} counter`)
    }
    lines.push(`${key} ${value}`)
  }

  // Histograms — emit count and sum
  const histogramNames = new Set<string>()
  for (const [key, values] of Object.entries(histograms)) {
    const name = key.split('{')[0]
    if (!histogramNames.has(name)) {
      histogramNames.add(name)
      lines.push(`# TYPE ${name} summary`)
    }
    const count = values.length
    const sum = values.reduce((a, b) => a + b, 0)
    const labelPart = key.includes('{') ? key.slice(key.indexOf('{')) : ''
    lines.push(`${name}_count${labelPart} ${count}`)
    lines.push(`${name}_sum${labelPart} ${sum.toFixed(6)}`)
  }

  // Circuit breaker metrics
  const cbMetrics = getAllCircuitBreakerMetrics()
  if (cbMetrics.length > 0) {
    lines.push('# HELP llamenos_circuit_breaker_state Circuit breaker state (0=closed, 1=open, 2=half_open)')
    lines.push('# TYPE llamenos_circuit_breaker_state gauge')
    lines.push('# HELP llamenos_circuit_breaker_requests_total Total requests through circuit breaker')
    lines.push('# TYPE llamenos_circuit_breaker_requests_total counter')
    lines.push('# HELP llamenos_circuit_breaker_failures_total Total failures recorded by circuit breaker')
    lines.push('# TYPE llamenos_circuit_breaker_failures_total counter')
    lines.push('# HELP llamenos_circuit_breaker_rejections_total Requests rejected by open circuit')
    lines.push('# TYPE llamenos_circuit_breaker_rejections_total counter')

    const stateValue = (state: string) => state === 'closed' ? 0 : state === 'open' ? 1 : 2

    for (const cb of cbMetrics) {
      const labels = `name="${cb.name}"`
      lines.push(`llamenos_circuit_breaker_state{${labels}} ${stateValue(cb.state)}`)
      lines.push(`llamenos_circuit_breaker_requests_total{${labels}} ${cb.totalRequests}`)
      lines.push(`llamenos_circuit_breaker_failures_total{${labels}} ${cb.totalFailures}`)
      lines.push(`llamenos_circuit_breaker_rejections_total{${labels}} ${cb.totalRejections}`)
    }
  }

  return lines.join('\n') + '\n'
}

// Prometheus text format — requires bearer token (METRICS_SCRAPE_TOKEN env var)
// or authenticated admin. Never expose without access control.
metrics.get('/prometheus',
  describeRoute({
    tags: ['Metrics'],
    summary: 'Prometheus text exposition metrics',
    responses: {
      200: { description: 'Prometheus text format metrics' },
      401: { description: 'Missing or invalid scrape token' },
    },
  }),
  (c) => {
  // Check for scrape token (for Prometheus/Grafana scrapers)
  const authHeader = c.req.header('Authorization') ?? ''
  const scrapeToken = c.env.METRICS_SCRAPE_TOKEN
  if (scrapeToken) {
    const bearerToken = authHeader.replace(/^Bearer\s+/i, '')
    if (bearerToken !== scrapeToken) {
      return c.json({ error: 'Unauthorized' }, 401)
    }
  } else {
    // No scrape token configured — require authenticated admin
    const pubkey = c.get('pubkey')
    if (!pubkey) return c.json({ error: 'Unauthorized' }, 401)
    const permissions = c.get('permissions')
    if (!permissions?.includes('audit:read') && !permissions?.includes('*')) {
      return c.json({ error: 'Forbidden' }, 403)
    }
  }
  return new Response(formatPrometheusMetrics(), {
    headers: { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8' },
  })
})

// JSON summary — admin-only
metrics.get('/',
  describeRoute({
    tags: ['Metrics'],
    summary: 'JSON metrics summary for admin dashboards',
    responses: {
      200: { description: 'JSON metrics including uptime, request counts, and errors' },
      ...authErrors,
    },
  }),
  auth, requirePermission('audit:read'), (c) => {
  const summary = getErrorSummary()
  const uptimeSeconds = (Date.now() - startTime) / 1000

  return c.json({
    uptime: {
      seconds: Math.floor(uptimeSeconds),
      formatted: formatUptime(uptimeSeconds),
    },
    requests: {
      total: summary.totalRequests,
    },
    errors: {
      total: summary.totalErrors,
      byCategory: summary.errors,
    },
    counters: { ...counters },
  })
})

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const parts: string[] = []
  if (d > 0) parts.push(`${d}d`)
  if (h > 0) parts.push(`${h}h`)
  parts.push(`${m}m`)
  return parts.join(' ')
}

export default metrics
