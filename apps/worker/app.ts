import { Hono } from 'hono'
import type { AppEnv } from './types'
import { cors } from './middleware/cors'
import { apiVersion } from './middleware/api-version'
import { auth } from './middleware/auth'
import configRoutes from './routes/config'
import devRoutes from './routes/dev'
import authRoutes from './routes/auth'
import webauthnRoutes from './routes/webauthn'
import volunteersRoutes from './routes/volunteers'
import invitesRoutes from './routes/invites'
import shiftsRoutes from './routes/shifts'
import bansRoutes from './routes/bans'
import notesRoutes from './routes/notes'
import callsRoutes from './routes/calls'
import auditRoutes from './routes/audit'
import settingsRoutes from './routes/settings'
import telephonyRoutes from './routes/telephony'
import webrtcRoutes from './routes/webrtc'
import messagingRoutes from './messaging/router'
import conversationsRoutes from './routes/conversations'
import uploadsRoutes from './routes/uploads'
import filesRoutes from './routes/files'
import reportsRoutes from './routes/reports'
import setupRoutes from './routes/setup'
import provisioningRoutes from './routes/provisioning'
import hubRoutes from './routes/hubs'
import blastsRoutes from './routes/blasts'
import devicesRoutes from './routes/devices'
import contactsRoutes from './routes/contacts'
import contactsV2Routes from './routes/contacts-v2'
import recordsRoutes from './routes/records'
import eventsRoutes from './routes/events'
import healthRoutes from './routes/health'
import metricsRoutes from './routes/metrics'
import systemRoutes from './routes/system'
import entitySchemaRoutes from './routes/entity-schema'
import { hubContext } from './middleware/hub'
import { requestId } from './middleware/request-id'
import { getDOs } from './lib/do-access'
import { openAPIRouteHandler } from 'hono-openapi'
import { Scalar } from '@scalar/hono-api-reference'
import { openAPIConfig } from './openapi/config'

const app = new Hono<AppEnv>()

// --- API routes: CORS on all /api/* ---
const api = new Hono<AppEnv>()

// Request ID middleware — first in chain for full correlation coverage
api.use('*', requestId)

// Health check — before CORS middleware (internal probes only, no external access needed)
api.route('/health', healthRoutes)
api.route('/metrics', metricsRoutes)

api.use('*', cors)
api.use('*', apiVersion)

// Public routes (no auth)
api.route('/config', configRoutes)
api.route('/', devRoutes)
api.route('/auth', authRoutes)
api.route('/webauthn', webauthnRoutes)
api.route('/invites', invitesRoutes)

// Device provisioning (mixed auth — room creation is public, payload submission is authenticated)
api.route('/provision', provisioningRoutes)

// Telephony webhooks (validated by Twilio signature, not our auth)
api.route('/telephony', telephonyRoutes)

// Messaging webhooks (each adapter validates its own signature)
api.route('/messaging', messagingRoutes)

// Public preferences endpoint (no auth, token-validated)
api.get('/messaging/preferences', async (c) => {
  const token = c.req.query('token')
  if (!token) return c.json({ error: 'Token required' }, 400)
  const dos = getDOs(c.env)
  const res = await dos.blasts.fetch(new Request('http://do/subscribers/validate-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  }))
  return new Response(res.body, { status: res.status, headers: res.headers })
})

api.patch('/messaging/preferences', async (c) => {
  const token = c.req.query('token')
  if (!token) return c.json({ error: 'Token required' }, 400)
  const dos = getDOs(c.env)
  let body: Record<string, unknown>
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }
  const res = await dos.blasts.fetch(new Request('http://do/subscribers/update-preferences', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, ...body }),
  }))
  return new Response(res.body, { status: res.status, headers: res.headers })
})

// Public IVR audio serve (Twilio fetches during calls)
api.get('/ivr-audio/:promptType/:language', async (c) => {
  const dos = getDOs(c.env)
  const promptType = c.req.param('promptType')
  const language = c.req.param('language')
  // Validate path params to prevent injection into the internal DO URL
  if (!/^[a-z_-]+$/.test(promptType) || !/^[a-z]{2,5}(-[A-Z]{2})?$/.test(language)) {
    return c.json({ error: 'Invalid parameters' }, 400)
  }
  return dos.settings.fetch(new Request(`http://do/settings/ivr-audio/${promptType}/${language}`))
})

// Authenticated routes
const authenticated = new Hono<AppEnv>()
authenticated.use('*', auth)
authenticated.route('/volunteers', volunteersRoutes)
authenticated.route('/shifts', shiftsRoutes)
authenticated.route('/bans', bansRoutes)
authenticated.route('/notes', notesRoutes)
authenticated.route('/calls', callsRoutes)
authenticated.route('/audit', auditRoutes)
authenticated.route('/settings/cms', entitySchemaRoutes)
authenticated.route('/settings', settingsRoutes)
authenticated.route('/telephony', webrtcRoutes)
authenticated.route('/conversations', conversationsRoutes)
authenticated.route('/uploads', uploadsRoutes)
authenticated.route('/files', filesRoutes)
authenticated.route('/reports', reportsRoutes)
authenticated.route('/setup', setupRoutes)
authenticated.route('/hubs', hubRoutes)
authenticated.route('/blasts', blastsRoutes)
authenticated.route('/devices', devicesRoutes)
authenticated.route('/contacts', contactsRoutes)
authenticated.route('/directory', contactsV2Routes)
authenticated.route('/records', recordsRoutes)
authenticated.route('/events', eventsRoutes)
authenticated.route('/system', systemRoutes)

// Hub-scoped authenticated routes
const hubScoped = new Hono<AppEnv>()
hubScoped.use('*', hubContext)
hubScoped.route('/shifts', shiftsRoutes)
hubScoped.route('/bans', bansRoutes)
hubScoped.route('/notes', notesRoutes)
hubScoped.route('/calls', callsRoutes)
hubScoped.route('/audit', auditRoutes)
hubScoped.route('/conversations', conversationsRoutes)
hubScoped.route('/reports', reportsRoutes)
hubScoped.route('/blasts', blastsRoutes)
hubScoped.route('/contacts', contactsRoutes)
hubScoped.route('/directory', contactsV2Routes)
hubScoped.route('/records', recordsRoutes)
hubScoped.route('/events', eventsRoutes)

authenticated.route('/hubs/:hubId', hubScoped)

// OpenAPI spec + Scalar interactive docs (public, before auth)
api.get('/openapi.json', openAPIRouteHandler(api, openAPIConfig))
api.get('/docs', Scalar({ url: '/api/openapi.json' }))

api.route('/', authenticated)

// Mount API under /api
app.route('/api', api)

// Catch-all — no web frontend served here (Tauri desktop embeds its own)
app.all('*', (c) => c.json({ error: 'Not Found' }, 404))

export default app
