/**
 * Pure functions extracted from IdentityService.validateSession for unit testing.
 * Session sliding-expiry renewal decision — no DB dependencies.
 */

/** Session duration: 8 hours */
export const SESSION_DURATION_MS = 8 * 60 * 60 * 1000

/** Renewal threshold: renew when less than 1 hour of session time remains */
export const RENEWAL_THRESHOLD_MS = 1 * 60 * 60 * 1000

/** Absolute max session lifetime: 7 days (H06) */
export const MAX_SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000

export type RenewalDecision =
  | { action: 'valid'; expiresAt: Date }
  | { action: 'renew'; newExpiresAt: Date }
  | { action: 'expired' }
  | { action: 'max_lifetime_exceeded' }

/**
 * Decide whether a session should be renewed, is still valid, or has expired.
 *
 * - Max lifetime exceeded (createdAt + 7 days < now): session must be deleted
 * - Expired (expiresAt < now): session should be deleted
 * - Remaining < 1h: renew to now + 8h
 * - Otherwise: still valid, no action needed
 */
export function decideSessionRenewal(
  expiresAt: Date,
  now: Date = new Date(),
  renewalThresholdMs: number = RENEWAL_THRESHOLD_MS,
  sessionDurationMs: number = SESSION_DURATION_MS,
  createdAt?: Date,
  maxLifetimeMs: number = MAX_SESSION_LIFETIME_MS,
): RenewalDecision {
  // Check absolute max lifetime first (H06)
  if (createdAt && (now.getTime() - createdAt.getTime()) >= maxLifetimeMs) {
    return { action: 'max_lifetime_exceeded' }
  }

  if (expiresAt < now) {
    return { action: 'expired' }
  }

  const remaining = expiresAt.getTime() - now.getTime()
  if (remaining < renewalThresholdMs) {
    const newExpiresAt = new Date(now.getTime() + sessionDurationMs)
    return { action: 'renew', newExpiresAt }
  }

  return { action: 'valid', expiresAt }
}
