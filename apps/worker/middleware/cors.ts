import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../types'

/** Explicit origin allowlist — only these origins receive CORS headers. */
const ALLOWED_ORIGINS = new Set([
  'https://app.llamenos.org',
  'https://demo.llamenos-hotline.com',
  'tauri://localhost',
  'https://tauri.localhost',
])

function isAllowedOrigin(origin: string, env: { ENVIRONMENT: string }): boolean {
  if (ALLOWED_ORIGINS.has(origin)) return true
  // Development origins
  if (env.ENVIRONMENT === 'development') {
    if (origin === 'http://localhost:5173' || origin === 'http://localhost:1420') return true
  }
  return false
}

export const cors = createMiddleware<AppEnv>(async (c, next) => {
  const requestOrigin = c.req.header('Origin') || ''
  const allowed = isAllowedOrigin(requestOrigin, c.env)
  const allowedOrigin = allowed ? requestOrigin : ''

  if (c.req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        ...(allowedOrigin ? { 'Access-Control-Allow-Origin': allowedOrigin } : {}),
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Version',
        'Vary': 'Origin',
      },
    })
  }

  await next()

  if (allowedOrigin) {
    c.header('Access-Control-Allow-Origin', allowedOrigin)
    // Expose version negotiation headers to client JS (Epic 288)
    c.header('Access-Control-Expose-Headers', 'X-Min-Version, X-Current-Version')
  }
  c.header('Vary', 'Origin')
})
