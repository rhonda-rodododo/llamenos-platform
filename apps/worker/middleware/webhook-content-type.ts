import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../types'

const ALLOWED_CONTENT_TYPES: Record<string, string[]> = {
  twilio: ['application/x-www-form-urlencoded'],
  signalwire: ['application/x-www-form-urlencoded'],
  vonage: ['application/json'],
  telnyx: ['application/json'],
  plivo: ['application/x-www-form-urlencoded'],
  bandwidth: ['application/json'],
  signal: ['application/json'],
  whatsapp: ['application/json'],
  telegram: ['application/json'],
  rcs: ['application/json'],
}

export function enforceWebhookContentType(provider: string) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const contentType = c.req.header('content-type')?.split(';')[0]?.trim()
    const allowed = ALLOWED_CONTENT_TYPES[provider]
    if (allowed && contentType && !allowed.includes(contentType)) {
      return c.text('Unsupported Media Type', 415)
    }
    return next()
  })
}
