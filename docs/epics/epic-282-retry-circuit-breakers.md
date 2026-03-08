# Epic 282: Retry Logic & Circuit Breakers

**Status**: PENDING
**Priority**: High
**Depends on**: None
**Blocks**: None
**Branch**: `desktop`

## Summary

Add exponential backoff retry logic and circuit breaker patterns for all external service calls: telephony providers, messaging adapters, Nostr relay publishing, and blob storage. Implement graceful degradation when circuits are open (voicemail fallback for telephony, retry with backoff for relay).

## Problem Statement

The current codebase makes external calls with zero retry logic and no failure isolation:

1. **Telephony (`ringVolunteers`, `hangupCall`, `cancelRinging`)**: A single network blip causes volunteer phones to never ring, leaving callers in queue indefinitely. The `TwilioAdapter.ringVolunteers()` calls `client.calls.create()` for each volunteer sequentially — one timeout blocks all subsequent volunteers. No retry on 5xx or timeout.

2. **Messaging (`sendMessage`, `sendMediaMessage`)**: In `apps/worker/routes/conversations.ts` line 233, `adapter.sendMessage()` is called once. On failure, the message is marked `status: 'failed'` permanently with no retry. The user sees a failed message and must manually resend.

3. **Nostr relay publishing**: `CallRouterDO.publishNostrEvent()` (line 493) catches errors silently. `NodeNostrPublisher` has reconnect logic but no retry for individual event delivery — if `ws.send()` fails, the event is lost. `CFNostrPublisher` has no retry at all.

4. **Blob storage (file uploads)**: `apps/worker/routes/uploads.ts` calls R2/S3 once. Large file chunk uploads fail on transient errors with no retry.

5. **Inter-DO communication**: Routes call DO methods via `fetch()` with no retry. A transient DO cold-start failure returns 500 to the client.

6. **No failure isolation**: A Twilio outage causes every call attempt to timeout (30s default), consuming worker CPU time and blocking the event loop. There is no mechanism to detect "Twilio is down" and short-circuit to voicemail.

## Implementation

### Phase 1: Shared Retry Utility

Create a composable retry utility that handles all common transient failure patterns.

**`apps/worker/lib/retry.ts`:**

```typescript
/**
 * Retry configuration for external service calls.
 * All fields have sensible defaults for crisis hotline use cases.
 */
export interface RetryOptions {
  /** Maximum number of attempts (including the first). Default: 3 */
  maxAttempts?: number
  /** Base delay in ms before first retry. Default: 200 */
  baseDelayMs?: number
  /** Maximum delay in ms (caps exponential growth). Default: 5000 */
  maxDelayMs?: number
  /** Jitter factor (0-1). 0.5 = up to 50% random addition. Default: 0.3 */
  jitter?: number
  /** Timeout per individual attempt in ms. Default: 10000 */
  attemptTimeoutMs?: number
  /** Which errors to retry on. Default: retries on transient errors */
  isRetryable?: (error: unknown) => boolean
  /** Called before each retry — useful for logging */
  onRetry?: (attempt: number, error: unknown, delayMs: number) => void
}

/**
 * Default retryable error classifier.
 * Retries on: network errors, timeouts, 429, 500, 502, 503, 504.
 * Does NOT retry on: 400, 401, 403, 404, 409 (client errors are permanent).
 */
export function isTransientError(error: unknown): boolean {
  if (error instanceof TypeError && error.message.includes('fetch')) return true // network error
  if (error instanceof DOMException && error.name === 'AbortError') return true // timeout

  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as { status: number }).status
    return status === 429 || status >= 500
  }

  // Twilio-specific error codes that are transient
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code: number }).code
    // 20003 = auth error (not transient), 20429 = rate limit, 31xxx = network
    return code === 20429 || (code >= 31000 && code < 32000)
  }

  // Generic error messages that indicate transient issues
  if (error instanceof Error) {
    const msg = error.message.toLowerCase()
    return msg.includes('timeout') ||
           msg.includes('econnrefused') ||
           msg.includes('econnreset') ||
           msg.includes('socket hang up') ||
           msg.includes('network') ||
           msg.includes('temporarily unavailable')
  }

  return false
}

/**
 * Execute an async function with exponential backoff retry.
 *
 * @example
 * const result = await withRetry(
 *   () => twilioClient.calls.create({ ... }),
 *   { maxAttempts: 3, baseDelayMs: 500 }
 * )
 */
export async function withRetry<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelayMs = 200,
    maxDelayMs = 5000,
    jitter = 0.3,
    attemptTimeoutMs = 10_000,
    isRetryable = isTransientError,
    onRetry,
  } = options

  let lastError: unknown

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), attemptTimeoutMs)

    try {
      const result = await fn(controller.signal)
      clearTimeout(timer)
      return result
    } catch (error) {
      clearTimeout(timer)
      lastError = error

      if (attempt === maxAttempts || !isRetryable(error)) {
        throw error
      }

      // Exponential backoff with jitter
      const exponentialDelay = baseDelayMs * Math.pow(2, attempt - 1)
      const jitterAmount = exponentialDelay * jitter * Math.random()
      const delay = Math.min(exponentialDelay + jitterAmount, maxDelayMs)

      onRetry?.(attempt, error, delay)

      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  throw lastError
}

/**
 * Execute multiple async calls in parallel with retry on each.
 * Returns results for all that succeeded; throws if all fail.
 * Used for ringVolunteers where we want to ring as many as possible.
 *
 * Each function receives the per-attempt AbortSignal from withRetry,
 * enabling attemptTimeoutMs to actually cancel hung requests.
 */
export async function withRetryAll<T>(
  fns: Array<(signal: AbortSignal) => Promise<T>>,
  options: RetryOptions = {},
): Promise<Array<{ status: 'fulfilled'; value: T } | { status: 'rejected'; reason: unknown }>> {
  return Promise.allSettled(
    fns.map(fn => withRetry((signal) => fn(signal), options))
  )
}
```

### Phase 2: Circuit Breaker

Implement a lightweight circuit breaker that tracks failure rates per service and short-circuits when a service is known to be down.

**`apps/worker/lib/circuit-breaker.ts`:**

```typescript
export type CircuitState = 'closed' | 'open' | 'half-open'

export interface CircuitBreakerOptions {
  /** Number of consecutive failures before opening the circuit. Default: 5 */
  failureThreshold?: number
  /** How long (ms) the circuit stays open before trying half-open. Default: 30000 */
  cooldownMs?: number
  /** Number of successes in half-open state to close the circuit. Default: 2 */
  halfOpenSuccesses?: number
  /** Called when circuit state changes */
  onStateChange?: (service: string, from: CircuitState, to: CircuitState) => void
}

interface CircuitStats {
  state: CircuitState
  failures: number
  successes: number
  lastFailureAt: number
  lastSuccessAt: number
  openedAt: number
}

/**
 * In-memory circuit breaker for external service calls.
 *
 * In CF Workers, this lives in the DO's memory (since DOs are long-lived singletons).
 * State resets on DO eviction, which is acceptable — a fresh DO should
 * optimistically try the service.
 *
 * For Node.js, the CircuitBreaker lives on the module-level singleton.
 */
export class CircuitBreaker {
  private circuits = new Map<string, CircuitStats>()
  private readonly opts: Required<CircuitBreakerOptions>

  constructor(options: CircuitBreakerOptions = {}) {
    this.opts = {
      failureThreshold: options.failureThreshold ?? 5,
      cooldownMs: options.cooldownMs ?? 30_000,
      halfOpenSuccesses: options.halfOpenSuccesses ?? 2,
      onStateChange: options.onStateChange ?? ((service, from, to) => {
        console.warn(`[circuit-breaker] ${service}: ${from} → ${to}`)
      }),
    }
  }

  private getStats(service: string): CircuitStats {
    if (!this.circuits.has(service)) {
      this.circuits.set(service, {
        state: 'closed',
        failures: 0,
        successes: 0,
        lastFailureAt: 0,
        lastSuccessAt: 0,
        openedAt: 0,
      })
    }
    return this.circuits.get(service)!
  }

  /** Check if a service call should be allowed */
  isAllowed(service: string): boolean {
    const stats = this.getStats(service)

    if (stats.state === 'closed') return true

    if (stats.state === 'open') {
      // Check if cooldown has elapsed
      if (Date.now() - stats.openedAt >= this.opts.cooldownMs) {
        this.transition(service, stats, 'half-open')
        return true // Allow one probe request
      }
      return false
    }

    // half-open: allow requests (probing)
    return true
  }

  /** Record a successful call */
  recordSuccess(service: string): void {
    const stats = this.getStats(service)
    stats.lastSuccessAt = Date.now()
    stats.failures = 0

    if (stats.state === 'half-open') {
      stats.successes++
      if (stats.successes >= this.opts.halfOpenSuccesses) {
        this.transition(service, stats, 'closed')
      }
    }
  }

  /** Record a failed call */
  recordFailure(service: string): void {
    const stats = this.getStats(service)
    stats.lastFailureAt = Date.now()
    stats.failures++
    stats.successes = 0

    if (stats.state === 'closed' && stats.failures >= this.opts.failureThreshold) {
      this.transition(service, stats, 'open')
    } else if (stats.state === 'half-open') {
      // Failed probe — back to open
      this.transition(service, stats, 'open')
    }
  }

  /** Get the current state of a circuit */
  getState(service: string): CircuitState {
    return this.getStats(service).state
  }

  /** Get stats for all circuits (for /api/metrics endpoint) */
  getAllStats(): Record<string, { state: CircuitState; failures: number; lastFailureAt: number }> {
    const result: Record<string, { state: CircuitState; failures: number; lastFailureAt: number }> = {}
    for (const [service, stats] of this.circuits) {
      result[service] = {
        state: stats.state,
        failures: stats.failures,
        lastFailureAt: stats.lastFailureAt,
      }
    }
    return result
  }

  private transition(service: string, stats: CircuitStats, to: CircuitState): void {
    const from = stats.state
    stats.state = to
    if (to === 'open') {
      stats.openedAt = Date.now()
    }
    if (to === 'closed') {
      stats.failures = 0
      stats.successes = 0
    }
    if (to === 'half-open') {
      stats.successes = 0
    }
    this.opts.onStateChange(service, from, to)
  }
}

/**
 * Execute a function with circuit breaker protection.
 * If the circuit is open, calls the fallback (if provided) or throws CircuitOpenError.
 */
export class CircuitOpenError extends Error {
  constructor(public readonly service: string) {
    super(`Circuit breaker open for service: ${service}`)
    this.name = 'CircuitOpenError'
  }
}

export async function withCircuitBreaker<T>(
  breaker: CircuitBreaker,
  service: string,
  fn: () => Promise<T>,
  fallback?: () => T | Promise<T>,
): Promise<T> {
  if (!breaker.isAllowed(service)) {
    if (fallback) return fallback()
    throw new CircuitOpenError(service)
  }

  try {
    const result = await fn()
    breaker.recordSuccess(service)
    return result
  } catch (error) {
    breaker.recordFailure(service)
    throw error
  }
}
```

### Phase 3: Apply to Telephony

Modify `CallRouterDO` and the telephony route to use retry + circuit breaker:

**`apps/worker/durable-objects/call-router.ts` changes:**

```typescript
import { CircuitBreaker, withCircuitBreaker, CircuitOpenError } from '../lib/circuit-breaker'
import { withRetry } from '../lib/retry'

export class CallRouterDO extends DurableObject<Env> {
  private breaker = new CircuitBreaker({
    failureThreshold: 3,
    cooldownMs: 60_000,  // 1 minute — crisis line can't be down long
    onStateChange: (service, from, to) => {
      console.warn(`[call-router] Circuit ${service}: ${from} → ${to}`)
    },
  })

  // ... existing constructor ...
}
```

**`apps/worker/routes/telephony.ts` — wrap ringVolunteers:**

```typescript
// Before:
const callSids = await adapter.ringVolunteers(params)

// After:
let callSids: string[]
try {
  callSids = await withCircuitBreaker(
    callRouterBreaker,
    'telephony',
    () => withRetry(
      () => adapter.ringVolunteers(params),
      {
        maxAttempts: 2,          // Only 2 attempts — caller is waiting
        baseDelayMs: 500,
        attemptTimeoutMs: 15_000, // 15s timeout per attempt
        onRetry: (attempt, error) => {
          console.warn(`[telephony] ringVolunteers retry #${attempt}:`, error)
        },
      }
    ),
    // Fallback when circuit is open: skip directly to voicemail
    () => {
      console.warn('[telephony] Circuit open — routing directly to voicemail')
      return [] as string[] // empty = no volunteers reached = voicemail
    },
  )
} catch (error) {
  console.error('[telephony] ringVolunteers failed after retries:', error)
  callSids = [] // Fallback to voicemail
}
```

### Phase 4: Apply to Messaging

**`apps/worker/routes/conversations.ts` — outbound message send:**

```typescript
// Wrap the sendMessage call with retry
const result = await withRetry(
  () => adapter.sendMessage({
    recipientIdentifier: identifier,
    body: body.plaintextForSending,
    conversationId: id,
  }),
  {
    maxAttempts: 3,
    baseDelayMs: 1000,
    attemptTimeoutMs: 10_000,
    onRetry: (attempt, error) => {
      console.warn(`[conversations] sendMessage retry #${attempt} (${conv.channelType}):`, error)
    },
  }
)
```

### Phase 5: Apply to Nostr Relay

**`apps/worker/lib/nostr-publisher.ts` — `CFNostrPublisher`:**

```typescript
async publish(template: EventTemplate): Promise<void> {
  const event = signServerEvent(template, this.secretKey)

  await withRetry(
    async () => {
      const res = await this.relayBinding.fetch(new Request('http://relay/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
      }))

      if (!res.ok) {
        const text = await res.text().catch(() => 'unknown error')
        const error = new Error(`Relay rejected event (kind=${template.kind}): ${text}`)
        ;(error as Error & { status: number }).status = res.status
        throw error
      }
    },
    {
      maxAttempts: 3,
      baseDelayMs: 100,     // Relay calls are fast, retry quickly
      maxDelayMs: 2000,
      attemptTimeoutMs: 5000,
      onRetry: (attempt, error) => {
        console.warn(`[nostr] Relay publish retry #${attempt}:`, error)
      },
    }
  )
}
```

### Phase 6: Circuit Breaker Metrics Endpoint

Add circuit breaker state to the existing metrics route:

```typescript
// apps/worker/routes/metrics.ts
metrics.get('/circuits', async (c) => {
  // Circuit state is per-DO instance, so query each DO
  const callRouter = getDOs(c.env).calls
  const circuitRes = await callRouter.fetch(new Request('http://do/circuits'))
  return c.json(await circuitRes.json())
})
```

## Files to Modify

- `apps/worker/lib/retry.ts` — **new** shared retry utility with exponential backoff
- `apps/worker/lib/circuit-breaker.ts` — **new** circuit breaker pattern implementation
- `apps/worker/durable-objects/call-router.ts` — add circuit breaker instance, apply to telephony calls
- `apps/worker/routes/telephony.ts` — wrap `ringVolunteers`, `cancelRinging` with retry + circuit breaker
- `apps/worker/routes/conversations.ts` — wrap `sendMessage` with retry
- `apps/worker/lib/nostr-publisher.ts` — add retry to `CFNostrPublisher.publish()` and `NodeNostrPublisher.publish()`
- `apps/worker/routes/uploads.ts` — wrap R2/S3 calls with retry
- `apps/worker/routes/metrics.ts` — expose circuit breaker state
- `apps/worker/durable-objects/blast-do.ts` — wrap blast delivery sends with retry

## Testing

### Unit Tests
- `withRetry` retries the correct number of times on transient errors
- `withRetry` does not retry on 400/401/403/404 errors
- `withRetry` applies exponential backoff with jitter (verify delay distribution)
- `withRetry` respects `attemptTimeoutMs` — aborts hung requests
- `CircuitBreaker` opens after N consecutive failures
- `CircuitBreaker` transitions to half-open after cooldown
- `CircuitBreaker` closes after successful probes in half-open
- `CircuitBreaker` re-opens on failure in half-open state
- `withCircuitBreaker` invokes fallback when circuit is open
- `isTransientError` correctly classifies Twilio error codes, HTTP status codes, network errors

### Integration Tests (Playwright)
- Simulate telephony failure (mock adapter returns 500): verify call routes to voicemail after retries
- Simulate messaging failure: verify message is marked failed with retry count in metadata
- Verify circuit breaker recovery: fail 5 times, wait cooldown, verify next call succeeds

### Load Tests
- Verify retry logic does not amplify load during provider outages (exponential backoff prevents thundering herd)
- Verify circuit breaker opens quickly enough to prevent timeout accumulation

## Acceptance Criteria

- [ ] All external service calls (telephony, messaging, relay, storage) use `withRetry`
- [ ] Circuit breaker protects telephony and messaging adapters
- [ ] When telephony circuit is open, incoming calls route directly to voicemail
- [ ] When relay is unreachable, `withRetry` retries with exponential backoff before failing (relay events are best-effort; queuing is not implemented — events that fail all retries are logged and dropped)
- [ ] Retry attempts are logged with attempt number and error details
- [ ] Circuit state is observable via `/api/metrics/circuits`
- [ ] No retry on non-transient errors (auth failures, validation errors)
- [ ] `withRetry` timeout prevents indefinite hangs on unresponsive services
- [ ] All existing tests pass without modification
- [ ] `bun run test:changed` passes

## Risk Assessment

**Risk**: Retry storms during a widespread outage. If Twilio is down and 50 calls come in simultaneously, each retrying 3 times = 150 API calls instead of 50.

**Mitigation**: The circuit breaker opens after 5 consecutive failures, stopping all retries within seconds. The 1-minute cooldown prevents the system from hammering a recovering service. Additionally, the exponential backoff with jitter spreads retries over time.

**Risk**: Increased latency on happy path. Adding retry/circuit-breaker wrappers adds function call overhead.

**Mitigation**: On the happy path (first attempt succeeds, circuit closed), the overhead is a single `isAllowed()` check (Map lookup) and a try-catch wrapper — negligible compared to the actual network call. No setTimeout is created on the happy path.

**Risk**: Circuit breaker state is in-memory and lost on DO eviction. After eviction, the DO optimistically tries the service again.

**Mitigation**: This is actually desirable — it means the system automatically re-probes after eviction instead of staying in a stale "open" state. For persistent circuit state across evictions, we could store state in DO storage, but the complexity is not warranted for v1.
