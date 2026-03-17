/**
 * Persistent outbox for Nostr relay event delivery.
 * Events are inserted into PostgreSQL before WebSocket delivery attempt.
 * Failed events are retried with exponential backoff by the outbox poller.
 *
 * Uses FOR UPDATE SKIP LOCKED for safe concurrent draining across replicas.
 */
import { eq, and, lt, sql } from 'drizzle-orm'
import type { Database } from '../db'
import { nostrEventOutbox } from '../db/schema'

export interface OutboxEvent {
  id: number
  event_json: Record<string, unknown>
  attempts: number
}

export class EventOutbox {
  constructor(private db: Database) {}

  /** Insert an event into the outbox for delivery. */
  async enqueue(eventJson: Record<string, unknown>): Promise<void> {
    await this.db.insert(nostrEventOutbox).values({
      eventJson,
    })
  }

  /**
   * Claim a batch of pending events for delivery.
   * Uses FOR UPDATE SKIP LOCKED to prevent duplicate processing across replicas.
   */
  async drainBatch(limit: number): Promise<OutboxEvent[]> {
    const rows = await this.db.transaction(async (tx) => {
      const result = await tx.execute(sql`
        UPDATE nostr_event_outbox
        SET status = 'delivering'
        WHERE id IN (
          SELECT id FROM nostr_event_outbox
          WHERE status = 'pending' AND next_retry_at <= NOW()
          ORDER BY next_retry_at ASC
          LIMIT ${limit}
          FOR UPDATE SKIP LOCKED
        )
        RETURNING id, event_json, attempts
      `)
      return Array.isArray(result) ? result : []
    })

    return rows.map((row: Record<string, unknown>) => ({
      id: row.id as number,
      event_json: row.event_json as Record<string, unknown>,
      attempts: row.attempts as number,
    }))
  }

  /** Mark an event as successfully delivered (will be cleaned up later). */
  async markDelivered(id: number): Promise<void> {
    await this.db.update(nostrEventOutbox)
      .set({ status: 'delivered' })
      .where(eq(nostrEventOutbox.id, id))
  }

  /**
   * Mark an event as failed with exponential backoff for retry.
   * Backoff: 30s, 60s, 120s, 240s, 480s (capped at 8 min).
   */
  async markFailed(id: number, attempts: number): Promise<void> {
    const backoffSeconds = Math.min(30 * Math.pow(2, attempts), 480)
    await this.db.update(nostrEventOutbox)
      .set({
        status: 'pending',
        attempts: attempts + 1,
        nextRetryAt: sql`NOW() + ${`${backoffSeconds} seconds`}::interval`,
      })
      .where(eq(nostrEventOutbox.id, id))
  }

  /**
   * Clean up old events:
   * - Delivered events older than 1 hour
   * - Failed events (>20 attempts) older than 24 hours
   */
  async cleanup(): Promise<void> {
    await this.db.execute(sql`
      DELETE FROM nostr_event_outbox
      WHERE (status = 'delivered' AND created_at < NOW() - INTERVAL '1 hour')
         OR (attempts > 20 AND created_at < NOW() - INTERVAL '24 hours')
    `)
  }

  /** Get current outbox statistics. */
  async stats(): Promise<{ pending: number; failed: number }> {
    const rows = await this.db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE status = 'pending') AS pending,
        COUNT(*) FILTER (WHERE attempts > 0 AND status = 'pending') AS failed
      FROM nostr_event_outbox
    `)
    const row = Array.isArray(rows) ? rows[0] : { pending: 0, failed: 0 }
    return {
      pending: Number(row?.pending ?? 0),
      failed: Number(row?.failed ?? 0),
    }
  }
}
