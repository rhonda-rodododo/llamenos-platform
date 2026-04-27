/**
 * Analytics routes — admin-only dashboard metrics.
 *
 * All endpoints are hub-scoped and require admin-level permissions.
 * Date range is controlled via `?from=ISO&to=ISO` query params (default: last 30 days).
 */
import { Hono } from 'hono'
import { describeRoute, resolver, validator } from 'hono-openapi'
import { z } from 'zod'
import type { AppEnv } from '../types'
import { requirePermission } from '../middleware/permission-guard'
import { AnalyticsService } from '../services/analytics'
import { authErrors } from '../openapi/helpers'

const analytics = new Hono<AppEnv>()

// ── Shared query schema for date range filtering ──

const dateRangeQuerySchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
})

function parseDateRange(query: { from?: string; to?: string }): {
  from?: Date
  to?: Date
} {
  return {
    from: query.from ? new Date(query.from) : undefined,
    to: query.to ? new Date(query.to) : undefined,
  }
}

// ── Response schemas ──

const callMetricsSchema = z.object({
  totalCalls: z.number(),
  answeredCalls: z.number(),
  unansweredCalls: z.number(),
  abandonedCalls: z.number(),
  answerRate: z.number(),
  avgDurationSeconds: z.number(),
  byPeriod: z.array(
    z.object({
      period: z.string(),
      total: z.number(),
      answered: z.number(),
      unanswered: z.number(),
      abandoned: z.number(),
    }),
  ),
})

const conversationMetricsSchema = z.object({
  totalConversations: z.number(),
  activeConversations: z.number(),
  waitingConversations: z.number(),
  closedConversations: z.number(),
  totalMessages: z.number(),
  avgMessagesPerConversation: z.number(),
  avgResponseTimeSeconds: z.number().nullable(),
  byChannel: z.array(
    z.object({
      channel: z.string(),
      total: z.number(),
      active: z.number(),
      messages: z.number(),
    }),
  ),
})

const shiftMetricsSchema = z.object({
  totalShifts: z.number(),
  totalVolunteersScheduled: z.number(),
  weeklyHoursCovered: z.number(),
  coverageSlots: z.array(
    z.object({
      date: z.string(),
      dayOfWeek: z.number(),
      startTime: z.string(),
      endTime: z.string(),
      volunteerCount: z.number(),
      isCovered: z.boolean(),
    }),
  ),
})

const systemHealthSchema = z.object({
  activeCallCount: z.number(),
  waitingConversationCount: z.number(),
  activeVolunteerCount: z.number(),
  services: z.array(
    z.object({
      name: z.string(),
      status: z.enum(['ok', 'degraded', 'unknown']),
      detail: z.string().optional(),
    }),
  ),
})

// ── GET /api/analytics/calls ──

analytics.get(
  '/calls',
  describeRoute({
    tags: ['Analytics'],
    summary: 'Call volume, duration, and answer rate metrics',
    responses: {
      200: {
        description: 'Call metrics for the requested date range',
        content: {
          'application/json': {
            schema: resolver(callMetricsSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  requirePermission('audit:read'),
  validator('query', dateRangeQuerySchema),
  async (c) => {
    const hubId = c.get('hubId') ?? ''
    const { getDb } = await import('../db')
    const analyticsService = new AnalyticsService(getDb())
    const query = c.req.valid('query')
    const range = parseDateRange(query)
    const metrics = await analyticsService.getCallMetrics(hubId, range)
    return c.json(metrics)
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
        content: {
          'application/json': {
            schema: resolver(conversationMetricsSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  requirePermission('audit:read'),
  validator('query', dateRangeQuerySchema),
  async (c) => {
    const hubId = c.get('hubId') ?? ''
    const analyticsService = new AnalyticsService((await import('../db')).getDb())
    const query = c.req.valid('query')
    const range = parseDateRange(query)
    const metrics = await analyticsService.getConversationMetrics(hubId, range)
    return c.json(metrics)
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
        content: {
          'application/json': {
            schema: resolver(shiftMetricsSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  requirePermission('audit:read'),
  async (c) => {
    const hubId = c.get('hubId') ?? ''
    const analyticsService = new AnalyticsService((await import('../db')).getDb())
    const metrics = await analyticsService.getShiftMetrics(hubId)
    return c.json(metrics)
  },
)

// ── GET /api/analytics/health ──

analytics.get(
  '/health',
  describeRoute({
    tags: ['Analytics'],
    summary: 'System health dashboard — active connections, queue depths, service status',
    responses: {
      200: {
        description: 'Current system health snapshot',
        content: {
          'application/json': {
            schema: resolver(systemHealthSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  requirePermission('audit:read'),
  async (c) => {
    const hubId = c.get('hubId') ?? ''
    const analyticsService = new AnalyticsService((await import('../db')).getDb())
    const health = await analyticsService.getSystemHealth(hubId)
    return c.json(health)
  },
)

export default analytics
