/**
 * requireFreshAuth — blocks session-token auth for sensitive operations.
 *
 * For operations like account lockdown, proof of current device key possession
 * is required. Session tokens can be stolen or long-lived. A Schnorr-signed
 * request proves the user's device key is still in their possession at the
 * moment of the request.
 *
 * Usage: apply BEFORE route handlers that require elevated auth.
 *
 * When session token auth is detected (c.get('sessionToken') is set),
 * this middleware returns 401 ELEVATED_AUTH_REQUIRED. Clients must
 * re-authenticate using a fresh Ed25519/Schnorr signature.
 */
import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../types'

export const requireFreshAuth = createMiddleware<AppEnv>(async (c, next) => {
  const sessionToken = c.get('sessionToken')
  if (sessionToken) {
    return c.json(
      {
        error: 'This action requires re-authentication. Sign a fresh request with your device key.',
        code: 'ELEVATED_AUTH_REQUIRED',
      },
      401,
    )
  }
  await next()
})
