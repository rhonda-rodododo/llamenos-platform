import { describe, it, expect } from 'bun:test'
import {
  resolveTTL,
  validateTTLOverrides,
  emptyCleanupMetrics,
  TTL_CAPTCHA_CHALLENGE_MS,
  TTL_RATE_LIMIT_MS,
  TTL_PROVISION_ROOM_MS,
  TTL_REDEEMED_INVITE_MS,
  TTL_EXPIRED_INVITE_MS,
  TTL_WEBAUTHN_CHALLENGE_MS,
  TTL_STALE_FILE_UPLOAD_MS,
  TTL_COMPLETED_BLAST_QUEUE_MS,
  CLEANUP_ALARM_INTERVAL_MS,
  TTL_OVERRIDE_KEYS,
} from '@worker/lib/ttl'

// ---------------------------------------------------------------------------
// Constant sanity checks
// ---------------------------------------------------------------------------

describe('TTL constants', () => {
  it('captcha challenge is 5 minutes', () => {
    expect(TTL_CAPTCHA_CHALLENGE_MS).toBe(5 * 60 * 1000)
  })

  it('rate limit is 2 minutes', () => {
    expect(TTL_RATE_LIMIT_MS).toBe(2 * 60 * 1000)
  })

  it('provision room is 5 minutes', () => {
    expect(TTL_PROVISION_ROOM_MS).toBe(5 * 60 * 1000)
  })

  it('redeemed invite is 30 days', () => {
    expect(TTL_REDEEMED_INVITE_MS).toBe(30 * 24 * 60 * 60 * 1000)
  })

  it('expired invite is 7 days', () => {
    expect(TTL_EXPIRED_INVITE_MS).toBe(7 * 24 * 60 * 60 * 1000)
  })

  it('webauthn challenge is 5 minutes', () => {
    expect(TTL_WEBAUTHN_CHALLENGE_MS).toBe(5 * 60 * 1000)
  })

  it('stale file upload is 24 hours', () => {
    expect(TTL_STALE_FILE_UPLOAD_MS).toBe(24 * 60 * 60 * 1000)
  })

  it('completed blast queue is 7 days', () => {
    expect(TTL_COMPLETED_BLAST_QUEUE_MS).toBe(7 * 24 * 60 * 60 * 1000)
  })

  it('cleanup alarm interval is 15 minutes', () => {
    expect(CLEANUP_ALARM_INTERVAL_MS).toBe(15 * 60 * 1000)
  })

  it('all override keys map to correct defaults', () => {
    expect(TTL_OVERRIDE_KEYS.captchaChallenge).toBe(TTL_CAPTCHA_CHALLENGE_MS)
    expect(TTL_OVERRIDE_KEYS.rateLimit).toBe(TTL_RATE_LIMIT_MS)
    expect(TTL_OVERRIDE_KEYS.provisionRoom).toBe(TTL_PROVISION_ROOM_MS)
    expect(TTL_OVERRIDE_KEYS.redeemedInvite).toBe(TTL_REDEEMED_INVITE_MS)
    expect(TTL_OVERRIDE_KEYS.expiredInvite).toBe(TTL_EXPIRED_INVITE_MS)
    expect(TTL_OVERRIDE_KEYS.webauthnChallenge).toBe(TTL_WEBAUTHN_CHALLENGE_MS)
    expect(TTL_OVERRIDE_KEYS.staleFileUpload).toBe(TTL_STALE_FILE_UPLOAD_MS)
    expect(TTL_OVERRIDE_KEYS.completedBlastQueue).toBe(TTL_COMPLETED_BLAST_QUEUE_MS)
  })
})

// ---------------------------------------------------------------------------
// resolveTTL
// ---------------------------------------------------------------------------

describe('resolveTTL', () => {
  it('returns default when no overrides provided', () => {
    expect(resolveTTL('captchaChallenge')).toBe(TTL_CAPTCHA_CHALLENGE_MS)
  })

  it('returns default when overrides map is empty', () => {
    expect(resolveTTL('captchaChallenge', {})).toBe(TTL_CAPTCHA_CHALLENGE_MS)
  })

  it('returns override when present', () => {
    expect(resolveTTL('captchaChallenge', { captchaChallenge: 999 })).toBe(999)
  })

  it('returns override of 0 (immediate delete)', () => {
    expect(resolveTTL('captchaChallenge', { captchaChallenge: 0 })).toBe(0)
  })

  it('ignores override for a different key', () => {
    expect(resolveTTL('captchaChallenge', { rateLimit: 1 })).toBe(TTL_CAPTCHA_CHALLENGE_MS)
  })

  it('ignores non-number override', () => {
    // Override with string — should fall back to default
    expect(resolveTTL('captchaChallenge', { captchaChallenge: 'bad' as unknown as number })).toBe(TTL_CAPTCHA_CHALLENGE_MS)
  })

  it('ignores negative override', () => {
    expect(resolveTTL('captchaChallenge', { captchaChallenge: -1 })).toBe(TTL_CAPTCHA_CHALLENGE_MS)
  })
})

// ---------------------------------------------------------------------------
// validateTTLOverrides
// ---------------------------------------------------------------------------

describe('validateTTLOverrides', () => {
  it('accepts valid overrides', () => {
    expect(validateTTLOverrides({ captchaChallenge: 60000 })).toBeNull()
  })

  it('accepts 0 (immediate expiry)', () => {
    expect(validateTTLOverrides({ captchaChallenge: 0 })).toBeNull()
  })

  it('rejects unknown key', () => {
    const result = validateTTLOverrides({ unknownKey: 1000 })
    expect(result).toMatch(/Unknown TTL key/)
  })

  it('rejects non-number value', () => {
    const result = validateTTLOverrides({ captchaChallenge: 'bad' as unknown as number })
    expect(result).toMatch(/must be a non-negative number/)
  })

  it('rejects negative value', () => {
    const result = validateTTLOverrides({ captchaChallenge: -1 })
    expect(result).toMatch(/must be a non-negative number/)
  })

  it('rejects Infinity', () => {
    const result = validateTTLOverrides({ captchaChallenge: Infinity })
    expect(result).toMatch(/must be a non-negative number/)
  })

  it('rejects NaN', () => {
    const result = validateTTLOverrides({ captchaChallenge: NaN })
    expect(result).toMatch(/must be a non-negative number/)
  })

  it('rejects value exceeding 365 days', () => {
    const tooLarge = 365 * 24 * 60 * 60 * 1000 + 1
    const result = validateTTLOverrides({ captchaChallenge: tooLarge })
    expect(result).toMatch(/exceeds maximum/)
  })

  it('accepts exactly 365 days', () => {
    const exactly365 = 365 * 24 * 60 * 60 * 1000
    expect(validateTTLOverrides({ captchaChallenge: exactly365 })).toBeNull()
  })

  it('accepts multiple valid overrides at once', () => {
    expect(validateTTLOverrides({
      captchaChallenge: 60000,
      rateLimit: 30000,
      staleFileUpload: 3600000,
    })).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// emptyCleanupMetrics
// ---------------------------------------------------------------------------

describe('emptyCleanupMetrics', () => {
  it('returns all counters at 0 and lastCleanupAt null', () => {
    const metrics = emptyCleanupMetrics()
    expect(metrics.captchaChallengesDeleted).toBe(0)
    expect(metrics.rateLimitEntriesDeleted).toBe(0)
    expect(metrics.expiredSessionsDeleted).toBe(0)
    expect(metrics.provisionRoomsDeleted).toBe(0)
    expect(metrics.expiredInvitesCleaned).toBe(0)
    expect(metrics.webauthnChallengesDeleted).toBe(0)
    expect(metrics.staleFileUploadsDeleted).toBe(0)
    expect(metrics.completedBlastQueuesDeleted).toBe(0)
    expect(metrics.lastCleanupAt).toBeNull()
  })

  it('returns independent objects on successive calls', () => {
    const m1 = emptyCleanupMetrics()
    const m2 = emptyCleanupMetrics()
    m1.captchaChallengesDeleted = 5
    expect(m2.captchaChallengesDeleted).toBe(0)
  })
})
