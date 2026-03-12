/**
 * Node.js server entry point.
 * Runs the Hono worker app with @hono/node-server as a pure API server.
 *
 * The frontend is served by Tauri's webview — this server handles
 * only API routes and Durable Object shims. Real-time events use the
 * Nostr relay (strfry) — clients connect via the Caddy reverse proxy.
 */
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { createNodeEnv } from './env'

async function main() {
  console.log('[llamenos] Starting Node.js server...')

  // Create the Node.js environment with shimmed bindings
  const env = await createNodeEnv()
  console.log('[llamenos] Environment initialized')

  // Import the app after setting PLATFORM
  const { default: workerApp } = await import('../../../apps/worker/app')

  // Create a top-level Hono app
  const app = new Hono()

  // Inject env bindings into every request via middleware
  app.use('*', async (c, next) => {
    // Hono on CF Workers provides env via c.env
    // On Node.js, we inject it manually
    ;(c as any).env = env
    await next()
  })

  // Mount the worker app routes
  app.route('/', workerApp as any)

  // JSON 404 for any unmatched route (no SPA fallback — frontend is in Tauri)
  app.all('*', (c) => c.json({ error: 'Not Found' }, 404))

  const port = parseInt(process.env.PORT || '3000')
  const server = serve({
    fetch: app.fetch,
    port,
  }, async (info) => {
    console.log(`[llamenos] Server running at http://localhost:${info.port}`)

    // Write OpenAPI snapshot in development mode for codegen pipeline
    if (process.env.ENVIRONMENT === 'development') {
      try {
        const { writeFile } = await import('fs/promises')
        const { resolve } = await import('path')

        // Always resolve from project root (server runs via `node --watch dist/server/index.js`)
        const snapshotPath = resolve(process.cwd(), 'packages/protocol/openapi-snapshot.json')

        const response = await app.fetch(
          new Request(`http://localhost:${info.port}/api/openapi.json`)
        )
        const spec = await response.json()
        await writeFile(snapshotPath, JSON.stringify(spec, null, 2) + '\n')
        console.log('[llamenos] OpenAPI snapshot written to packages/protocol/openapi-snapshot.json')
      } catch (err) {
        console.warn(`[llamenos] Failed to write OpenAPI snapshot: ${err}`)
      }
    }
  })

  // Graceful shutdown
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

    server.close(() => {
      console.log('[llamenos] Server stopped')
      process.exit(0)
    })
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((err) => {
  console.error('[llamenos] Failed to start:', err)
  process.exit(1)
})
