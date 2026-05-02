import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CircuitBreaker, CircuitOpenError } from '@worker/lib/circuit-breaker'

describe('CircuitBreaker', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function makeBreaker(overrides?: { failureThreshold?: number; resetTimeoutMs?: number; failureWindowMs?: number }) {
    const stateChanges: Array<{ from: string; to: string }> = []
    const breaker = new CircuitBreaker({
      name: 'test',
      failureThreshold: 3,
      resetTimeoutMs: 5000,
      failureWindowMs: 10000,
      onStateChange: (_name, from, to) => stateChanges.push({ from, to }),
      ...overrides,
    })
    return { breaker, stateChanges }
  }

  const fail = () => Promise.reject(new Error('service down'))
  const succeed = () => Promise.resolve('ok')

  it('transitions CLOSED → OPEN after reaching failure threshold', async () => {
    const { breaker, stateChanges } = makeBreaker({ failureThreshold: 3 })

    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(fail)).rejects.toThrow('service down')
    }

    expect(breaker.getState()).toBe('open')
    expect(stateChanges).toContainEqual({ from: 'closed', to: 'open' })
  })

  it('transitions OPEN → HALF_OPEN after resetTimeoutMs elapses', async () => {
    const { breaker } = makeBreaker({ failureThreshold: 2, resetTimeoutMs: 5000 })

    // Trip the breaker
    await expect(breaker.execute(fail)).rejects.toThrow()
    await expect(breaker.execute(fail)).rejects.toThrow()
    expect(breaker.getState()).toBe('open')

    // Advance time past reset timeout
    vi.advanceTimersByTime(5000)
    expect(breaker.getState()).toBe('half_open')
  })

  it('transitions HALF_OPEN → CLOSED when probe succeeds', async () => {
    const { breaker, stateChanges } = makeBreaker({ failureThreshold: 2, resetTimeoutMs: 5000 })

    // Trip to open
    await expect(breaker.execute(fail)).rejects.toThrow()
    await expect(breaker.execute(fail)).rejects.toThrow()

    // Advance to half_open
    vi.advanceTimersByTime(5000)

    // Probe succeeds
    const result = await breaker.execute(succeed)
    expect(result).toBe('ok')
    expect(breaker.getState()).toBe('closed')
    expect(stateChanges).toContainEqual({ from: 'half_open', to: 'closed' })
  })

  it('transitions HALF_OPEN → OPEN when probe fails', async () => {
    const { breaker, stateChanges } = makeBreaker({ failureThreshold: 2, resetTimeoutMs: 5000 })

    // Trip to open
    await expect(breaker.execute(fail)).rejects.toThrow()
    await expect(breaker.execute(fail)).rejects.toThrow()

    // Advance to half_open
    vi.advanceTimersByTime(5000)

    // Probe fails
    await expect(breaker.execute(fail)).rejects.toThrow('service down')
    expect(breaker.getState()).toBe('open')
    expect(stateChanges.filter(s => s.to === 'open')).toHaveLength(2)
  })

  it('prunes failures outside the rolling window', async () => {
    const { breaker } = makeBreaker({ failureThreshold: 3, failureWindowMs: 10000 })

    // Two failures
    await expect(breaker.execute(fail)).rejects.toThrow()
    await expect(breaker.execute(fail)).rejects.toThrow()
    expect(breaker.getState()).toBe('closed')

    // Advance past window so previous failures expire
    vi.advanceTimersByTime(11000)

    // One more failure — should NOT trip (old ones pruned)
    await expect(breaker.execute(fail)).rejects.toThrow()
    expect(breaker.getState()).toBe('closed')
  })

  it('throws CircuitOpenError immediately when OPEN (fail-fast)', async () => {
    const { breaker } = makeBreaker({ failureThreshold: 2, resetTimeoutMs: 5000 })

    // Trip the breaker
    await expect(breaker.execute(fail)).rejects.toThrow()
    await expect(breaker.execute(fail)).rejects.toThrow()

    // Next call should be rejected immediately with CircuitOpenError
    await expect(breaker.execute(succeed)).rejects.toBeInstanceOf(CircuitOpenError)
    await expect(breaker.execute(succeed)).rejects.toThrow(/is open/)

    const metrics = breaker.getMetrics()
    expect(metrics.totalRejections).toBeGreaterThanOrEqual(2)
  })
})
