/**
 * Constant-time string comparison to prevent timing attacks (B-M15).
 *
 * Uses crypto.timingSafeEqual under the hood. Safe for comparing
 * session tokens, HMAC digests, and other secret values.
 */
import { timingSafeEqual } from 'node:crypto'

export function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still do a constant-time comparison to avoid leaking length info
    const dummy = Buffer.from(a)
    timingSafeEqual(dummy, dummy)
    return false
  }
  return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}
