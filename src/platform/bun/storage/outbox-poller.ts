/**
 * Background outbox poller for persistent Nostr event delivery.
 * Drains pending events every 30s and attempts WebSocket delivery.
 * Cleans up old delivered/failed events every 5 minutes.
 *
 * Follows the same pattern as alarm-poller.ts.
 */
import type { EventOutbox } from './outbox'
import type { NodeNostrPublisher } from '../../../../apps/worker/lib/nostr-publisher'

const DRAIN_INTERVAL_MS = 30_000
const CLEANUP_INTERVAL_MS = 5 * 60_000
const BATCH_SIZE = 50

let drainTimer: ReturnType<typeof setInterval> | null = null
let cleanupTimer: ReturnType<typeof setInterval> | null = null
let outboxInstance: EventOutbox | null = null
let publisherInstance: NodeNostrPublisher | null = null

/**
 * Start the outbox polling loops.
 * @param outbox - The EventOutbox instance for database operations
 * @param publisher - The NodeNostrPublisher to deliver events through
 */
export function startOutboxPoller(outbox: EventOutbox, publisher: NodeNostrPublisher): void {
  if (drainTimer) return
  outboxInstance = outbox
  publisherInstance = publisher

  // Initial drain after 10s to let the app start and WebSocket connect
  setTimeout(() => drainOutbox(), 10_000)
  drainTimer = setInterval(() => drainOutbox(), DRAIN_INTERVAL_MS)

  // Cleanup on a slower cadence
  cleanupTimer = setInterval(() => cleanupOutbox(), CLEANUP_INTERVAL_MS)

  console.log(`[outbox-poller] Started (drain: ${DRAIN_INTERVAL_MS / 1000}s, cleanup: ${CLEANUP_INTERVAL_MS / 1000}s)`)
}

/**
 * Stop the outbox polling loops.
 */
export function stopOutboxPoller(): void {
  if (drainTimer) {
    clearInterval(drainTimer)
    drainTimer = null
  }
  if (cleanupTimer) {
    clearInterval(cleanupTimer)
    cleanupTimer = null
  }
  outboxInstance = null
  publisherInstance = null
  console.log('[outbox-poller] Stopped')
}

/**
 * Drain pending events from the outbox and attempt delivery.
 * Uses deliverSignedEvent() to send pre-signed events directly,
 * bypassing publish() to avoid re-enqueuing into the outbox.
 */
async function drainOutbox(): Promise<void> {
  if (!outboxInstance || !publisherInstance) return

  try {
    const events = await outboxInstance.drainBatch(BATCH_SIZE)
    if (events.length === 0) return

    console.log(`[outbox-poller] Draining ${events.length} pending event(s)`)

    for (const event of events) {
      try {
        await publisherInstance.deliverSignedEvent(event.event_json)
        await outboxInstance.markDelivered(event.id)
      } catch (err) {
        console.warn(`[outbox-poller] Failed to deliver event ${event.id} (attempt ${event.attempts + 1}):`, err)
        await outboxInstance.markFailed(event.id, event.attempts)
      }
    }
  } catch (err) {
    console.error('[outbox-poller] Drain error:', err)
  }
}

/**
 * Clean up old delivered and permanently failed events.
 */
async function cleanupOutbox(): Promise<void> {
  if (!outboxInstance) return

  try {
    await outboxInstance.cleanup()
  } catch (err) {
    console.error('[outbox-poller] Cleanup error:', err)
  }
}
