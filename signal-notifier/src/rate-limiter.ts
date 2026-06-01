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
   *
   * Keys whose entire window has expired are evicted from the map to prevent
   * unbounded memory growth when many unique IPs are seen (e.g. IPv6 churn).
   */
  check(key: string): boolean {
    const now = Date.now()
    const cutoff = now - this.windowMs

    const existing = this.windows.get(key) ?? []

    // Trim expired entries
    let start = 0
    while (start < existing.length && existing[start] < cutoff) {
      start++
    }
    const active = start === 0 ? existing : existing.slice(start)

    // Persist trimmed state to map (evict if empty, update if trimmed).
    // This reclaims memory from expired entries even on denial, and prevents
    // unbounded map growth under many unique IPs (e.g. IPv6 churn).
    if (active.length === 0) {
      this.windows.delete(key)
    } else if (start > 0) {
      this.windows.set(key, active)
    }

    if (active.length >= this.maxRequests) {
      return false
    }

    active.push(now)
    this.windows.set(key, active)
    return true
  }

  reset(key: string): void {
    this.windows.delete(key)
  }

  resetAll(): void {
    this.windows.clear()
  }
}
