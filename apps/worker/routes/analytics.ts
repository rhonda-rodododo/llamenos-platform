/**
 * Analytics routes — admin-only dashboard metrics.
 *
 * All endpoints are hub-scoped and require `audit:read` permission.
 * Date range via `?from=ISO&to=ISO` query params (default: last 30 days).
 */
import { Hono } from 'hono'
import { describeRoute, resolver, validator } from 'hono-openapi'
import type { AppEnv } from '../types'
import { requirePermission } from '../middleware/permission-guard'
import { AnalyticsService } from '../services/analytics'
import { authErrors } from '../openapi/helpers'
import {
  analyticsDateRangeQuerySchema,
  callMetricsResponseSchema,
  conversationMetricsResponseSchema,
  shiftMetricsResponseSchema,
  analyticsSystemHealthResponseSchema,
  hourlyDistributionResponseSchema,
  userStatsResponseSchema,
  personalStatsResponseSchema,
} from '@protocol/schemas/analytics'

const analytics = new Hono<AppEnv>()

function parseDateRange(query: { from?: string; to?: string }): {
  from?: Date
  to?: Date
} {
  return {
    from: query.from ? new Date(query.from) : undefined,
    to: query.to ? new Date(query.to) : undefined,
  }
}

async function getAnalyticsService(): Promise<AnalyticsService> {
  const { getDb } = await import('../db')
  return new AnalyticsService(getDb())
}

// ── GET /api/analytics/calls ──

analytics.get(
  '/calls',
  describeRoute({
    tags: ['Analytics'],
    summary: 'Call volume, duration, and answer rate metrics',
    responses: {
      200: {
        description: 'Call metrics for the requested date range',
        content: { 'application/json': { schema: resolver(callMetricsResponseSchema) } },
      },
      ...authErrors,
    },
  }),
  requirePermission('audit:read'),
  validator('query', analyticsDateRangeQuerySchema),
  async (c) => {
    const hubId = c.get('hubId') ?? ''
    const service = await getAnalyticsService()
    const range = parseDateRange(c.req.valid('query'))
    return c.json(await service.getCallMetrics(hubId, range))
  },
)

// ── GET /api/analytics/conversations ──

analytics.get(
  '/conversations',
  describeRoute({
    tags: ['Analytics'],
    summary: 'Conversation and message statistics by channel',
    responses: {
      200: {
        description: 'Conversation metrics for the requested date range',
        content: { 'application/json': { schema: resolver(conversationMetricsResponseSchema) } },
      },
      ...authErrors,
    },
  }),
  requirePermission('audit:read'),
  validator('query', analyticsDateRangeQuerySchema),
  async (c) => {
    const hubId = c.get('hubId') ?? ''
    const service = await getAnalyticsService()
    const range = parseDateRange(c.req.valid('query'))
    return c.json(await service.getConversationMetrics(hubId, range))
  },
)

// ── GET /api/analytics/shifts ──

analytics.get(
  '/shifts',
  describeRoute({
    tags: ['Analytics'],
    summary: 'Shift coverage hours, gaps, and volunteer availability',
    responses: {
      200: {
        description: 'Shift coverage metrics',
        content: { 'application/json': { schema: resolver(shiftMetricsResponseSchema) } },
      },
      ...authErrors,
    },
  }),
  requirePermission('audit:read'),
  async (c) => {
    const hubId = c.get('hubId') ?? ''
    const service = await getAnalyticsService()
    return c.json(await service.getShiftMetrics(hubId))
  },
)

// ── GET /api/analytics/health ──

analytics.get(
  '/health',
  describeRoute({
    tags: ['Analytics'],
    summary: 'System health — active connections, queue depths, service status',
    responses: {
      200: {
        description: 'Current system health snapshot',
        content: { 'application/json': { schema: resolver(analyticsSystemHealthResponseSchema) } },
      },
      ...authErrors,
    },
  }),
  requirePermission('audit:read'),
  async (c) => {
    const hubId = c.get('hubId') ?? ''
    const service = await getAnalyticsService()
    return c.json(await service.getSystemHealth(hubId))
  },
)

export default analytics
