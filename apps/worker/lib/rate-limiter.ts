/**
 * Token-bucket rate limiter for blast delivery throttling.
 *
 * Configurable tokens-per-second with burst capacity.
 * Used by the delivery worker to respect per-hub sending rate limits.
 *
 * This is an in-memory rate limiter — suitable for single-process deployments.
 * If multi-process scaling is needed, replace with a Redis-backed implementation.
 */

export class TokenBucketRateLimiter {
  private tokens: number
  private lastRefill: number

  constructor(
    /** Tokens added per second */
    private readonly tokensPerSecond: number,
    /** Maximum burst capacity (defaults to 2x tokensPerSecond) */
    private readonly maxTokens: number = tokensPerSecond * 2,
  ) {
    this.tokens = maxTokens
    this.lastRefill = Date.now()
  }

  /**
   * Refill tokens based on elapsed time since last refill.
   */
  private refill(): void {
    const now = Date.now()
    const elapsedMs = now - this.lastRefill
    const tokensToAdd = (elapsedMs / 1000) * this.tokensPerSecond
    this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd)
    this.lastRefill = now
  }

  /**
   * Try to consume one token. Returns true if allowed, false if rate-limited.
   */
  tryConsume(): boolean {
    this.refill()
    if (this.tokens >= 1) {
      this.tokens -= 1
      return true
    }
    return false
  }

  /**
   * Wait until a token is available, then consume it.
   * Returns the number of milliseconds waited.
   */
  async waitForToken(): Promise<number> {
    this.refill()
    if (this.tokens >= 1) {
      this.tokens -= 1
      return 0
    }

    // Calculate time until next token
    const deficit = 1 - this.tokens
    const waitMs = Math.ceil((deficit / this.tokensPerSecond) * 1000)
    await new Promise((resolve) => setTimeout(resolve, waitMs))

    this.refill()
    this.tokens -= 1
    return waitMs
  }

  /**
   * Get current available tokens (for monitoring).
   */
  get availableTokens(): number {
    this.refill()
    return Math.floor(this.tokens)
  }

  /**
   * Update the rate (e.g., when settings change).
   * Returns a new limiter with the updated rate.
   */
  static create(tokensPerSecond: number, burstMultiplier = 2): TokenBucketRateLimiter {
    return new TokenBucketRateLimiter(tokensPerSecond, tokensPerSecond * burstMultiplier)
  }
}
