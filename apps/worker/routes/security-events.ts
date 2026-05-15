/**
 * Security event API routes.
 *
 * GET /api/security-events — List security events for authenticated user.
 * GET /api/admin/security-events — Admin: list all security events.
 */

import { Hono } from 'hono'
import { validator } from 'hono-openapi'
import type { AppEnv } from '../types'
import { requirePermission } from '../middleware/permission-guard'
import { listSecurityEventsQuerySchema } from '@protocol/schemas/devices'

const securityEventsRoutes = new Hono<AppEnv>()

/**
 * GET /api/security-events
 * List security events for the authenticated user (own events only).
 */
securityEventsRoutes.get('/',
  validator('query', listSecurityEventsQuerySchema),
  async (c) => {
    const pubkey = c.get('pubkey')
    const { limit, offset } = c.req.valid('query')
    const services = c.get('services')

    const { events, total } = await services.identity.listSecurityEvents(pubkey, limit, offset)

    return c.json({
      events: events.map(e => ({
        id: e.id,
        eventType: e.eventType,
        deviceId: e.deviceId,
        metadata: e.metadata,
        ipHash: e.ipHash,
        createdAt: e.createdAt.toISOString(),
      })),
      total,
    })
  })

export default securityEventsRoutes

// --- Admin security events (separate router, mounted at /api/admin/security-events) ---

export const adminSecurityEventsRoutes = new Hono<AppEnv>()

adminSecurityEventsRoutes.get('/',
  requirePermission('audit:read'),
  validator('query', listSecurityEventsQuerySchema),
  async (c) => {
    const { limit, offset } = c.req.valid('query')
    const services = c.get('services')

    const { events, total } = await services.identity.listAllSecurityEvents(limit, offset)

    return c.json({
      events: events.map(e => ({
        id: e.id,
        eventType: e.eventType,
        deviceId: e.deviceId,
        metadata: e.metadata,
        ipHash: e.ipHash,
        createdAt: e.createdAt.toISOString(),
      })),
      total,
    })
  })
