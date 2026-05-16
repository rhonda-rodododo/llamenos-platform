/**
 * Per-user sliding-window rate limiting middleware for Hono routes.
 *
 * In-memory store — suitable for single-process deployments.
 * For multi-process, replace with Redis-backed implementation.
 */

import type { MiddlewareHandler } from 'hono'
import type { AppEnv } from '../types'

interface RateLimitEntry {
  timestamps: number[]
}

const store = new Map<string, RateLimitEntry>()

// Periodic cleanup of expired entries (every 5 minutes)
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of store) {
    // Remove if all timestamps are older than 1 hour
    if (entry.timestamps.every(ts => now - ts > 3_600_000)) {
      store.delete(key)
    }
  }
}, 300_000)

/**
 * Create a rate limiting middleware.
 *
 * @param maxRequests - Maximum requests allowed in the window
 * @param windowMs - Time window in milliseconds
 * @param keyPrefix - Prefix for the rate limit key (combined with user pubkey)
 */
export function rateLimit(
  maxRequests: number,
  windowMs: number,
  keyPrefix: string,
): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const pubkey = c.get('pubkey')
    if (!pubkey) {
      // No authenticated user — skip rate limiting
      return next()
    }

    const key = `${keyPrefix}:${pubkey}`
    const now = Date.now()
    const entry = store.get(key) ?? { timestamps: [] }

    // Remove timestamps outside the window
    entry.timestamps = entry.timestamps.filter(ts => now - ts < windowMs)

    if (entry.timestamps.length >= maxRequests) {
      const oldestInWindow = entry.timestamps[0]
      const retryAfterMs = windowMs - (now - oldestInWindow)
      const retryAfterSec = Math.ceil(retryAfterMs / 1000)

      c.header('Retry-After', String(retryAfterSec))
      return c.json(
        { error: 'Rate limit exceeded', retryAfterSeconds: retryAfterSec },
        429,
      )
    }

    entry.timestamps.push(now)
    store.set(key, entry)

    return next()
  }
}
