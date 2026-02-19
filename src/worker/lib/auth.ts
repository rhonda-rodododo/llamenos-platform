import type { AuthPayload, Env, Volunteer, ServerSession } from '../types'
import { schnorr } from '@noble/curves/secp256k1.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { hexToBytes } from '@noble/hashes/utils.js'
import { utf8ToBytes } from '@noble/ciphers/utils.js'

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

export async function verifyAuthToken(auth: AuthPayload): Promise<boolean> {
  if (!validateToken(auth)) return false
  try {
    // Reconstruct the signed message
    const message = `llamenos:auth:${auth.pubkey}:${auth.timestamp}`
    const messageHash = sha256(utf8ToBytes(message))
    // Verify Schnorr signature (BIP-340) against the x-only pubkey
    return schnorr.verify(hexToBytes(auth.token), messageHash, hexToBytes(auth.pubkey))
  } catch {
    return false
  }
}

export async function authenticateRequest(
  request: Request,
  identityDO: { fetch(req: Request): Promise<Response> }
): Promise<{ pubkey: string; volunteer: Volunteer } | null> {
  const authHeader = request.headers.get('Authorization')

  // Try session token auth first (WebAuthn-based sessions)
  const sessionToken = parseSessionHeader(authHeader)
  if (sessionToken) {
    const sessionRes = await identityDO.fetch(new Request(`http://do/sessions/validate/${sessionToken}`))
    if (!sessionRes.ok) return null
    const session = await sessionRes.json() as ServerSession
    // Look up volunteer
    const volRes = await identityDO.fetch(new Request('http://do/volunteer/' + session.pubkey))
    if (!volRes.ok) return null
    const volunteer = await volRes.json() as Volunteer
    return { pubkey: session.pubkey, volunteer }
  }

  // Fall back to Schnorr signature auth
  const auth = parseAuthHeader(authHeader)
  if (!auth) return null
  if (!(await verifyAuthToken(auth))) return null

  // Look up volunteer in identity DO
  const res = await identityDO.fetch(new Request('http://do/volunteer/' + auth.pubkey))
  if (!res.ok) return null
  const volunteer = await res.json() as Volunteer
  return { pubkey: auth.pubkey, volunteer }
}
