/**
 * Bun server entry point.
 * Runs the Hono worker app as a pure API server using Bun's native HTTP.
 *
 * The frontend is served by Tauri's webview — this server handles
 * only API routes. Real-time events use the WebSocket relay.
 */
import 'reflect-metadata' // Required by @peculiar/x509 → tsyringe (transitive dep of @simplewebauthn/server)
import { Hono } from 'hono'
import { createDatabase, closeDb } from '../../apps/worker/db'
import { createServices, type Services } from '../../apps/worker/services'
import { createBlobStorage } from '../../apps/worker/lib/blob-storage'
import { createTranscriptionService } from '../../apps/worker/lib/transcription-client'
import { validateConfig } from '../../apps/worker/lib/config'
import { getMessagingAdapterFromService } from '../../apps/worker/lib/service-factories'
import { publishEvent } from '../../apps/worker/lib/ws-events'
import { initConnectionManager } from '../../apps/worker/lib/ws-manager'
import { deriveServerKeypair } from '../../apps/worker/lib/server-identity'
import { createWsHandler, createConnectionData } from '../../apps/worker/routes/ws'
import type { WsConnectionData } from '../../apps/worker/routes/ws'
import { KIND_BLAST_PROGRESS, KIND_BLAST_STATUS } from '../../packages/shared/event-kinds'
import type { MessagingChannelType } from '../../packages/shared/types'
import type { Env } from '../../apps/worker/types/infra'
import fs from 'node:fs'

console.log('[llamenos] Starting Bun server...')

// Validate required env vars before initializing any services.
validateConfig()

// --- Read secrets ---
function readSecret(name: string, envKey?: string): string {
  const filePath = `/run/secrets/${name}`
  try {
    return fs.readFileSync(filePath, 'utf-8').trim()
  } catch {
    const key = envKey || name.toUpperCase().replace(/-/g, '_')
    return process.env[key] || ''
  }
}

// --- Initialize database ---
const databaseUrl = process.env.DATABASE_URL!
const db = createDatabase(databaseUrl)
console.log('[llamenos] Database initialized')

// --- Read secrets ---
const hmacSecret = readSecret('hmac-secret', 'HMAC_SECRET')
const serverSecret = readSecret('server-secret', 'SERVER_SECRET')
const firehoseSealKey = readSecret('firehose-agent-seal-key', 'FIREHOSE_AGENT_SEAL_KEY') || undefined

// --- Create services (pass HMAC secret for encryption operations) ---
const notifierUrl = process.env.NOTIFIER_URL || ''
const notifierApiKey = readSecret('notifier-api-key', 'NOTIFIER_API_KEY')
// notifierTokenSecret: defaults to hmacSecret so existing deployments require no config change
const notifierTokenSecret = readSecret('notifier-token-secret', 'NOTIFIER_TOKEN_SECRET') || hmacSecret
const services: Services = createServices(db, {
  hmacSecret,
  firehoseSealKey,
  notifierUrl,
  notifierApiKey,
  notifierTokenSecret,
  env: {
    ADMIN_PUBKEY: readSecret('admin-pubkey', 'ADMIN_PUBKEY'),
    ADMIN_DECRYPTION_PUBKEY: process.env.ADMIN_DECRYPTION_PUBKEY || undefined,
    SERVER_SECRET: serverSecret || undefined,
    ENVIRONMENT: process.env.ENVIRONMENT || undefined,
    DOMAIN: process.env.DOMAIN || undefined,
  },
})
console.log('[llamenos] Services initialized')

const env: Record<string, unknown> = {
  ADMIN_PUBKEY: readSecret('admin-pubkey', 'ADMIN_PUBKEY'),
  ADMIN_DECRYPTION_PUBKEY: process.env.ADMIN_DECRYPTION_PUBKEY || undefined,
  HMAC_SECRET: hmacSecret,
  HOTLINE_NAME: process.env.HOTLINE_NAME || 'Hotline',
  ENVIRONMENT: process.env.ENVIRONMENT || 'production',
  TWILIO_ACCOUNT_SID: readSecret('twilio-account-sid', 'TWILIO_ACCOUNT_SID'),
  TWILIO_AUTH_TOKEN: readSecret('twilio-auth-token', 'TWILIO_AUTH_TOKEN'),
  TWILIO_PHONE_NUMBER: process.env.TWILIO_PHONE_NUMBER || '',
  DEMO_MODE: process.env.DEMO_MODE || undefined,
  AI: createTranscriptionService(),
  R2_BUCKET: createBlobStorage(),
  STORAGE_ENDPOINT: process.env.STORAGE_ENDPOINT || undefined,
  SERVER_SECRET: serverSecret || undefined,
  GLITCHTIP_DSN: process.env.GLITCHTIP_DSN || undefined,
  DEV_RESET_SECRET: process.env.DEV_RESET_SECRET || undefined,
  E2E_TEST_SECRET: process.env.E2E_TEST_SECRET || undefined,
  FIREHOSE_AGENT_SEAL_KEY: firehoseSealKey,
}

// --- Initialize WebSocket relay ---
if (serverSecret) {
  const keypair = deriveServerKeypair(serverSecret)
  initConnectionManager(keypair.secretKey)
  console.log('[llamenos] WebSocket relay initialized (server pubkey:', keypair.pubkeyHex.slice(0, 8) + '...)')
}

// --- Start scheduled task poller with blast delivery worker ---
services.scheduler.start({
  blastsService: services.blasts,
  settingsService: services.settings,
  resolveAdapter: async (channel: MessagingChannelType) => {
    try {
      return await getMessagingAdapterFromService(channel, services.settings, hmacSecret)
    } catch {
      return null
    }
  },
  resolveIdentifier: (subscriberId: string) =>
    services.blasts.resolveSubscriberIdentifier(subscriberId),
  onBlastProgress: (blastId, stats) => {
    publishEvent(env as unknown as Env, KIND_BLAST_PROGRESS, {
      type: 'blast:progress',
      blastId,
      ...stats,
    })
  },
  onBlastStatusChange: (blastId, status) => {
    publishEvent(env as unknown as Env, KIND_BLAST_STATUS, {
      type: 'blast:status',
      blastId,
      status,
    })
  },
})

// --- Initialize firehose agents (if seal key is configured) ---
if (services.firehoseAgent) {
  services.firehoseAgent.init().catch((err) => {
    console.error('[llamenos] Firehose agent init failed:', err)
  })
  console.log('[llamenos] Firehose agent service initialized')
}

// --- Build Hono app ---
const { default: workerApp } = await import('../../apps/worker/app')

const app = new Hono()

// Inject env bindings and services into every request
app.use('*', async (c, next) => {
  ;(c as any).env = env
  ;(c as any).set('services', services)
  await next()
})

app.route('/', workerApp as any)
app.all('*', (c) => c.json({ error: 'Not Found' }, 404))

const port = parseInt(process.env.PORT || '3000')

// --- WebSocket handler ---
const wsHandler = createWsHandler()

/** Look up user hub memberships for WS auth */
async function lookupUserHubs(pubkey: string): Promise<{ hubs: string[] } | null> {
  const user = await services.identity.getUserInternal(pubkey)
  if (!user || !user.active) return null
  // Get all hubs and filter to those the user is a member of
  const { hubs } = await services.settings.getHubs()
  // User's hubRoles indicate hub membership
  const memberHubIds = (user.hubRoles ?? []).map(hr => hr.hubId)
  const activeHubIds = hubs
    .filter(h => h.status === 'active' && memberHubIds.includes(h.id))
    .map(h => h.id)
  // Always include 'global' — messaging events (1010, 1011) and other
  // hub-agnostic events are published to the 'global' pseudo-hub.
  return { hubs: [...activeHubIds, 'global'] }
}

export default {
  port,
  fetch(req: Request, server: import('bun').Server<WsConnectionData>): Response | Promise<Response> {
    // Handle WebSocket upgrade requests
    const url = new URL(req.url)
    if (url.pathname === '/ws' && req.headers.get('upgrade')?.toLowerCase() === 'websocket') {
      const data = createConnectionData(lookupUserHubs)
      const upgraded = server.upgrade(req, { data })
      if (upgraded) return new Response(null, { status: 101 })
      return new Response('WebSocket upgrade failed', { status: 500 })
    }
    return app.fetch(req, server)
  },
  websocket: wsHandler,
}

console.log(`[llamenos] Server running at http://localhost:${port}`)

// --- OpenAPI snapshot in development ---
if (process.env.ENVIRONMENT === 'development') {
  try {
    const { resolve } = await import('path')
    const snapshotPath = resolve(process.cwd(), 'packages/protocol/openapi-snapshot.json')
    const response = await app.fetch(new Request(`http://localhost:${port}/api/openapi.json`))
    const spec = await response.json()
    await Bun.write(snapshotPath, JSON.stringify(spec, null, 2) + '\n')
    console.log('[llamenos] OpenAPI snapshot written')
  } catch (err) {
    console.warn(`[llamenos] Failed to write OpenAPI snapshot: ${err}`)
  }
}

// --- Graceful shutdown ---
const shutdown = async () => {
  console.log('[llamenos] Shutting down...')
  services.firehoseAgent?.shutdown()
  services.scheduler.stop()
  await closeDb()
  console.log('[llamenos] Server stopped')
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
