/**
 * Bun server entry point.
 * Runs the Hono worker app as a pure API server using Bun's native HTTP.
 *
 * The frontend is served by Tauri's webview — this server handles
 * only API routes. Real-time events use the Nostr relay (strfry).
 */
import 'reflect-metadata' // Required by @peculiar/x509 → tsyringe (transitive dep of @simplewebauthn/server)
import { Hono } from 'hono'
import { createDatabase, closeDb } from '../../apps/worker/db'
import { createServices, type Services } from '../../apps/worker/services'
import { createStorageManager, resolveStorageCredentials } from '../../apps/worker/lib/storage-manager'
import { createStorageAdmin } from '../../apps/worker/lib/storage-admin'
import { createBlobStorage } from '../../apps/worker/lib/blob-storage'
import { createTranscriptionService } from '../../apps/worker/lib/transcription-client'
import { createNostrPublisher, NodeNostrPublisher } from '../../apps/worker/lib/nostr-publisher'
import { EventOutbox } from '../../apps/worker/lib/nostr-outbox'
import { startOutboxPoller, stopOutboxPoller } from '../../apps/worker/lib/nostr-outbox-poller'
import { validateConfig } from '../../apps/worker/lib/config'
import { getMessagingAdapterFromService } from '../../apps/worker/lib/service-factories'
import { publishNostrEvent } from '../../apps/worker/lib/nostr-events'
import { KIND_BLAST_PROGRESS, KIND_BLAST_STATUS } from '../../packages/shared/nostr-events'
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
const serverNostrSecret = readSecret('server-nostr-secret', 'SERVER_NOSTR_SECRET')
const nostrRelayUrl = process.env.NOSTR_RELAY_URL || ''
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
    SERVER_NOSTR_SECRET: serverNostrSecret || undefined,
    NOSTR_RELAY_URL: nostrRelayUrl || undefined,
  },
})
console.log('[llamenos] Services initialized')

// --- Initialize storage ---
let storageAdmin = null
let storageManager = null
try {
  const creds = resolveStorageCredentials()
  storageAdmin = createStorageAdmin(creds)
  storageManager = createStorageManager({ admin: storageAdmin })
  console.log('[llamenos] Storage manager initialized')
} catch (err) {
  console.warn('[llamenos] Storage not configured:', err instanceof Error ? err.message : String(err))
}

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
  STORAGE_MANAGER: storageManager,
  STORAGE_ADMIN: storageAdmin,
  STORAGE_ENDPOINT: process.env.STORAGE_ENDPOINT || process.env.MINIO_ENDPOINT || undefined,
  SERVER_NOSTR_SECRET: serverNostrSecret || undefined,
  NOSTR_RELAY_URL: nostrRelayUrl || undefined,
  NOSTR_RELAY_PUBLIC_URL: process.env.NOSTR_RELAY_PUBLIC_URL || undefined,
  GLITCHTIP_DSN: process.env.GLITCHTIP_DSN || undefined,
  DEV_RESET_SECRET: process.env.DEV_RESET_SECRET || undefined,
  E2E_TEST_SECRET: process.env.E2E_TEST_SECRET || undefined,
  FIREHOSE_AGENT_SEAL_KEY: firehoseSealKey,
}

// --- Nostr publisher with persistent outbox ---
if (serverNostrSecret && nostrRelayUrl) {
  const publisher = createNostrPublisher({
    SERVER_NOSTR_SECRET: serverNostrSecret,
    NOSTR_RELAY_URL: nostrRelayUrl,
  })

  if (publisher instanceof NodeNostrPublisher) {
    const outbox = new EventOutbox(db)
    publisher.setOutbox(outbox)
    startOutboxPoller(outbox, publisher)
    publisher.connect().catch((err) => {
      console.warn('[server] Initial relay connection failed (outbox will retry):', err)
    })
  }

  env.NOSTR_PUBLISHER = publisher
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
    publishNostrEvent(env as unknown as Env, KIND_BLAST_PROGRESS, {
      type: 'blast:progress',
      blastId,
      ...stats,
    }).catch(() => {})
  },
  onBlastStatusChange: (blastId, status) => {
    publishNostrEvent(env as unknown as Env, KIND_BLAST_STATUS, {
      type: 'blast:status',
      blastId,
      status,
    }).catch(() => {})
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

export default {
  fetch: app.fetch,
  port,
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
  stopOutboxPoller()
  await closeDb()
  console.log('[llamenos] Server stopped')
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
