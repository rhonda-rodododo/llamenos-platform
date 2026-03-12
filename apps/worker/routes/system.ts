/**
 * System health dashboard endpoint (Epic 295).
 *
 * Aggregates health data from multiple sources (DOs, env, process)
 * for admin monitoring. Uses Promise.allSettled so individual source
 * failures don't break the entire response.
 */
import { Hono } from 'hono'
import { describeRoute } from 'hono-openapi'
import type { AppEnv } from '../types'
import { getDOs } from '../lib/do-access'
import { requirePermission } from '../middleware/permission-guard'
import { authErrors } from '../openapi/helpers'

declare const __BUILD_VERSION__: string

export interface ServiceStatus {
  name: string
  status: 'ok' | 'degraded' | 'down'
  details?: string
}

export interface SystemHealth {
  server: {
    status: 'ok' | 'degraded' | 'down'
    uptime: number
    version: string
  }
  services: ServiceStatus[]
  calls: {
    today: number
    active: number
    avgResponseSeconds: number
    missed: number
  }
  storage: {
    dbSize: string
    blobStorage: string
  }
  backup: {
    lastBackup: string | null
    backupSize: string
    lastVerify: string | null
  }
  volunteers: {
    totalActive: number
    onlineNow: number
    onShift: number
    shiftCoverage: number
  }
  timestamp: string
}

const systemRoutes = new Hono<AppEnv>()
systemRoutes.use('*', requirePermission('system:manage-instance'))

async function fetchServerHealth(env: Record<string, unknown>): Promise<SystemHealth['server']> {
  const uptime = typeof process !== 'undefined' ? Math.floor(process.uptime()) : 0
  const version = typeof __BUILD_VERSION__ !== 'undefined' ? __BUILD_VERSION__ : 'dev'

  // Determine status based on uptime (just started = potentially degraded)
  const status = uptime > 10 ? 'ok' : 'degraded'

  return { status: status as 'ok' | 'degraded', uptime, version }
}

async function fetchServices(env: Record<string, unknown>): Promise<ServiceStatus[]> {
  const services: ServiceStatus[] = []

  // Check blob storage
  services.push({
    name: 'Blob Storage',
    status: env.R2_BUCKET ? 'ok' : 'down',
    details: env.R2_BUCKET ? undefined : 'Not configured',
  })

  // Check Nostr relay
  services.push({
    name: 'Nostr Relay',
    status: env.NOSTR_RELAY_URL ? 'ok' : 'down',
    details: env.NOSTR_RELAY_URL ? undefined : 'Not configured',
  })

  // Check telephony
  const hasTelephony = !!(env.TWILIO_ACCOUNT_SID || env.TELEPHONY_CONFIGURED)
  services.push({
    name: 'Telephony',
    status: hasTelephony ? 'ok' : 'down',
    details: hasTelephony ? undefined : 'No provider configured',
  })

  return services
}

async function fetchCallMetrics(dos: ReturnType<typeof getDOs>): Promise<SystemHealth['calls']> {
  try {
    // Fetch active calls
    const activeRes = await dos.calls.fetch(new Request('http://do/calls/active'))
    const activeData = activeRes.ok
      ? (await activeRes.json() as { calls: unknown[] })
      : { calls: [] }

    // Fetch today's call count
    const todayRes = await dos.calls.fetch(new Request('http://do/calls/today-count'))
    const todayData = todayRes.ok
      ? (await todayRes.json() as { count: number })
      : { count: 0 }

    return {
      today: todayData.count,
      active: activeData.calls.length,
      avgResponseSeconds: 0,
      missed: 0,
    }
  } catch {
    return { today: 0, active: 0, avgResponseSeconds: 0, missed: 0 }
  }
}

async function fetchVolunteerInfo(dos: ReturnType<typeof getDOs>): Promise<SystemHealth['volunteers']> {
  try {
    const [volRes, presenceRes, shiftRes] = await Promise.all([
      dos.identity.fetch(new Request('http://do/volunteers')),
      dos.calls.fetch(new Request('http://do/calls/presence')),
      dos.shifts.fetch(new Request('http://do/shifts/on-shift')),
    ])

    const volData = volRes.ok
      ? (await volRes.json() as { volunteers: Array<{ active: boolean }> })
      : { volunteers: [] }
    const presenceData = presenceRes.ok
      ? (await presenceRes.json() as { volunteers: unknown[] })
      : { volunteers: [] }
    const shiftData = shiftRes.ok
      ? (await shiftRes.json() as { pubkeys: string[] })
      : { pubkeys: [] }

    const totalActive = volData.volunteers.filter(v => v.active).length
    const onShift = shiftData.pubkeys.length
    const shiftCoverage = totalActive > 0 ? Math.round((onShift / totalActive) * 100) : 0

    return {
      totalActive,
      onlineNow: presenceData.volunteers.length,
      onShift,
      shiftCoverage,
    }
  } catch {
    return { totalActive: 0, onlineNow: 0, onShift: 0, shiftCoverage: 0 }
  }
}

systemRoutes.get('/health',
  describeRoute({
    tags: ['System'],
    summary: 'Aggregated system health dashboard for admins',
    responses: {
      200: { description: 'System health including server, services, calls, storage, and volunteers' },
      ...authErrors,
    },
  }),
  async (c) => {
  const env = c.env as unknown as Record<string, unknown>
  const dos = getDOs(c.env)

  const [serverResult, servicesResult, callsResult, volunteersResult] = await Promise.allSettled([
    fetchServerHealth(env),
    fetchServices(env),
    fetchCallMetrics(dos),
    fetchVolunteerInfo(dos),
  ])

  const server = serverResult.status === 'fulfilled'
    ? serverResult.value
    : { status: 'down' as const, uptime: 0, version: 'unknown' }

  const services = servicesResult.status === 'fulfilled'
    ? servicesResult.value
    : []

  const calls = callsResult.status === 'fulfilled'
    ? callsResult.value
    : { today: 0, active: 0, avgResponseSeconds: 0, missed: 0 }

  const volunteers = volunteersResult.status === 'fulfilled'
    ? volunteersResult.value
    : { totalActive: 0, onlineNow: 0, onShift: 0, shiftCoverage: 0 }

  // Derive overall server status from services
  const anyDown = services.some(s => s.status === 'down')
  const anyDegraded = services.some(s => s.status === 'degraded')
  if (anyDown) server.status = 'degraded'
  if (anyDegraded && server.status === 'ok') server.status = 'degraded'

  const health: SystemHealth = {
    server,
    services,
    calls,
    storage: {
      dbSize: 'N/A',
      blobStorage: env.R2_BUCKET ? 'Connected' : 'Not configured',
    },
    backup: {
      lastBackup: null,
      backupSize: 'N/A',
      lastVerify: null,
    },
    volunteers,
    timestamp: new Date().toISOString(),
  }

  return c.json(health)
})

export default systemRoutes
