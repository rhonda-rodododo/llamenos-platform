import { describe, it, expect } from 'bun:test'
import { withRetry, isRetryableError, assertOkOrRetryable, RetryableError } from '@worker/lib/retry'

// Use baseDelayMs: 0 / maxDelayMs: 0 throughout so tests don't sleep.

describe('withRetry', () => {
  it('returns the result on first success', async () => {
    const result = await withRetry(() => Promise.resolve('ok'), { baseDelayMs: 0 })
    expect(result).toBe('ok')
  })

  it('retries and succeeds after transient failures', async () => {
    let attempts = 0
    const result = await withRetry(
      async () => {
        attempts++
        if (attempts < 3) throw new Error('transient')
        return 'success'
      },
      { baseDelayMs: 0, maxDelayMs: 0 },
    )
    expect(result).toBe('success')
    expect(attempts).toBe(3)
  })

  it('throws after exhausting maxAttempts', async () => {
    let attempts = 0
    await expect(
      withRetry(
        async () => {
          attempts++
          throw new Error('always fails')
        },
        { maxAttempts: 3, baseDelayMs: 0, maxDelayMs: 0 },
      ),
    ).rejects.toThrow('always fails')
    expect(attempts).toBe(3)
  })

  it('throws immediately for non-retryable errors', async () => {
    let attempts = 0
    await expect(
      withRetry(
        async () => {
          attempts++
          throw new Error('client error')
        },
        { isRetryable: () => false, baseDelayMs: 0 },
      ),
    ).rejects.toThrow('client error')
    expect(attempts).toBe(1)
  })

  it('reports exponential delays to onRetry (no jitter)', async () => {
    const delays: number[] = []
    await withRetry(
      async () => { throw new Error('fail') },
      {
        maxAttempts: 4,
        baseDelayMs: 100,
        maxDelayMs: 10000,
        jitterFactor: 0,
        onRetry: (_attempt, _err, delay) => delays.push(delay),
      },
    ).catch(() => {})

    // delay[0] = 100 * 2^0 = 100, delay[1] = 100 * 2^1 = 200, delay[2] = 100 * 2^2 = 400
    expect(delays).toEqual([100, 200, 400])
  })

  it('caps delay at maxDelayMs', async () => {
    const delays: number[] = []
    await withRetry(
      async () => { throw new Error('fail') },
      {
        maxAttempts: 4,
        baseDelayMs: 1000,
        maxDelayMs: 500,
        jitterFactor: 0,
        onRetry: (_attempt, _err, delay) => delays.push(delay),
      },
    ).catch(() => {})

    expect(delays.every(d => d <= 500)).toBe(true)
  })

  it('calls onRetry with the attempt number and error', async () => {
    const calls: Array<{ attempt: number; error: Error }> = []
    await withRetry(
      async () => { throw new Error('boom') },
      {
        maxAttempts: 3,
        baseDelayMs: 0,
        maxDelayMs: 0,
        onRetry: (attempt, error) => calls.push({ attempt, error: error as Error }),
      },
    ).catch(() => {})

    expect(calls.map(c => c.attempt)).toEqual([1, 2])
    expect(calls[0].error.message).toBe('boom')
  })
})

describe('isRetryableError', () => {
  it('returns true for RetryableError sentinel', () => {
    expect(isRetryableError(new RetryableError('rate limited', 429))).toBe(true)
  })

  it('returns true for 429 in message', () => {
    expect(isRetryableError(new Error('HTTP 429'))).toBe(true)
  })

  it('returns true for 503 in message', () => {
    expect(isRetryableError(new Error('HTTP 503 service unavailable'))).toBe(true)
  })

  it('returns true for timeout errors', () => {
    expect(isRetryableError(new Error('request timeout'))).toBe(true)
  })

  it('returns true for objects with status >= 500', () => {
    expect(isRetryableError({ status: 500 })).toBe(true)
    expect(isRetryableError({ status: 503 })).toBe(true)
  })

  it('returns false for 4xx client errors in status object', () => {
    expect(isRetryableError({ status: 400 })).toBe(false)
    expect(isRetryableError({ status: 404 })).toBe(false)
  })

  it('returns false for explicit client error marker in message', () => {
    expect(isRetryableError(new Error('client error: bad request'))).toBe(false)
  })
})

describe('assertOkOrRetryable', () => {
  const makeResponse = (status: number): Response =>
    ({ ok: status >= 200 && status < 300, status } as Response)

  it('does not throw for 2xx responses', () => {
    expect(() => assertOkOrRetryable(makeResponse(200), 'ctx')).not.toThrow()
  })

  it('throws RetryableError for 429', () => {
    expect(() => assertOkOrRetryable(makeResponse(429), 'ctx')).toThrow(RetryableError)
  })

  it('throws RetryableError for 5xx', () => {
    expect(() => assertOkOrRetryable(makeResponse(503), 'ctx')).toThrow(RetryableError)
  })

  it('throws plain Error for 4xx client errors', () => {
    const err = (() => {
      try { assertOkOrRetryable(makeResponse(404), 'ctx') }
      catch (e) { return e }
    })()
    expect(err).toBeInstanceOf(Error)
    expect(err).not.toBeInstanceOf(RetryableError)
  })
})

describe('RetryableError', () => {
  it('has name RetryableError', () => {
    expect(new RetryableError('msg').name).toBe('RetryableError')
  })

  it('stores statusCode', () => {
    expect(new RetryableError('msg', 503).statusCode).toBe(503)
  })

  it('retryable flag is true', () => {
    expect(new RetryableError('msg').retryable).toBe(true)
  })
})
