import { describe, it, expect } from 'bun:test'
import {
  computeRetryDecision,
  computeExpansionDeliveries,
  batchChunks,
  isDailyLimitReached,
  type SubscriberForExpansion,
} from '../../lib/blast-delivery'

// ---------------------------------------------------------------------------
// computeRetryDecision — exponential backoff
// ---------------------------------------------------------------------------

describe('computeRetryDecision', () => {
  const now = new Date('2026-05-02T12:00:00Z')
  const baseMs = 30_000

  it('doubles delay per attempt: attempt 1 → base, attempt 2 → 2×base', () => {
    const d1 = computeRetryDecision(0, now, 3, baseMs)
    expect(d1.permanentlyFailed).toBe(false)
    expect(d1.newAttempts).toBe(1)
    // backoff = 30_000 * 2^(1-1) = 30_000
    expect(d1.backoffMs).toBe(30_000)

    const d2 = computeRetryDecision(1, now, 3, baseMs)
    expect(d2.permanentlyFailed).toBe(false)
    expect(d2.newAttempts).toBe(2)
    // backoff = 30_000 * 2^(2-1) = 60_000
    expect(d2.backoffMs).toBe(60_000)
  })

  it('computes nextRetryAt from now + backoffMs', () => {
    const d = computeRetryDecision(0, now, 3, baseMs)
    expect(d.nextRetryAt!.getTime()).toBe(now.getTime() + 30_000)
  })

  it('marks permanently failed when max retries exceeded', () => {
    // maxRetries=3, currentAttempts=2 → newAttempts=3 → 3 >= 3 → failed
    const d = computeRetryDecision(2, now, 3, baseMs)
    expect(d.permanentlyFailed).toBe(true)
    expect(d.newAttempts).toBe(3)
    expect(d.backoffMs).toBeUndefined()
    expect(d.nextRetryAt).toBeUndefined()
  })

  it('marks permanently failed when well past max retries', () => {
    const d = computeRetryDecision(5, now, 3, baseMs)
    expect(d.permanentlyFailed).toBe(true)
    expect(d.newAttempts).toBe(6)
  })

  it('allows retry at exactly maxRetries - 1', () => {
    // maxRetries=3, currentAttempts=1 → newAttempts=2 → 2 < 3 → retry
    const d = computeRetryDecision(1, now, 3, baseMs)
    expect(d.permanentlyFailed).toBe(false)
    expect(d.newAttempts).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// computeExpansionDeliveries — subscriber × channel expansion
// ---------------------------------------------------------------------------

describe('computeExpansionDeliveries', () => {
  it('creates one delivery per subscriber-channel pair', () => {
    const subs: SubscriberForExpansion[] = [
      { id: 'sub-1', channels: [{ type: 'sms', verified: true }] },
      { id: 'sub-2', channels: [{ type: 'sms', verified: true }] },
    ]
    const deliveries = computeExpansionDeliveries(subs, ['sms'])
    expect(deliveries).toEqual([
      { subscriberId: 'sub-1', channel: 'sms' },
      { subscriberId: 'sub-2', channel: 'sms' },
    ])
  })

  it('subscriber with 2 verified channels = 2 deliveries', () => {
    const subs: SubscriberForExpansion[] = [
      {
        id: 'sub-1',
        channels: [
          { type: 'sms', verified: true },
          { type: 'whatsapp', verified: true },
        ],
      },
    ]
    const deliveries = computeExpansionDeliveries(subs, ['sms', 'whatsapp'])
    expect(deliveries).toHaveLength(2)
    expect(deliveries).toContainEqual({ subscriberId: 'sub-1', channel: 'sms' })
    expect(deliveries).toContainEqual({ subscriberId: 'sub-1', channel: 'whatsapp' })
  })

  it('skips unverified channels', () => {
    const subs: SubscriberForExpansion[] = [
      {
        id: 'sub-1',
        channels: [
          { type: 'sms', verified: false },
          { type: 'whatsapp', verified: true },
        ],
      },
    ]
    const deliveries = computeExpansionDeliveries(subs, ['sms', 'whatsapp'])
    expect(deliveries).toEqual([{ subscriberId: 'sub-1', channel: 'whatsapp' }])
  })

  it('skips channels not in target list', () => {
    const subs: SubscriberForExpansion[] = [
      { id: 'sub-1', channels: [{ type: 'telegram', verified: true }] },
    ]
    const deliveries = computeExpansionDeliveries(subs, ['sms'])
    expect(deliveries).toEqual([])
  })

  it('returns empty for empty subscriber list', () => {
    expect(computeExpansionDeliveries([], ['sms'])).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// batchChunks
// ---------------------------------------------------------------------------

describe('batchChunks', () => {
  it('splits into chunks of given size', () => {
    const items = Array.from({ length: 1200 }, (_, i) => i)
    const chunks = batchChunks(items, 500)
    expect(chunks).toHaveLength(3)
    expect(chunks[0]).toHaveLength(500)
    expect(chunks[1]).toHaveLength(500)
    expect(chunks[2]).toHaveLength(200)
  })

  it('returns single chunk when items fit', () => {
    const chunks = batchChunks([1, 2, 3], 500)
    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toEqual([1, 2, 3])
  })

  it('returns empty array for empty input', () => {
    expect(batchChunks([], 500)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// isDailyLimitReached
// ---------------------------------------------------------------------------

describe('isDailyLimitReached', () => {
  it('returns true when at capacity', () => {
    expect(isDailyLimitReached(10, 10)).toBe(true)
  })

  it('returns true when over capacity', () => {
    expect(isDailyLimitReached(15, 10)).toBe(true)
  })

  it('returns false when under capacity', () => {
    expect(isDailyLimitReached(9, 10)).toBe(false)
  })
})
