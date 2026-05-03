import { describe, it, expect, beforeEach, afterEach, jest } from 'bun:test'
import { TokenBucketRateLimiter } from '@worker/lib/rate-limiter'

describe('TokenBucketRateLimiter', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('starts with full burst capacity', () => {
    const limiter = new TokenBucketRateLimiter(10, 20)
    expect(limiter.availableTokens).toBe(20)
  })

  it('exhausts tokens after burst capacity consumed', () => {
    const limiter = new TokenBucketRateLimiter(5, 10)

    for (let i = 0; i < 10; i++) {
      expect(limiter.tryConsume()).toBe(true)
    }
    // 11th should fail
    expect(limiter.tryConsume()).toBe(false)
  })

  it('refills tokens based on elapsed time', () => {
    const limiter = new TokenBucketRateLimiter(10, 20)

    // Consume all tokens
    for (let i = 0; i < 20; i++) {
      limiter.tryConsume()
    }
    expect(limiter.tryConsume()).toBe(false)

    // Advance 1 second — should add 10 tokens
    jest.advanceTimersByTime(1000)
    expect(limiter.availableTokens).toBe(10)
    expect(limiter.tryConsume()).toBe(true)
  })

  it('waitForToken resolves after delay when exhausted', async () => {
    const limiter = new TokenBucketRateLimiter(10, 10)

    // Drain all tokens
    for (let i = 0; i < 10; i++) {
      limiter.tryConsume()
    }

    const waitPromise = limiter.waitForToken()

    // Advance time to allow refill
    jest.advanceTimersByTime(200)

    const waited = await waitPromise
    expect(waited).toBeGreaterThan(0)
  })

  it('defaults burst to 2x tokensPerSecond', () => {
    const limiter = TokenBucketRateLimiter.create(5)
    expect(limiter.availableTokens).toBe(10) // 5 * 2

    // Can consume all 10
    for (let i = 0; i < 10; i++) {
      expect(limiter.tryConsume()).toBe(true)
    }
    expect(limiter.tryConsume()).toBe(false)
  })
})
