/**
 * Retry utility with exponential backoff, jitter, and configurable
 * retryable-error detection.
 *
 * Designed for wrapping external service calls (telephony, messaging,
 * Nostr relay, blob storage) where transient failures are expected.
 */

/** Configuration for retry behavior */
export interface RetryOptions {
  /** Maximum number of attempts (including the initial call). Default: 3 */
  maxAttempts?: number
  /** Base delay in ms before the first retry. Default: 200 */
  baseDelayMs?: number
  /** Maximum delay in ms between retries. Default: 5000 */
  maxDelayMs?: number
  /** Jitter factor (0-1). 0 = no jitter, 1 = full random jitter. Default: 0.3 */
  jitterFactor?: number
  /** Predicate to determine if an error is retryable. Default: all errors are retryable */
  isRetryable?: (error: unknown) => boolean
  /** Called before each retry with attempt number (1-based) and the error */
  onRetry?: (attempt: number, error: unknown, delayMs: number) => void
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  baseDelayMs: 200,
  maxDelayMs: 5000,
  jitterFactor: 0.3,
  isRetryable: () => true,
  onRetry: () => {},
}

/**
 * Execute an async function with retry logic.
 *
 * Uses exponential backoff: delay = baseDelay * 2^(attempt-1) + jitter
 * Respects the isRetryable predicate — non-retryable errors are thrown immediately.
 *
 * @returns The result of the function on success
 * @throws The last error if all attempts fail
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions,
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  let lastError: unknown

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error

      // If this was the last attempt, or error is not retryable, throw immediately
      if (attempt >= opts.maxAttempts || !opts.isRetryable(error)) {
        throw error
      }

      // Calculate delay with exponential backoff + jitter
      const exponentialDelay = opts.baseDelayMs * Math.pow(2, attempt - 1)
      const cappedDelay = Math.min(exponentialDelay, opts.maxDelayMs)
      const jitter = cappedDelay * opts.jitterFactor * Math.random()
      const delay = Math.round(cappedDelay + jitter)

      opts.onRetry(attempt, error, delay)

      await sleep(delay)
    }
  }

  // Should never reach here, but TypeScript needs it
  throw lastError
}

/**
 * Predicate: is this a retryable HTTP/network error?
 *
 * Retryable: 429 (rate limit), 502/503/504 (gateway errors), network failures.
 * NOT retryable: 400, 401, 403, 404, 409 (client errors that won't change on retry).
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof RetryableError) return true

  // Network errors (fetch failures, timeouts)
  if (error instanceof TypeError && error.message.includes('fetch')) return true

  // Errors with HTTP status codes
  if (error instanceof Error) {
    const msg = error.message.toLowerCase()
    // Explicit retryable status codes
    if (msg.includes('429') || msg.includes('rate limit')) return true
    if (msg.includes('502') || msg.includes('503') || msg.includes('504')) return true
    if (msg.includes('bad gateway') || msg.includes('service unavailable') || msg.includes('gateway timeout')) return true
    // Network-level failures
    if (msg.includes('timeout') || msg.includes('econnreset') || msg.includes('econnrefused')) return true
    if (msg.includes('socket hang up') || msg.includes('network')) return true
    // Explicit non-retryable markers
    if (msg.includes('4xx') || msg.includes('client error')) return false
  }

  // Responses with status codes (when error wraps a Response)
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = (error as { status: number }).status
    if (status === 429 || status >= 500) return true
    if (status >= 400 && status < 500) return false
  }

  // Default: retry unknown errors (safer for transient failures)
  return true
}

/**
 * Check if a fetch Response indicates a retryable failure.
 * Use this to throw RetryableError inside withRetry when working with fetch.
 */
export function assertOkOrRetryable(response: Response, context: string): void {
  if (response.ok) return

  const status = response.status
  if (status === 429 || status >= 500) {
    throw new RetryableError(`${context}: HTTP ${status}`, status)
  }

  // Client errors are not retryable — throw a regular error
  throw new Error(`${context}: HTTP ${status}`)
}

/**
 * Sentinel error class marking an error as retryable.
 * Throw this from within a withRetry callback to signal retriability.
 */
export class RetryableError extends Error {
  readonly retryable = true
  readonly statusCode?: number

  constructor(message: string, statusCode?: number) {
    super(message)
    this.name = 'RetryableError'
    this.statusCode = statusCode
  }
}

/**
 * Predicate: is this a retryable database error?
 * Extends isRetryableError with PostgreSQL-specific transient failure patterns.
 */
export function isRetryableDbError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase()
    // PostgreSQL deadlock — transient, safe to retry
    if (msg.includes('deadlock detected')) return true
    // Connection pool exhaustion
    if (msg.includes('too many connections') || msg.includes('remaining connection slots')) return true
    // Connection lost mid-query
    if (msg.includes('connection terminated unexpectedly') || msg.includes('connection reset')) return true
    // Query cancelled due to statement timeout
    if (msg.includes('canceling statement') || msg.includes('statement timeout')) return true
  }
  return isRetryableError(error)
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
