/**
 * Bun server entry point.
 * Runs the Hono worker app as a pure API server using Bun's native HTTP.
 *
 * The frontend is served by Tauri's webview — this server handles
 * only API routes and Durable Object shims. Real-time events use the
 * Nostr relay (strfry) — clients connect via the Caddy reverse proxy.
 */
import { Hono } from 'hono'
import { createBunEnv } from './env'

console.log('[llamenos] Starting Bun server...')

// Create the Bun environment with shimmed bindings
const env = await createBunEnv()
console.log('[llamenos] Environment initialized')

// Import the app after environment is ready
const { default: workerApp } = await import('../../../apps/worker/app')

// Create a top-level Hono app
const app = new Hono()

// Inject env bindings into every request via middleware
app.use('*', async (c, next) => {
  // Hono on CF Workers provides env via c.env
  // On Bun, we inject it manually
  ;(c as any).env = env
  await next()
})

// Mount the worker app routes
app.route('/', workerApp as any)

// JSON 404 for any unmatched route (no SPA fallback — frontend is in Tauri)
app.all('*', (c) => c.json({ error: 'Not Found' }, 404))

const port = parseInt(process.env.PORT || '3000')

// Bun auto-starts an HTTP server from export default { fetch, port }
export default {
  fetch: app.fetch,
  port,
}

console.log(`[llamenos] Server running at http://localhost:${port}`)

// Write OpenAPI snapshot in development mode for codegen pipeline
if (process.env.ENVIRONMENT === 'development') {
  try {
    const { resolve } = await import('path')
    const snapshotPath = resolve(process.cwd(), 'packages/protocol/openapi-snapshot.json')

    const response = await app.fetch(
      new Request(`http://localhost:${port}/api/openapi.json`)
    )
    const spec = await response.json()
    await Bun.write(snapshotPath, JSON.stringify(spec, null, 2) + '\n')
    console.log('[llamenos] OpenAPI snapshot written to packages/protocol/openapi-snapshot.json')
  } catch (err) {
    console.warn(`[llamenos] Failed to write OpenAPI snapshot: ${err}`)
  }
}

// Graceful shutdown
// Bun handles connection draining on SIGTERM automatically.
// We just need to clean up our own resources (DB pool, pollers, WebSockets).
const shutdown = async () => {
  console.log('[llamenos] Shutting down...')
  const { stopAlarmPoller } = await import('./storage/alarm-poller')
  const { closePool } = await import('./storage/postgres-pool')
  stopAlarmPoller()
  await closePool()

  // Close Nostr publisher WebSocket
  try {
    const { getNostrPublisher } = await import('../../../apps/worker/lib/do-access')
    getNostrPublisher(env as any).close()
  } catch {}

  console.log('[llamenos] Server stopped')
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
