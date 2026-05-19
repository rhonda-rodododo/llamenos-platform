/**
 * PostgreSQL-backed fixed-window rate limiting middleware (Epic A / C03).
 *
 * Replaces the in-memory Map with atomic INSERT ... ON CONFLICT upsert
 * via SettingsService.checkApiRateLimit(). State persists across restarts.
 */

import type { MiddlewareHandler } from 'hono'
import type { AppEnv } from '../types'
import { createLogger } from '../lib/logger'

const log = createLogger('rate-limit')

export type RateLimitTier = 'strict' | 'write' | 'read' | 'webhook' | 'unlimited'

export const RATE_LIMIT_TIERS: Record<Exclude<RateLimitTier, 'unlimited'>, { maxRequests: number; windowMs: number }> = {
  strict:  { maxRequests: 5,   windowMs: 60_000 },
  write:   { maxRequests: 30,  windowMs: 60_000 },
  read:    { maxRequests: 120, windowMs: 60_000 },
  webhook: { maxRequests: 300, windowMs: 60_000 },
}

function extractIp(c: { req: { header(name: string): string | undefined } }): string {
  return c.req.header('CF-Connecting-IP')
    || c.req.header('X-Forwarded-For')?.split(',')[0]?.trim()
    || 'unknown'
}

/**
 * Create a rate limiting middleware for the given tier.
 *
 * - `strict` and `webhook` tiers key by IP (no auth required)
 * - `write` and `read` tiers key by authenticated pubkey
 * - `unlimited` returns a no-op middleware
 */
export function rateLimit(tier: RateLimitTier): MiddlewareHandler<AppEnv> {
  if (tier === 'unlimited') {
    return async (_c, next) => next()
  }

  const config = RATE_LIMIT_TIERS[tier]

  return async (c, next) => {
    // Skip rate limiting in development/test environments — BDD and E2E tests
    // make many rapid API calls for setup that would hit strict limits.
    // Production rate limiting is unaffected.
    if (c.env?.ENVIRONMENT === 'development') {
      return next()
    }

    // Determine key: IP-based for strict/webhook, pubkey-based for write/read
    let identifier: string | undefined
    if (tier === 'strict' || tier === 'webhook') {
      identifier = extractIp(c)
    } else {
      identifier = c.get('pubkey')
      if (!identifier) {
        // No authenticated user on an authenticated tier — skip (auth middleware will reject)
        return next()
      }
    }

    const key = `${tier}:${identifier}`

    try {
      const services = c.get('services')
      const result = await services.settings.checkApiRateLimit(key, config.maxRequests, config.windowMs)

      if (result.limited) {
        c.header('Retry-After', String(result.retryAfterSeconds))
        return c.json(
          { error: 'Rate limit exceeded', retryAfterSeconds: result.retryAfterSeconds },
          429,
        )
      }
    } catch (err) {
      // Fail open — rate limiting is defense-in-depth, not primary auth
      log.error('Rate limit check failed, allowing request', { tier, error: String(err) })
    }

    return next()
  }
}
