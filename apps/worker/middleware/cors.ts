import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../types'

/** Tauri origins are always allowed (desktop client). */
const TAURI_ORIGINS = new Set([
  'tauri://localhost',
  'https://tauri.localhost',
])

/**
 * Build the allowed origins set from env config.
 *
 * When CORS_ALLOWED_ORIGINS is set (comma-separated), those origins are used
 * instead of the hardcoded production defaults. Tauri origins always included.
 */
function buildAllowedOrigins(env: { CORS_ALLOWED_ORIGINS?: string }): Set<string> {
  const base = new Set(TAURI_ORIGINS)
  if (env.CORS_ALLOWED_ORIGINS) {
    for (const origin of env.CORS_ALLOWED_ORIGINS.split(',')) {
      const trimmed = origin.trim()
      if (trimmed) base.add(trimmed)
    }
  } else {
    base.add('https://app.llamenos.org')
    base.add('https://demo.llamenos-hotline.com')
  }
  return base
}

function isAllowedOrigin(
  origin: string,
  env: { ENVIRONMENT: string; CORS_ALLOWED_ORIGINS?: string },
): boolean {
  if (buildAllowedOrigins(env).has(origin)) return true
  if (env.ENVIRONMENT === 'development' && !env.CORS_ALLOWED_ORIGINS) {
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
    c.header('Access-Control-Expose-Headers', 'X-Min-Version, X-Current-Version')
  }
  c.header('Vary', 'Origin')
})
