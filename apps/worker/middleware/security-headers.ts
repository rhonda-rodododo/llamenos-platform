import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../types'

export const securityHeaders = createMiddleware<AppEnv>(async (c, next) => {
  await next()

  const host = new URL(c.req.url).host
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('X-Frame-Options', 'DENY')
  c.header('Referrer-Policy', 'no-referrer')
  c.header('Permissions-Policy', 'camera=(), microphone=(self), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), magnetometer=(), accelerometer=(), gyroscope=(), picture-in-picture=()')
  c.header('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload')
  c.header('Cross-Origin-Opener-Policy', 'same-origin')
  c.header('Cross-Origin-Resource-Policy', 'same-origin')
  c.header('X-Permitted-Cross-Domain-Policies', 'none')
  // style-src 'unsafe-inline' is required by Tailwind CSS which injects runtime styles.
  // Nonce-based CSP for styles is not feasible with Tailwind's JIT engine.
  // This weakens XSS defense-in-depth for style injection only; script-src remains strict.
  c.header('Content-Security-Policy', `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' wss://${host}; img-src 'self' data:; font-src 'self'; media-src 'self' blob:; worker-src 'self'; manifest-src 'self'; object-src 'none'; frame-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests;`)
})
