/**
 * A tiny, real HTTP server bound to an OS-assigned local port, used to prove
 * #738/#739 end-to-end: that a configured non-default origin actually
 * receives requests from the desktop app, not just that `getApiBase()`
 * returns the right string in isolation.
 *
 * Built on Node's `http` module rather than `Bun.serve()` — even though this
 * repo runs on Bun everywhere else, Playwright's test workers run under
 * plain Node.js regardless of how the `playwright` CLI itself was invoked
 * (`bunx playwright test` still forks Node worker processes), so `Bun` is not
 * defined inside step/spec files.
 *
 * CORS is wide open here ONLY because Playwright drives this through a real
 * browser (`vite preview` on :8788) — the mock IPC layer
 * (`tests/mocks/tauri-core.ts`) performs a genuine cross-origin `fetch` to
 * prove delivery, and browsers enforce CORS on that. The real Rust
 * `net_fetch` (apps/desktop/src/net.rs) uses reqwest, a native HTTP client
 * with no CORS concept at all — production backends need no CORS
 * configuration for the packaged desktop app. This is a test-harness
 * requirement only.
 */

import { createServer, type Server } from 'node:http'

export interface CapturedRequest {
  method: string
  path: string
}

export interface TestBackendServer {
  /** Absolute origin, e.g. `http://127.0.0.1:54321` — pass through normalizeServerInput/setApiBase as-is. */
  origin: string
  requests: CapturedRequest[]
  close: () => void
}

/**
 * Starts a server that answers `/api/health` and `/api/config` like a real
 * Llámenos backend (just enough for `probeServerHealth` and `getConfig()` to
 * succeed), and records every HTTP request it receives so tests can assert
 * delivery. Resolves once the OS has actually assigned the port (`address()`
 * is `null` until the `'listening'` event fires — reading it synchronously
 * right after `.listen()` is a common Node.js footgun).
 */
export async function startTestBackendServer(): Promise<TestBackendServer> {
  const requests: CapturedRequest[] = []

  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    requests.push({ method: req.method ?? 'GET', path: url.pathname })

    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', '*')
    res.setHeader('Access-Control-Allow-Headers', '*')

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }
    if (url.pathname === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, service: 'llamenos-test-backend' }))
      return
    }
    if (url.pathname === '/api/config') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        hotlineName: 'Test Hotline',
        hotlineNumber: '',
        setupCompleted: true,
        needsBootstrap: false,
      }))
      return
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('not found')
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('failed to bind test backend server to a port')
  }

  return {
    origin: `http://127.0.0.1:${address.port}`,
    requests,
    close: () => server.close(),
  }
}
