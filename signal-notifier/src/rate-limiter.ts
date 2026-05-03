/**
 * Simple in-memory sliding window rate limiter.
 * Each key (e.g., IP or endpoint) gets a window of timestamps.
 */
export class RateLimiter {
  private windows = new Map<string, number[]>()
  private readonly maxRequests: number
  private readonly windowMs: number

  constructor(maxRequests: number, windowMs: number) {
    this.maxRequests = maxRequests
    this.windowMs = windowMs
  }

  /**
   * Returns true if the request is allowed, false if rate-limited.
   */
  check(key: string): boolean {
    const now = Date.now()
    const cutoff = now - this.windowMs

    let timestamps = this.windows.get(key)
    if (!timestamps) {
      timestamps = []
      this.windows.set(key, timestamps)
    }

    // Remove expired entries
    while (timestamps.length > 0 && timestamps[0] < cutoff) {
      timestamps.shift()
    }

    if (timestamps.length >= this.maxRequests) {
      return false
    }

    timestamps.push(now)
    return true
  }

  reset(key: string): void {
    this.windows.delete(key)
  }

  resetAll(): void {
    this.windows.clear()
  }
}
