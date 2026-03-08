import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../types'
import { CURRENT_API_VERSION, MIN_API_VERSION, checkClientVersion } from '../lib/api-versions'

/**
 * API version negotiation middleware (Epic 288).
 *
 * - Reads `X-API-Version` request header (integer)
 * - Always sets `X-Min-Version` and `X-Current-Version` response headers
 * - Returns 426 Upgrade Required if client version < MIN_API_VERSION
 * - Exempt paths: /api/config, /api/config/verify (clients need config to know about updates)
 */

/** Paths exempt from version enforcement (always accessible) */
const EXEMPT_PREFIXES = ['/config', '/config/verify', '/health', '/metrics']

function isExempt(path: string): boolean {
  return EXEMPT_PREFIXES.some(prefix => path === prefix || path.startsWith(prefix + '/'))
}

export const apiVersion = createMiddleware<AppEnv>(async (c, next) => {
  // Always set version response headers so clients can detect version drift
  c.header('X-Min-Version', String(MIN_API_VERSION))
  c.header('X-Current-Version', String(CURRENT_API_VERSION))

  // Skip enforcement for exempt paths
  if (isExempt(c.req.path)) {
    await next()
    return
  }

  const clientVersionHeader = c.req.header('X-API-Version')
  if (clientVersionHeader) {
    const clientVersion = parseInt(clientVersionHeader, 10)
    if (!isNaN(clientVersion)) {
      const result = checkClientVersion(clientVersion)
      if (result) {
        return c.json(
          {
            error: 'Upgrade Required',
            message: 'Your app version is too old. Please update to continue.',
            minVersion: result.minVersion,
            currentVersion: result.currentVersion,
          },
          426,
        )
      }
    }
  }

  await next()
})
