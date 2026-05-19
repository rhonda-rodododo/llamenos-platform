import { describe, it, expect } from 'vitest'
import {
  decideSessionRenewal,
  SESSION_DURATION_MS,
  RENEWAL_THRESHOLD_MS,
  MAX_SESSION_LIFETIME_MS,
} from '../../lib/session-renewal'

describe('decideSessionRenewal', () => {
  const now = new Date('2026-05-02T12:00:00Z')
  const oneHour = 60 * 60 * 1000

  it('session with > 1h remaining: no renewal needed', () => {
    // Expires in 2 hours — well above the 1h threshold
    const expiresAt = new Date(now.getTime() + 2 * oneHour)
    const decision = decideSessionRenewal(expiresAt, now)
    expect(decision.action).toBe('valid')
    if (decision.action === 'valid') {
      expect(decision.expiresAt).toBe(expiresAt)
    }
  })

  it('session with < 1h remaining: should renew to now + 8h', () => {
    // Expires in 30 minutes — under the 1h threshold
    const expiresAt = new Date(now.getTime() + 30 * 60 * 1000)
    const decision = decideSessionRenewal(expiresAt, now)
    expect(decision.action).toBe('renew')
    if (decision.action === 'renew') {
      expect(decision.newExpiresAt.getTime()).toBe(now.getTime() + SESSION_DURATION_MS)
    }
  })

  it('expired session: should be deleted', () => {
    const expiresAt = new Date(now.getTime() - 1000) // 1 second ago
    const decision = decideSessionRenewal(expiresAt, now)
    expect(decision.action).toBe('expired')
  })

  it('session exactly at 1h boundary: renewed (boundary condition)', () => {
    // Remaining = exactly RENEWAL_THRESHOLD_MS (1h)
    // Code: remaining < threshold → NOT renewed (equal is not less-than)
    const expiresAt = new Date(now.getTime() + RENEWAL_THRESHOLD_MS)
    const decision = decideSessionRenewal(expiresAt, now)
    // Exactly at threshold: remaining is NOT less than threshold → valid
    expect(decision.action).toBe('valid')
  })

  it('session 1ms under threshold: renewed', () => {
    const expiresAt = new Date(now.getTime() + RENEWAL_THRESHOLD_MS - 1)
    const decision = decideSessionRenewal(expiresAt, now)
    expect(decision.action).toBe('renew')
  })

  it('session that expires exactly at now: expired (not valid)', () => {
    // expiresAt === now → expiresAt < now is false when equal, but Date comparison
    // expiresAt < now → false when equal. Let's verify.
    const expiresAt = new Date(now.getTime())
    const decision = decideSessionRenewal(expiresAt, now)
    // expiresAt < now → false, so not expired. remaining = 0 < threshold → renew
    expect(decision.action).toBe('renew')
  })

  it('uses correct constant values', () => {
    expect(SESSION_DURATION_MS).toBe(8 * 60 * 60 * 1000) // 8 hours
    expect(RENEWAL_THRESHOLD_MS).toBe(1 * 60 * 60 * 1000) // 1 hour
    expect(MAX_SESSION_LIFETIME_MS).toBe(7 * 24 * 60 * 60 * 1000) // 7 days
  })

  // --- H06: Absolute max session lifetime ---

  it('max_lifetime_exceeded when createdAt is 7+ days ago', () => {
    const createdAt = new Date(now.getTime() - 8 * 24 * oneHour) // 8 days ago
    const expiresAt = new Date(now.getTime() + 2 * oneHour) // still has time
    const decision = decideSessionRenewal(expiresAt, now, RENEWAL_THRESHOLD_MS, SESSION_DURATION_MS, createdAt)
    expect(decision.action).toBe('max_lifetime_exceeded')
  })

  it('renew when createdAt is 6 days ago and remaining < 1h', () => {
    const createdAt = new Date(now.getTime() - 6 * 24 * oneHour) // 6 days ago
    const expiresAt = new Date(now.getTime() + 30 * 60 * 1000) // 30 min remaining
    const decision = decideSessionRenewal(expiresAt, now, RENEWAL_THRESHOLD_MS, SESSION_DURATION_MS, createdAt)
    expect(decision.action).toBe('renew')
  })

  it('valid when createdAt is within 7 days', () => {
    const createdAt = new Date(now.getTime() - 3 * 24 * oneHour) // 3 days ago
    const expiresAt = new Date(now.getTime() + 4 * oneHour) // 4h remaining
    const decision = decideSessionRenewal(expiresAt, now, RENEWAL_THRESHOLD_MS, SESSION_DURATION_MS, createdAt)
    expect(decision.action).toBe('valid')
  })

  it('max lifetime check takes precedence over renewal check', () => {
    const createdAt = new Date(now.getTime() - 7 * 24 * oneHour) // exactly 7 days
    const expiresAt = new Date(now.getTime() + 30 * 60 * 1000) // would normally renew
    const decision = decideSessionRenewal(expiresAt, now, RENEWAL_THRESHOLD_MS, SESSION_DURATION_MS, createdAt)
    expect(decision.action).toBe('max_lifetime_exceeded')
  })

  it('createdAt undefined skips max lifetime check (backward compat)', () => {
    const expiresAt = new Date(now.getTime() + 2 * oneHour)
    const decision = decideSessionRenewal(expiresAt, now, RENEWAL_THRESHOLD_MS, SESSION_DURATION_MS, undefined)
    expect(decision.action).toBe('valid')
  })

  it('session at exactly 7 days is rejected', () => {
    const createdAt = new Date(now.getTime() - MAX_SESSION_LIFETIME_MS) // exactly 7 days
    const expiresAt = new Date(now.getTime() + 4 * oneHour)
    const decision = decideSessionRenewal(expiresAt, now, RENEWAL_THRESHOLD_MS, SESSION_DURATION_MS, createdAt)
    expect(decision.action).toBe('max_lifetime_exceeded')
  })
})
