/**
 * Circuit breaker pattern for external service calls.
 *
 * States:
 * - CLOSED: requests flow normally; failures are counted
 * - OPEN: all requests are rejected immediately (fail-fast)
 * - HALF_OPEN: a single probe request is allowed through to test recovery
 *
 * Transitions:
 * - CLOSED -> OPEN: when failure count >= failureThreshold within the window
 * - OPEN -> HALF_OPEN: after resetTimeoutMs elapses
 * - HALF_OPEN -> CLOSED: if the probe request succeeds
 * - HALF_OPEN -> OPEN: if the probe request fails
 */

export type CircuitState = 'closed' | 'open' | 'half_open'

export interface CircuitBreakerOptions {
  /** Name for this breaker (used in metrics and logging) */
  name: string
  /** Number of failures before opening the circuit. Default: 5 */
  failureThreshold?: number
  /** Time in ms before transitioning from OPEN to HALF_OPEN. Default: 30000 (30s) */
  resetTimeoutMs?: number
  /** Rolling window in ms for counting failures. Default: 60000 (60s) */
  failureWindowMs?: number
  /** Called on state transitions */
  onStateChange?: (name: string, from: CircuitState, to: CircuitState) => void
}

/** Error thrown when the circuit is open and rejecting requests */
export class CircuitOpenError extends Error {
  readonly circuitName: string
  readonly state: CircuitState

  constructor(name: string) {
    super(`Circuit breaker '${name}' is open — request rejected`)
    this.name = 'CircuitOpenError'
    this.circuitName = name
    this.state = 'open'
  }
}

export class CircuitBreaker {
  readonly name: string
  private state: CircuitState = 'closed'
  private failures: number[] = [] // timestamps of failures within the window
  private lastFailureTime = 0
  private readonly failureThreshold: number
  private readonly resetTimeoutMs: number
  private readonly failureWindowMs: number
  private readonly onStateChange: (name: string, from: CircuitState, to: CircuitState) => void

  // Metrics
  private totalRequests = 0
  private totalSuccesses = 0
  private totalFailures = 0
  private totalRejections = 0
  private lastStateChangeTime = Date.now()

  constructor(options: CircuitBreakerOptions) {
    this.name = options.name
    this.failureThreshold = options.failureThreshold ?? 5
    this.resetTimeoutMs = options.resetTimeoutMs ?? 30_000
    this.failureWindowMs = options.failureWindowMs ?? 60_000
    this.onStateChange = options.onStateChange ?? (() => {})
  }

  /**
   * Execute a function through the circuit breaker.
   *
   * - CLOSED: runs the function normally
   * - OPEN: throws CircuitOpenError immediately (fail-fast)
   * - HALF_OPEN: allows one probe request through
   *
   * @throws CircuitOpenError if the circuit is open
   * @throws The original error if the function fails
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.totalRequests++

    if (this.state === 'open') {
      // Check if enough time has passed to try a probe
      if (Date.now() - this.lastFailureTime >= this.resetTimeoutMs) {
        this.transition('half_open')
      } else {
        this.totalRejections++
        throw new CircuitOpenError(this.name)
      }
    }

    try {
      const result = await fn()
      this.onSuccess()
      return result
    } catch (error) {
      this.onFailure()
      throw error
    }
  }

  private onSuccess(): void {
    this.totalSuccesses++

    if (this.state === 'half_open') {
      // Probe succeeded — close the circuit
      this.failures = []
      this.transition('closed')
    }

    // In closed state, successful calls don't change anything
  }

  private onFailure(): void {
    this.totalFailures++
    const now = Date.now()
    this.lastFailureTime = now

    if (this.state === 'half_open') {
      // Probe failed — re-open the circuit
      this.transition('open')
      return
    }

    // In closed state, record failure and check threshold
    if (this.state === 'closed') {
      // Prune old failures outside the window
      this.failures = this.failures.filter(t => now - t < this.failureWindowMs)
      this.failures.push(now)

      if (this.failures.length >= this.failureThreshold) {
        this.transition('open')
      }
    }
  }

  private transition(to: CircuitState): void {
    if (this.state === to) return
    const from = this.state
    this.state = to
    this.lastStateChangeTime = Date.now()
    this.onStateChange(this.name, from, to)
    console.debug(`[circuit-breaker] ${this.name}: ${from} -> ${to}`)
  }

  /** Get the current circuit state */
  getState(): CircuitState {
    // Auto-check if open circuit should transition to half_open
    if (this.state === 'open' && Date.now() - this.lastFailureTime >= this.resetTimeoutMs) {
      this.transition('half_open')
    }
    return this.state
  }

  /** Get metrics for this circuit breaker */
  getMetrics(): CircuitBreakerMetrics {
    return {
      name: this.name,
      state: this.getState(),
      totalRequests: this.totalRequests,
      totalSuccesses: this.totalSuccesses,
      totalFailures: this.totalFailures,
      totalRejections: this.totalRejections,
      recentFailures: this.failures.length,
      failureThreshold: this.failureThreshold,
      resetTimeoutMs: this.resetTimeoutMs,
      lastStateChangeTime: this.lastStateChangeTime,
      uptimeSinceLastChange: Date.now() - this.lastStateChangeTime,
    }
  }

  /** Force the circuit to a specific state (for testing or manual intervention) */
  forceState(state: CircuitState): void {
    this.transition(state)
    if (state === 'closed') {
      this.failures = []
    }
  }
}

export interface CircuitBreakerMetrics {
  name: string
  state: CircuitState
  totalRequests: number
  totalSuccesses: number
  totalFailures: number
  totalRejections: number
  recentFailures: number
  failureThreshold: number
  resetTimeoutMs: number
  lastStateChangeTime: number
  uptimeSinceLastChange: number
}

// --- Global Circuit Breaker Registry ---

const breakers = new Map<string, CircuitBreaker>()

/**
 * Get or create a named circuit breaker.
 * Circuit breakers are singletons keyed by name — calling this with the same
 * name returns the same instance.
 */
export function getCircuitBreaker(options: CircuitBreakerOptions): CircuitBreaker {
  let breaker = breakers.get(options.name)
  if (!breaker) {
    breaker = new CircuitBreaker(options)
    breakers.set(options.name, breaker)
  }
  return breaker
}

/**
 * Get metrics for all registered circuit breakers.
 * Used by the /api/metrics endpoint.
 */
export function getAllCircuitBreakerMetrics(): CircuitBreakerMetrics[] {
  return Array.from(breakers.values()).map(b => b.getMetrics())
}

/**
 * Reset all circuit breakers (for testing).
 */
export function resetAllCircuitBreakers(): void {
  for (const breaker of breakers.values()) {
    breaker.forceState('closed')
  }
}
