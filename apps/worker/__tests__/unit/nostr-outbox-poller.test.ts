// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  startOutboxPoller,
  stopOutboxPoller,
} from '@worker/lib/nostr-outbox-poller'
import type { EventOutbox } from '@worker/lib/nostr-outbox'
import type { NodeNostrPublisher } from '@worker/lib/nostr-publisher'

function createMockOutbox() {
  return {
    drainBatch: vi.fn().mockResolvedValue([]),
    markDelivered: vi.fn().mockResolvedValue(undefined),
    markFailed: vi.fn().mockResolvedValue(undefined),
    cleanup: vi.fn().mockResolvedValue(undefined),
  } as unknown as EventOutbox
}

function createMockPublisher() {
  return {
    deliverSignedEvent: vi.fn().mockResolvedValue(undefined),
  } as unknown as NodeNostrPublisher
}

describe('nostr-outbox-poller', () => {
  let outbox: ReturnType<typeof createMockOutbox>
  let publisher: ReturnType<typeof createMockPublisher>

  beforeEach(() => {
    vi.useFakeTimers()
    outbox = createMockOutbox()
    publisher = createMockPublisher()
  })

  afterEach(() => {
    stopOutboxPoller()
    vi.useRealTimers()
  })

  it('is a no-op if startOutboxPoller is called twice', async () => {
    startOutboxPoller(outbox, publisher)
    startOutboxPoller(outbox, publisher)

    await vi.advanceTimersByTimeAsync(10_000)
    expect(outbox.drainBatch).toHaveBeenCalledTimes(1)
  })

  it('drains the outbox after initial delay', async () => {
    startOutboxPoller(outbox, publisher)

    expect(outbox.drainBatch).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(10_000)

    expect(outbox.drainBatch).toHaveBeenCalledTimes(1)
    expect(outbox.drainBatch).toHaveBeenCalledWith(50)
  })

  it('drains on interval after initial delay', async () => {
    startOutboxPoller(outbox, publisher)

    await vi.advanceTimersByTimeAsync(10_000)
    expect(outbox.drainBatch).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(30_000)
    expect(outbox.drainBatch).toHaveBeenCalledTimes(2)
  })

  it('delivers events and marks them delivered', async () => {
    outbox.drainBatch.mockResolvedValue([
      { id: 1, event_json: { kind: 1, content: 'hello' }, attempts: 0 },
      { id: 2, event_json: { kind: 1, content: 'world' }, attempts: 0 },
    ])

    startOutboxPoller(outbox, publisher)
    await vi.advanceTimersByTimeAsync(10_000)

    expect(publisher.deliverSignedEvent).toHaveBeenCalledTimes(2)
    expect(publisher.deliverSignedEvent).toHaveBeenNthCalledWith(1, { kind: 1, content: 'hello' })
    expect(publisher.deliverSignedEvent).toHaveBeenNthCalledWith(2, { kind: 1, content: 'world' })

    expect(outbox.markDelivered).toHaveBeenCalledTimes(2)
    expect(outbox.markDelivered).toHaveBeenCalledWith(1)
    expect(outbox.markDelivered).toHaveBeenCalledWith(2)
  })

  it('marks event failed when delivery throws', async () => {
    publisher.deliverSignedEvent.mockRejectedValueOnce(new Error('relay down'))
    outbox.drainBatch.mockResolvedValue([
      { id: 3, event_json: { kind: 1, content: 'fail' }, attempts: 2 },
    ])

    startOutboxPoller(outbox, publisher)
    await vi.advanceTimersByTimeAsync(10_000)

    expect(publisher.deliverSignedEvent).toHaveBeenCalledTimes(1)
    expect(outbox.markDelivered).not.toHaveBeenCalled()
    expect(outbox.markFailed).toHaveBeenCalledTimes(1)
    expect(outbox.markFailed).toHaveBeenCalledWith(3, 2)
  })

  it('survives when drainBatch throws', async () => {
    outbox.drainBatch.mockRejectedValue(new Error('db locked'))

    startOutboxPoller(outbox, publisher)
    await vi.advanceTimersByTimeAsync(10_000)

    expect(publisher.deliverSignedEvent).not.toHaveBeenCalled()
    expect(outbox.markFailed).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(30_000)
    expect(outbox.drainBatch).toHaveBeenCalledTimes(2)
  })

  it('does nothing when no events are returned', async () => {
    outbox.drainBatch.mockResolvedValue([])

    startOutboxPoller(outbox, publisher)
    await vi.advanceTimersByTimeAsync(10_000)

    expect(publisher.deliverSignedEvent).not.toHaveBeenCalled()
    expect(outbox.markDelivered).not.toHaveBeenCalled()
    expect(outbox.markFailed).not.toHaveBeenCalled()
  })

  it('runs cleanup on interval', async () => {
    startOutboxPoller(outbox, publisher)

    await vi.advanceTimersByTimeAsync(5 * 60_000)

    expect(outbox.cleanup).toHaveBeenCalledTimes(1)
  })

  it('stops all timers when stopOutboxPoller is called', async () => {
    startOutboxPoller(outbox, publisher)
    stopOutboxPoller()

    await vi.advanceTimersByTimeAsync(10_000)

    expect(outbox.drainBatch).not.toHaveBeenCalled()
  })

  it('does not process events after stop', async () => {
    startOutboxPoller(outbox, publisher)
    stopOutboxPoller()

    outbox.drainBatch.mockResolvedValue([
      { id: 5, event_json: { kind: 1, content: 'late' }, attempts: 0 },
    ])

    await vi.advanceTimersByTimeAsync(10_000)

    expect(publisher.deliverSignedEvent).not.toHaveBeenCalled()
  })

  it('handles mixed success and failure in one batch', async () => {
    publisher.deliverSignedEvent
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('timeout'))

    outbox.drainBatch.mockResolvedValue([
      { id: 10, event_json: { kind: 1, content: 'ok' }, attempts: 0 },
      { id: 11, event_json: { kind: 1, content: 'bad' }, attempts: 1 },
    ])

    startOutboxPoller(outbox, publisher)
    await vi.advanceTimersByTimeAsync(10_000)

    expect(outbox.markDelivered).toHaveBeenCalledTimes(1)
    expect(outbox.markDelivered).toHaveBeenCalledWith(10)
    expect(outbox.markFailed).toHaveBeenCalledTimes(1)
    expect(outbox.markFailed).toHaveBeenCalledWith(11, 1)
  })
})
