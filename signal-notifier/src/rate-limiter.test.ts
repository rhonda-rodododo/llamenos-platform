import { describe, expect, test } from 'vitest'
import { RateLimiter } from './rate-limiter'

describe('RateLimiter', () => {
  test('allows requests within limit', () => {
    const limiter = new RateLimiter(3, 60_000)
    expect(limiter.check('key1')).toBe(true)
    expect(limiter.check('key1')).toBe(true)
    expect(limiter.check('key1')).toBe(true)
  })

  test('blocks requests over limit', () => {
    const limiter = new RateLimiter(2, 60_000)
    expect(limiter.check('key1')).toBe(true)
    expect(limiter.check('key1')).toBe(true)
    expect(limiter.check('key1')).toBe(false)
  })

  test('different keys are independent', () => {
    const limiter = new RateLimiter(1, 60_000)
    expect(limiter.check('a')).toBe(true)
    expect(limiter.check('b')).toBe(true)
    expect(limiter.check('a')).toBe(false)
    expect(limiter.check('b')).toBe(false)
  })

  test('expired entries are removed', async () => {
    const limiter = new RateLimiter(1, 50)
    expect(limiter.check('key1')).toBe(true)
    expect(limiter.check('key1')).toBe(false)
    await new Promise((r) => setTimeout(r, 60))
    expect(limiter.check('key1')).toBe(true)
  })

  test('reset clears a specific key', () => {
    const limiter = new RateLimiter(1, 60_000)
    limiter.check('key1')
    expect(limiter.check('key1')).toBe(false)
    limiter.reset('key1')
    expect(limiter.check('key1')).toBe(true)
  })

  test('resetAll clears all keys', () => {
    const limiter = new RateLimiter(1, 60_000)
    limiter.check('a')
    limiter.check('b')
    limiter.resetAll()
    expect(limiter.check('a')).toBe(true)
    expect(limiter.check('b')).toBe(true)
  })

  test('expired entries are trimmed from the map on next access', async () => {
    const limiter = new RateLimiter(5, 50)
    // Fill window to limit for key
    for (let i = 0; i < 5; i++) limiter.check('key1')
    expect(limiter.check('key1')).toBe(false)

    // Wait for window to expire
    await new Promise((r) => setTimeout(r, 60))

    // Next check: expired entries are trimmed, request allowed again
    expect(limiter.check('key1')).toBe(true)
    // Map entry should now contain exactly 1 fresh timestamp, not the 5 stale ones
    const stored = (limiter as any).windows.get('key1') as number[]
    expect(stored).toHaveLength(1)
    expect(stored[0]).toBeGreaterThanOrEqual(Date.now() - 10)
  })

  test('fully-expired key is evicted from map on next access', async () => {
    const limiter = new RateLimiter(5, 50)
    limiter.check('evict-me')
    expect((limiter as any).windows.has('evict-me')).toBe(true)

    // Wait for entry to expire, then trigger access — should evict then re-insert
    await new Promise((r) => setTimeout(r, 60))
    limiter.check('evict-me')
    // After eviction + re-insert there is exactly 1 fresh entry (not the old one)
    const stored = (limiter as any).windows.get('evict-me') as number[]
    expect(stored).toHaveLength(1)
  })
})
