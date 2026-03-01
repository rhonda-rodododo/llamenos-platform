import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../types'

export const cors = createMiddleware<AppEnv>(async (c, next) => {
  const allowedOrigin = c.env.ENVIRONMENT === 'development'
    ? 'http://localhost:5173'
    : new URL(c.req.url).origin.replace(/^http:/, 'https:')

  if (c.req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Vary': 'Origin',
      },
    })
  }

  await next()

  c.header('Access-Control-Allow-Origin', allowedOrigin)
  c.header('Vary', 'Origin')
})
