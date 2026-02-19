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
import { getDOs } from './lib/do-access'

const app = new Hono<AppEnv>()

// --- API routes: CORS on all /api/* ---
const api = new Hono<AppEnv>()
api.use('*', cors)

// Health check (no auth, no CORS — used by Docker/K8s probes)
api.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }))

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

api.route('/', authenticated)

// Mount API under /api
app.route('/api', api)

// Static assets with security headers
app.use('*', securityHeaders)
app.all('*', async (c) => {
  if (!c.env.ASSETS) {
    return new Response('Not Found', { status: 404 })
  }
  const assetResponse = await c.env.ASSETS.fetch(c.req.raw)
  return assetResponse
})

export default app
