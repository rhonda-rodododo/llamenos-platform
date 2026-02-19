/**
 * Node.js server entry point.
 * Runs the Hono app with @hono/node-server, serving static files
 * and handling WebSocket upgrades.
 */
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { createNodeWebSocket } from '@hono/node-ws'
import { Hono } from 'hono'
import path from 'node:path'
import { createNodeEnv } from './env'

async function main() {
  console.log('[llamenos] Starting Node.js server...')

  // Create the Node.js environment with shimmed bindings
  const env = await createNodeEnv()
  console.log('[llamenos] Environment initialized')

  // Import the app after setting PLATFORM
  const { default: workerApp } = await import('../../worker/app')

  // Create a wrapper app that injects env into every request
  const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app: workerApp as any })

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

  // Static file serving (replaces CF ASSETS binding)
  // The worker app's catch-all calls next() when ASSETS is null,
  // allowing these middleware to serve static files on Node.js.
  const staticDir = path.resolve(process.cwd(), 'dist', 'client')
  app.use('*', serveStatic({ root: staticDir }))

  // SPA fallback — serve index.html for all unmatched routes
  app.use('*', serveStatic({ root: staticDir, path: '/index.html' }))

  const port = parseInt(process.env.PORT || '3000')
  const server = serve({
    fetch: app.fetch,
    port,
  }, (info) => {
    console.log(`[llamenos] Server running at http://localhost:${info.port}`)
  })

  // Inject WebSocket upgrade handler
  injectWebSocket(server)

  // Graceful shutdown
  const shutdown = () => {
    console.log('[llamenos] Shutting down...')
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((err) => {
  console.error('[llamenos] Fatal error:', err)
  process.exit(1)
})
