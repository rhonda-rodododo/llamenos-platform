import { Hono } from 'hono'
import type { AppEnv } from './types'
import { cors } from './middleware/cors'
import { securityHeaders } from './middleware/security-headers'
import { auth } from './middleware/auth'
import configRoutes from './routes/config'
import devRoutes from './routes/dev'
import authRoutes from './routes/auth'
import webauthnRoutes from './routes/webauthn'
import websocketRoutes from './routes/websocket'
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
import { hubContext } from './middleware/hub'
import { getDOs } from './lib/do-access'

const app = new Hono<AppEnv>()

// --- API routes: CORS on all /api/* ---
const api = new Hono<AppEnv>()

// Health check — before CORS middleware (internal probes only, no external access needed)
api.get('/health', (c) => c.json({ status: 'ok' }))

api.use('*', cors)

// Public routes (no auth)
api.route('/config', configRoutes)
api.route('/', devRoutes)
api.route('/auth', authRoutes)
api.route('/webauthn', webauthnRoutes)
api.route('/invites', invitesRoutes)
api.route('/', websocketRoutes)

// Device provisioning (mixed auth — room creation is public, payload submission is authenticated)
api.route('/provision', provisioningRoutes)

// Telephony webhooks (validated by Twilio signature, not our auth)
api.route('/telephony', telephonyRoutes)

// Messaging webhooks (each adapter validates its own signature)
api.route('/messaging', messagingRoutes)

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
authenticated.route('/settings', settingsRoutes)
authenticated.route('/telephony', webrtcRoutes)
authenticated.route('/conversations', conversationsRoutes)
authenticated.route('/uploads', uploadsRoutes)
authenticated.route('/files', filesRoutes)
authenticated.route('/reports', reportsRoutes)
authenticated.route('/setup', setupRoutes)
authenticated.route('/hubs', hubRoutes)

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

authenticated.route('/hubs/:hubId', hubScoped)

api.route('/', authenticated)

// Mount API under /api
app.route('/api', api)

// Static assets with security headers
app.use('*', securityHeaders)
app.all('*', async (c, next) => {
  if (!c.env.ASSETS) {
    // Node.js mode — let the outer app's serveStatic handle static files
    await next()
    return
  }
  const assetResponse = await c.env.ASSETS.fetch(c.req.raw)
  return assetResponse
})

export default app
