import type { AuthPayload, User } from '../types'
import { schnorr } from '@noble/curves/secp256k1.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { hexToBytes } from '@noble/hashes/utils.js'
import { utf8ToBytes } from '@noble/ciphers/utils.js'
import { AUTH_PREFIX } from '@shared/crypto-labels'
import type { IdentityService } from '../services/identity'
import { ServiceError } from '../services/settings'

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

export async function verifyAuthToken(auth: AuthPayload, method?: string, path?: string): Promise<boolean> {
  if (!validateToken(auth)) return false
  if (!method || !path) return false // method+path binding is required
  try {
    const boundMessage = `${AUTH_PREFIX}${auth.pubkey}:${auth.timestamp}:${method}:${path}`
    const boundHash = sha256(utf8ToBytes(boundMessage))
    return schnorr.verify(hexToBytes(auth.token), boundHash, hexToBytes(auth.pubkey))
  } catch {
    return false
  }
}

/**
 * Authenticate a request using session token or Schnorr signature.
 * Uses the IdentityService directly instead of DO stubs.
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
    } catch {
      return null
    }
  }

  // Fall back to Schnorr signature auth
  const auth = parseAuthHeader(authHeader)
  if (!auth) return null
  const url = new URL(request.url)
  if (!(await verifyAuthToken(auth, request.method, url.pathname))) return null

  // Look up volunteer via identity service
  try {
    const user = await identityService.getUserInternal(auth.pubkey)
    if (!user) return null
    if (user.active === false) return null
    return { pubkey: auth.pubkey, user }
  } catch {
    return null
  }
}

