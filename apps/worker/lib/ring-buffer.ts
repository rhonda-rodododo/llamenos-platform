/**
 * Generic ring buffer with capacity, time-based eviction, and priority reservation.
 *
 * Used for the WebSocket relay's per-hub event buffer. Priority reservation
 * ensures that life-safety-critical events (call ring/update) cannot be evicted
 * by lower-priority event floods.
 */

export interface RingBufferOptions<T> {
  /** Maximum number of items in the buffer */
  capacity: number
  /** Maximum age in milliseconds — items older than this are evicted */
  maxAgeMs: number
  /** Number of slots reserved for priority items */
  reservedSlots: number
  /** Predicate to identify priority items */
  isReserved: (item: T) => boolean
  /** Extract timestamp (ms) from an item */
  getTimestamp: (item: T) => number
}

export class RingBuffer<T> {
  private items: T[] = []
  private readonly capacity: number
  private readonly maxAgeMs: number
  private readonly reservedSlots: number
  private readonly isReserved: (item: T) => boolean
  private readonly getTimestamp: (item: T) => number

  constructor(options: RingBufferOptions<T>) {
    this.capacity = options.capacity
    this.maxAgeMs = options.maxAgeMs
    this.reservedSlots = options.reservedSlots
    this.isReserved = options.isReserved
    this.getTimestamp = options.getTimestamp
  }

  /** Push an item into the buffer, evicting old/overflow items as needed. */
  push(item: T): void {
    this.evictExpired()

    if (this.items.length >= this.capacity) {
      if (this.isReserved(item)) {
        // Priority item: evict oldest non-reserved item
        const idx = this.items.findIndex(i => !this.isReserved(i))
        if (idx !== -1) {
          this.items.splice(idx, 1)
        } else {
          // All items are reserved — evict oldest reserved
          this.items.shift()
        }
      } else {
        // Non-priority item: check if there's room outside reserved slots
        const reservedCount = this.items.filter(i => this.isReserved(i)).length
        const nonReservedCapacity = this.capacity - Math.min(reservedCount, this.reservedSlots)

        const nonReservedCount = this.items.length - reservedCount
        if (nonReservedCount >= nonReservedCapacity) {
          // Evict oldest non-reserved item
          const idx = this.items.findIndex(i => !this.isReserved(i))
          if (idx !== -1) {
            this.items.splice(idx, 1)
          } else {
            // Buffer full of reserved items — drop the incoming non-priority item
            return
          }
        }
      }
    }

    this.items.push(item)
  }

  /** Return all items with timestamp >= since, newest first. */
  since(sinceMs: number): T[] {
    this.evictExpired()
    const results: T[] = []
    for (let i = this.items.length - 1; i >= 0; i--) {
      if (this.getTimestamp(this.items[i]) >= sinceMs) {
        results.push(this.items[i])
      }
    }
    return results
  }

  /** Return all items in the buffer (oldest first). */
  all(): readonly T[] {
    this.evictExpired()
    return this.items
  }

  get size(): number {
    return this.items.length
  }

  /** Remove items older than maxAgeMs. */
  private evictExpired(): void {
    const cutoff = Date.now() - this.maxAgeMs
    // Items are in insertion order (oldest first), so we can binary-search or scan from front
    let evictUntil = 0
    while (evictUntil < this.items.length && this.getTimestamp(this.items[evictUntil]) < cutoff) {
      evictUntil++
    }
    if (evictUntil > 0) {
      this.items.splice(0, evictUntil)
    }
  }
}
