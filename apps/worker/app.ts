import { Hono } from 'hono'
import type { AppEnv } from './types'
import { cors } from './middleware/cors'
import { apiVersion } from './middleware/api-version'
import { auth } from './middleware/auth'
import configRoutes from './routes/config'
import devRoutes from './routes/dev'
import authRoutes from './routes/auth'
import webauthnRoutes from './routes/webauthn'
import usersRoutes from './routes/users'
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
import evidenceRoutes from './routes/evidence'
import { hubContext } from './middleware/hub'
import { requestId } from './middleware/request-id'
import { openAPIRouteHandler } from 'hono-openapi'
import { Scalar } from '@scalar/hono-api-reference'
import { openAPIConfig } from './openapi/config'
import { ServiceError } from './services/settings'

const app = new Hono<AppEnv>()

// --- Global error handler for ServiceError ---
app.onError((err, c) => {
  if (err instanceof ServiceError) {
    return c.json({ error: err.message }, err.status as 400 | 401 | 403 | 404 | 409 | 410 | 429 | 500)
  }
  throw err
})

// --- API routes: CORS on all /api/* ---
const api = new Hono<AppEnv>()

// Request ID middleware — first in chain for full correlation coverage
api.use('*', requestId)

// Health check — before CORS middleware (internal probes only, no external access needed)
api.route('/health', healthRoutes)
api.route('/metrics', metricsRoutes)

api.use('*', cors)

// Security headers — defense-in-depth for all API responses
api.use('*', async (c, next) => {
  await next()
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('Referrer-Policy', 'no-referrer')
  c.header('Cross-Origin-Opener-Policy', 'same-origin')
})

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
  const services = c.get('services')
  const result = await services.blasts.validatePreferenceToken(token)
  return c.json(result)
})

api.patch('/messaging/preferences', async (c) => {
  const token = c.req.query('token')
  if (!token) return c.json({ error: 'Token required' }, 400)
  const services = c.get('services')
  let body: Record<string, unknown>
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }
  const result = await services.blasts.updatePreferences(token, body as { language?: string; status?: 'active' | 'paused' | 'unsubscribed'; tags?: string[] })
  return c.json(result)
})

// Public IVR audio serve (Twilio fetches during calls)
api.get('/ivr-audio/:promptType/:language', async (c) => {
  const services = c.get('services')
  const promptType = c.req.param('promptType')
  const language = c.req.param('language')
  // Validate path params to prevent injection
  if (!/^[a-z_-]+$/.test(promptType) || !/^[a-z]{2,5}(-[A-Z]{2})?$/.test(language)) {
    return c.json({ error: 'Invalid parameters' }, 400)
  }
  const result = await services.settings.getIvrAudio(promptType, language)
  if (!result) return c.json({ error: 'Not found' }, 404)
  // Decode base64 audio to binary for streaming
  const binary = Uint8Array.from(atob(result.audio), c => c.charCodeAt(0))
  return new Response(binary, {
    headers: {
      'Content-Type': 'audio/wav',
      'Content-Length': String(binary.byteLength),
    },
  })
})

// Authenticated routes
const authenticated = new Hono<AppEnv>()
authenticated.use('*', auth)
authenticated.route('/users', usersRoutes)
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
authenticated.route('/', evidenceRoutes)
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
hubScoped.route('/settings/cms', entitySchemaRoutes)
hubScoped.route('/', evidenceRoutes)

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
