/**
 * Session management API routes.
 *
 * GET    /api/sessions                  — List current user's active sessions.
 * DELETE /api/sessions/:id             — Terminate a specific session by UUID.
 * POST   /api/sessions/terminate-others — Terminate all sessions except current.
 */

import { Hono } from 'hono'
import { describeRoute } from 'hono-openapi'
import type { AppEnv } from '../types'
import { authErrors } from '../openapi/helpers'
import { rateLimit } from '../middleware/rate-limit'

const sessionRoutes = new Hono<AppEnv>()

/**
 * GET /api/sessions
 * List all active sessions for the authenticated user.
 */
sessionRoutes.get('/',
  describeRoute({
    tags: ['Sessions'],
    summary: 'List active sessions',
    responses: {
      200: { description: 'List of active sessions' },
      ...authErrors,
    },
  }),
  async (c) => {
    const pubkey = c.get('pubkey')
    const currentToken = c.get('sessionToken')
    const services = c.get('services')

    const userSessions = await services.identity.listSessions(pubkey)
    return c.json({
      sessions: userSessions.map(s => ({
        id: s.id,
        deviceId: (s.deviceInfo as Record<string, unknown>)?.deviceId ?? null,
        platform: (s.deviceInfo as Record<string, unknown>)?.platform ?? null,
        userAgent: (s.deviceInfo as Record<string, unknown>)?.userAgent ?? null,
        ipHash: (s.deviceInfo as Record<string, unknown>)?.ipHash ?? null,
        createdAt: s.createdAt.toISOString(),
        expiresAt: s.expiresAt.toISOString(),
        isCurrent: s.token === currentToken,
      })),
    })
  })

/**
 * POST /api/sessions/terminate-others
 * Terminate all sessions except the current one.
 * NOTE: Literal routes MUST come before parameterized routes.
 */
sessionRoutes.post('/terminate-others',
  rateLimit('write'),
  describeRoute({
    tags: ['Sessions'],
    summary: 'Terminate all other sessions',
    responses: {
      200: { description: 'Other sessions terminated' },
      429: { description: 'Rate limit exceeded (10/hour)' },
      ...authErrors,
    },
  }),
  async (c) => {
    const pubkey = c.get('pubkey')
    const currentToken = c.get('sessionToken')
    const services = c.get('services')

    const terminated = await services.identity.terminateOtherSessions(pubkey, currentToken ?? '')

    await services.identity.emitSecurityEvent(pubkey, 'session_terminate_all', null, {
      terminatedCount: terminated,
    })

    return c.json({ terminated })
  })

/**
 * DELETE /api/sessions/:id
 * Terminate a specific session by UUID. Only the session owner can terminate their sessions.
 */
sessionRoutes.delete('/:id',
  rateLimit('write'),
  describeRoute({
    tags: ['Sessions'],
    summary: 'Terminate a specific session',
    responses: {
      204: { description: 'Session terminated' },
      404: { description: 'Session not found' },
      429: { description: 'Rate limit exceeded (10/hour)' },
      ...authErrors,
    },
  }),
  async (c) => {
    const pubkey = c.get('pubkey')
    const sessionId = c.req.param('id')
    const services = c.get('services')

    const deleted = await services.identity.terminateSessionById(pubkey, sessionId)
    if (!deleted) return c.json({ error: 'Session not found' }, 404)

    await services.identity.emitSecurityEvent(pubkey, 'session_terminate', null, {
      terminatedSessionId: sessionId,
    })

    return c.body(null, 204)
  })

export default sessionRoutes
