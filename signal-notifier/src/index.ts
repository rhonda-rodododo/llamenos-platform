import { Hono } from 'hono'
import { IdentifierStore } from './store'
import { buildRoutes } from './routes'
import type { BridgeConfig } from './signal-client'

const port = Number(process.env.PORT ?? 3100)
const apiKey = process.env.NOTIFIER_API_KEY ?? ''
const dbPath = process.env.NOTIFIER_DB_PATH ?? './data/notifier.db'
const bridgeUrl = process.env.SIGNAL_BRIDGE_URL ?? 'http://signal-cli-rest-api:8080'
const bridgeApiKey = process.env.SIGNAL_BRIDGE_API_KEY ?? ''
const registeredNumber = process.env.SIGNAL_REGISTERED_NUMBER ?? ''

if (!apiKey) {
  console.error('[signal-notifier] NOTIFIER_API_KEY is required')
  process.exit(1)
}
if (!registeredNumber) {
  console.warn('[signal-notifier] SIGNAL_REGISTERED_NUMBER not set — notifications will fail')
}

const store = new IdentifierStore(dbPath)

const bridgeCfg: BridgeConfig = { bridgeUrl, bridgeApiKey, registeredNumber }

const app = new Hono()

// Health check — no auth, available to probes before the notifier routes
app.get('/health', (c) => c.json({ ok: true, registeredCount: store.count() }))

// All notifier endpoints under /api — bearer token protected
const notifierRoutes = buildRoutes(apiKey, store, bridgeCfg)
app.route('/api', notifierRoutes)

console.log(`[signal-notifier] starting on port ${port}`)

export default { port, fetch: app.fetch }
