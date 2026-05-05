/**
 * Unit tests for retry utilities.
 *
 * Covers: withRetry, isRetryableError, assertOkOrRetryable, RetryableError.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { withRetry, isRetryableError, assertOkOrRetryable, RetryableError } from './retry'

// ---------------------------------------------------------------------------
// RetryableError
// ---------------------------------------------------------------------------

describe('RetryableError', () => {
  it('has name "RetryableError"', () => {
    const e = new RetryableError('fail')
    expect(e.name).toBe('RetryableError')
  })

  it('is an instance of Error', () => {
    expect(new RetryableError('x')).toBeInstanceOf(Error)
  })

  it('has retryable=true', () => {
    expect(new RetryableError('x').retryable).toBe(true)
  })

  it('stores statusCode when provided', () => {
    const e = new RetryableError('rate limit', 429)
    expect(e.statusCode).toBe(429)
  })

  it('statusCode is undefined when not provided', () => {
    expect(new RetryableError('x').statusCode).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// isRetryableError
// ---------------------------------------------------------------------------

describe('isRetryableError', () => {
  it('returns true for RetryableError instances', () => {
    expect(isRetryableError(new RetryableError('retry me'))).toBe(true)
  })

  it('returns true for fetch TypeError', () => {
    expect(isRetryableError(new TypeError('Failed to fetch'))).toBe(true)
  })

  it('returns true for 429 error message', () => {
    expect(isRetryableError(new Error('HTTP 429 too many requests'))).toBe(true)
  })

  it('returns true for "rate limit" in message', () => {
    expect(isRetryableError(new Error('rate limit exceeded'))).toBe(true)
  })

  it('returns true for 502/503/504 error messages', () => {
    expect(isRetryableError(new Error('got 502'))).toBe(true)
    expect(isRetryableError(new Error('503 service unavailable'))).toBe(true)
    expect(isRetryableError(new Error('504 gateway timeout'))).toBe(true)
  })

  it('returns true for "bad gateway" message', () => {
    expect(isRetryableError(new Error('bad gateway'))).toBe(true)
  })

  it('returns true for timeout messages', () => {
    expect(isRetryableError(new Error('connection timeout'))).toBe(true)
    expect(isRetryableError(new Error('ECONNRESET'))).toBe(true)
    expect(isRetryableError(new Error('socket hang up'))).toBe(true)
  })

  it('returns false for 4xx client error message', () => {
    expect(isRetryableError(new Error('4xx client error'))).toBe(false)
  })

  it('returns true for object with status 429', () => {
    expect(isRetryableError({ status: 429 })).toBe(true)
  })

  it('returns true for object with status 500', () => {
    expect(isRetryableError({ status: 500 })).toBe(true)
  })

  it('returns false for object with status 400', () => {
    expect(isRetryableError({ status: 400 })).toBe(false)
  })

  it('returns false for object with status 404', () => {
    expect(isRetryableError({ status: 404 })).toBe(false)
  })

  it('returns true for unknown error types (safe default)', () => {
    expect(isRetryableError(new Error('some unknown error'))).toBe(true)
    expect(isRetryableError('string error')).toBe(true)
    expect(isRetryableError(null)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// assertOkOrRetryable
// ---------------------------------------------------------------------------

describe('assertOkOrRetryable', () => {
  it('does not throw for ok responses (2xx)', () => {
    expect(() => assertOkOrRetryable(new Response(null, { status: 200 }), 'ctx')).not.toThrow()
    expect(() => assertOkOrRetryable(new Response(null, { status: 201 }), 'ctx')).not.toThrow()
  })

  it('throws RetryableError for 429', () => {
    expect(() => assertOkOrRetryable(new Response(null, { status: 429 }), 'test'))
      .toThrow(RetryableError)
  })

  it('throws RetryableError for 500+', () => {
    expect(() => assertOkOrRetryable(new Response(null, { status: 503 }), 'svc'))
      .toThrow(RetryableError)
  })

  it('throws plain Error for 400 (not retryable)', () => {
    expect(() => assertOkOrRetryable(new Response(null, { status: 400 }), 'ctx'))
      .toThrow(Error)
    // Should NOT be a RetryableError
    try {
      assertOkOrRetryable(new Response(null, { status: 400 }), 'ctx')
    } catch (e) {
      expect(e).not.toBeInstanceOf(RetryableError)
    }
  })

  it('error message includes context label', () => {
    try {
      assertOkOrRetryable(new Response(null, { status: 503 }), 'my-service')
    } catch (e) {
      expect((e as Error).message).toContain('my-service')
    }
  })

  it('error message includes status code', () => {
    try {
      assertOkOrRetryable(new Response(null, { status: 404 }), 'ctx')
    } catch (e) {
      expect((e as Error).message).toContain('404')
    }
  })
})

// ---------------------------------------------------------------------------
// withRetry
// ---------------------------------------------------------------------------

describe('withRetry', () => {
  it('returns result when function succeeds on first attempt', async () => {
    const fn = vi.fn().mockResolvedValue('success')
    expect(await withRetry(fn)).toBe('success')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries and succeeds on second attempt', async () => {
    let calls = 0
    const fn = vi.fn().mockImplementation(async () => {
      calls++
      if (calls === 1) throw new Error('temporary failure')
      return 'ok'
    })
    const result = await withRetry(fn, { baseDelayMs: 0 })
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('throws after maxAttempts exhausted', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always fails'))
    await expect(withRetry(fn, { maxAttempts: 3, baseDelayMs: 0 })).rejects.toThrow('always fails')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('does not retry non-retryable errors', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('client error'))
    const isRetryable = vi.fn().mockReturnValue(false)
    await expect(withRetry(fn, { isRetryable, baseDelayMs: 0 })).rejects.toThrow('client error')
    expect(fn).toHaveBeenCalledTimes(1)
    expect(isRetryable).toHaveBeenCalledTimes(1)
  })

  it('calls onRetry callback with attempt number', async () => {
    let calls = 0
    const fn = vi.fn().mockImplementation(async () => {
      calls++
      if (calls < 3) throw new Error('fail')
      return 'done'
    })
    const onRetry = vi.fn()
    await withRetry(fn, { maxAttempts: 3, baseDelayMs: 0, onRetry })
    expect(onRetry).toHaveBeenCalledTimes(2)
    expect(onRetry.mock.calls[0][0]).toBe(1) // first retry, attempt=1
    expect(onRetry.mock.calls[1][0]).toBe(2)
  })

  it('defaults to 3 attempts', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'))
    await expect(withRetry(fn, { baseDelayMs: 0 })).rejects.toThrow()
    expect(fn).toHaveBeenCalledTimes(3)
  })
})
