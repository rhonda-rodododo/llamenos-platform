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
})
