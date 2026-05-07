import type { AuthPayload, User } from '../types'
import { ed25519Verify } from '@llamenos/crypto/ffi'
import { hexToBytes, utf8ToBytes } from '@shared/encoding'
import { LABEL_DEVICE_AUTH } from '@shared/crypto-labels'
import type { IdentityService } from '../services/identity'
import { ServiceError } from '../services/settings'
import { createLogger } from './logger'

const logger = createLogger('auth')

const TOKEN_MAX_AGE_MS = 5 * 60 * 1000 // 5 minutes

export function parseAuthHeader(header: string | null): AuthPayload | null {
  if (!header?.startsWith('Bearer ')) return null
  try {
    return JSON.parse(header.slice(7))
  } catch {
    return null
  }
}

export function parseSessionHeader(header: string | null): string | null {
  if (!header?.startsWith('Session ')) return null
  return header.slice(8).trim()
}

export function validateToken(auth: AuthPayload): boolean {
  if (!auth.pubkey || !auth.timestamp || !auth.token) return false
  // Check token freshness
  const age = Date.now() - auth.timestamp
  if (age > TOKEN_MAX_AGE_MS || age < -TOKEN_MAX_AGE_MS) return false
  return true
}

/**
 * Build the canonical auth message bytes.
 * Format: `{LABEL_DEVICE_AUTH}:{pubkey_hex}:{timestamp_ms}:{METHOD}:{path}`
 *
 * MUST match exactly: packages/crypto/src/auth.rs::build_auth_message()
 */
export function buildAuthMessage(pubkey: string, timestamp: number, method: string, path: string): Uint8Array {
  return utf8ToBytes(`${LABEL_DEVICE_AUTH}:${pubkey}:${timestamp}:${method}:${path}`)
}

export function verifyAuthToken(auth: AuthPayload, method?: string, path?: string): boolean {
  if (!validateToken(auth)) return false
  if (!method || !path) return false
  try {
    const message = buildAuthMessage(auth.pubkey, auth.timestamp, method, path)
    return ed25519Verify(
      hexToBytes(auth.pubkey),
      message,
      hexToBytes(auth.token),
    )
  } catch {
    return false
  }
}

/**
 * Authenticate a request using session token or Ed25519 signature.
 */
export async function authenticateRequest(
  request: Request,
  identityService: IdentityService,
): Promise<{ pubkey: string; user: User } | null> {
  const authHeader = request.headers.get('Authorization')

  // Try session token auth first (WebAuthn-based sessions)
  const sessionToken = parseSessionHeader(authHeader)
  if (sessionToken) {
    try {
      const session = await identityService.validateSession(sessionToken)
      const user = await identityService.getUserInternal(session.pubkey)
      if (!user) return null
      if (user.active === false) return null
      return { pubkey: session.pubkey, user }
    } catch (e) {
      logger.warn('Session token validation failed', { error: e })
      return null
    }
  }

  // Fall back to Ed25519 signature auth
  const auth = parseAuthHeader(authHeader)
  if (!auth) return null
  const url = new URL(request.url)
  if (!verifyAuthToken(auth, request.method, url.pathname)) return null

  // Look up user via identity service
  try {
    const user = await identityService.getUserInternal(auth.pubkey)
    if (!user) return null
    if (user.active === false) return null
    return { pubkey: auth.pubkey, user }
  } catch (e) {
    logger.warn('User lookup failed', { error: e })
    return null
  }
}
