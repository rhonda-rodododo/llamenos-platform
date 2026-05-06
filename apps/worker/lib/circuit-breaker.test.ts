/**
 * Unit tests for circuit breaker pattern.
 *
 * Tests CircuitBreaker state transitions (closed → open → half_open → closed),
 * metrics, CircuitOpenError, and the global registry.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  CircuitBreaker,
  CircuitOpenError,
  getCircuitBreaker,
  getAllCircuitBreakerMetrics,
  resetAllCircuitBreakers,
} from './circuit-breaker'

beforeEach(() => {
  resetAllCircuitBreakers()
})

// ---------------------------------------------------------------------------
// CircuitOpenError
// ---------------------------------------------------------------------------

describe('CircuitOpenError', () => {
  it('is an Error with name "CircuitOpenError"', () => {
    const e = new CircuitOpenError('my-service')
    expect(e).toBeInstanceOf(Error)
    expect(e.name).toBe('CircuitOpenError')
  })

  it('stores circuit name', () => {
    expect(new CircuitOpenError('svc').circuitName).toBe('svc')
  })

  it('state is "open"', () => {
    expect(new CircuitOpenError('x').state).toBe('open')
  })

  it('message includes the circuit name', () => {
    expect(new CircuitOpenError('my-api').message).toContain('my-api')
  })
})

// ---------------------------------------------------------------------------
// CircuitBreaker — basic execution
// ---------------------------------------------------------------------------

describe('CircuitBreaker — basic execution', () => {
  it('executes function and returns result in closed state', async () => {
    const cb = new CircuitBreaker({ name: 'test1' })
    const result = await cb.execute(async () => 42)
    expect(result).toBe(42)
  })

  it('propagates errors without retrying', async () => {
    const cb = new CircuitBreaker({ name: 'test2' })
    await expect(cb.execute(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom')
  })

  it('state is "closed" initially', () => {
    const cb = new CircuitBreaker({ name: 'test3' })
    expect(cb.getState()).toBe('closed')
  })
})

// ---------------------------------------------------------------------------
// CircuitBreaker — state transitions
// ---------------------------------------------------------------------------

describe('CircuitBreaker — closed → open transition', () => {
  it('opens after failureThreshold consecutive failures', async () => {
    const cb = new CircuitBreaker({ name: 'thresh-test', failureThreshold: 3, failureWindowMs: 60_000 })
    for (let i = 0; i < 3; i++) {
      await cb.execute(() => Promise.reject(new Error('fail'))).catch(() => {})
    }
    expect(cb.getState()).toBe('open')
  })

  it('does not open before reaching failureThreshold', async () => {
    const cb = new CircuitBreaker({ name: 'thresh-test2', failureThreshold: 5 })
    for (let i = 0; i < 4; i++) {
      await cb.execute(() => Promise.reject(new Error('fail'))).catch(() => {})
    }
    expect(cb.getState()).toBe('closed')
  })

  it('calls onStateChange callback on open', async () => {
    const onStateChange = vi.fn()
    const cb = new CircuitBreaker({ name: 'state-cb', failureThreshold: 2, onStateChange })
    for (let i = 0; i < 2; i++) {
      await cb.execute(() => Promise.reject(new Error('x'))).catch(() => {})
    }
    expect(onStateChange).toHaveBeenCalledWith('state-cb', 'closed', 'open')
  })
})

describe('CircuitBreaker — open state rejects immediately', () => {
  it('throws CircuitOpenError when open', async () => {
    const cb = new CircuitBreaker({ name: 'open-test', failureThreshold: 1, resetTimeoutMs: 999_999 })
    await cb.execute(() => Promise.reject(new Error('fail'))).catch(() => {})
    await expect(cb.execute(async () => 'should not run')).rejects.toThrow(CircuitOpenError)
  })

  it('does not call the function when open', async () => {
    const cb = new CircuitBreaker({ name: 'open-no-call', failureThreshold: 1, resetTimeoutMs: 999_999 })
    await cb.execute(() => Promise.reject(new Error('x'))).catch(() => {})
    const fn = vi.fn().mockResolvedValue('x')
    await cb.execute(fn).catch(() => {})
    expect(fn).not.toHaveBeenCalled()
  })
})

describe('CircuitBreaker — half_open → closed', () => {
  it('transitions to half_open after resetTimeoutMs and closes on success', async () => {
    const cb = new CircuitBreaker({ name: 'half-success', failureThreshold: 1, resetTimeoutMs: 1 })
    await cb.execute(() => Promise.reject(new Error('x'))).catch(() => {})
    expect(cb.getState()).toBe('open')

    // Wait past the reset timeout
    await new Promise(r => setTimeout(r, 10))

    const result = await cb.execute(async () => 'recovered')
    expect(result).toBe('recovered')
    expect(cb.getState()).toBe('closed')
  })

  it('transitions back to open when probe fails in half_open', async () => {
    // Use a large resetTimeoutMs so getState() doesn't auto-transition back to half_open
    // after the failed probe re-opens the circuit
    const cb = new CircuitBreaker({ name: 'half-fail', failureThreshold: 1, resetTimeoutMs: 60_000 })
    await cb.execute(() => Promise.reject(new Error('x'))).catch(() => {})

    // Force to half_open to simulate the reset timeout elapsing
    cb.forceState('half_open')

    await cb.execute(() => Promise.reject(new Error('probe failed'))).catch(() => {})
    expect(cb.getState()).toBe('open')
  })
})

// ---------------------------------------------------------------------------
// CircuitBreaker — forceState
// ---------------------------------------------------------------------------

describe('CircuitBreaker — forceState', () => {
  it('can be forced to open', async () => {
    // Use long resetTimeoutMs so getState() does NOT auto-transition to half_open
    const cb = new CircuitBreaker({ name: 'force-open', resetTimeoutMs: 999_999 })
    // Trigger a failure to set lastFailureTime, then force open
    await cb.execute(() => Promise.reject(new Error('x'))).catch(() => {})
    cb.forceState('open')
    expect(cb.getState()).toBe('open')
  })

  it('clears failures when forced closed', async () => {
    const cb = new CircuitBreaker({ name: 'force-close', failureThreshold: 3 })
    for (let i = 0; i < 2; i++) {
      await cb.execute(() => Promise.reject(new Error('x'))).catch(() => {})
    }
    cb.forceState('closed')
    // Should be able to fail 2 more times without opening
    for (let i = 0; i < 2; i++) {
      await cb.execute(() => Promise.reject(new Error('x'))).catch(() => {})
    }
    expect(cb.getState()).toBe('closed')
  })
})

// ---------------------------------------------------------------------------
// CircuitBreaker — metrics
// ---------------------------------------------------------------------------

describe('CircuitBreaker — getMetrics', () => {
  it('tracks totalRequests, totalSuccesses, totalFailures', async () => {
    const cb = new CircuitBreaker({ name: 'metrics-test', failureThreshold: 10 })
    await cb.execute(async () => 'ok')
    await cb.execute(() => Promise.reject(new Error('fail'))).catch(() => {})
    await cb.execute(async () => 'ok2')

    const m = cb.getMetrics()
    expect(m.totalRequests).toBe(3)
    expect(m.totalSuccesses).toBe(2)
    expect(m.totalFailures).toBe(1)
  })

  it('tracks totalRejections when open', async () => {
    const cb = new CircuitBreaker({ name: 'rej-metrics', failureThreshold: 1, resetTimeoutMs: 999_999 })
    await cb.execute(() => Promise.reject(new Error('x'))).catch(() => {})
    await cb.execute(async () => 'x').catch(() => {})

    const m = cb.getMetrics()
    expect(m.totalRejections).toBe(1)
  })

  it('includes name and failureThreshold in metrics', () => {
    const cb = new CircuitBreaker({ name: 'named-metrics', failureThreshold: 7 })
    const m = cb.getMetrics()
    expect(m.name).toBe('named-metrics')
    expect(m.failureThreshold).toBe(7)
  })
})

// ---------------------------------------------------------------------------
// Global registry
// ---------------------------------------------------------------------------

describe('getCircuitBreaker / getAllCircuitBreakerMetrics', () => {
  it('returns same instance for same name', () => {
    const a = getCircuitBreaker({ name: 'registry-test' })
    const b = getCircuitBreaker({ name: 'registry-test' })
    expect(a).toBe(b)
  })

  it('getAllCircuitBreakerMetrics includes registered breakers', () => {
    getCircuitBreaker({ name: 'metrics-a' })
    getCircuitBreaker({ name: 'metrics-b' })
    const all = getAllCircuitBreakerMetrics()
    const names = all.map(m => m.name)
    expect(names).toContain('metrics-a')
    expect(names).toContain('metrics-b')
  })

  it('resetAllCircuitBreakers sets all to closed', async () => {
    const cb = getCircuitBreaker({ name: 'reset-test', failureThreshold: 1, resetTimeoutMs: 999_999 })
    await cb.execute(() => Promise.reject(new Error('x'))).catch(() => {})
    expect(cb.getState()).toBe('open')

    resetAllCircuitBreakers()
    expect(cb.getState()).toBe('closed')
  })
})
