/**
 * Persistent outbox for Nostr relay event delivery.
 * Events are inserted into PostgreSQL before WebSocket delivery attempt.
 * Failed events are retried with exponential backoff by the outbox poller.
 *
 * Uses FOR UPDATE SKIP LOCKED for safe concurrent draining across replicas.
 */
import { getPool } from './postgres-pool'

export interface OutboxEvent {
  id: number
  event_json: Record<string, unknown>
  attempts: number
}

export class EventOutbox {
  /**
   * Insert an event into the outbox for delivery.
   */
  async enqueue(eventJson: Record<string, unknown>): Promise<void> {
    const sql = getPool()
    await sql`
      INSERT INTO nostr_event_outbox (event_json)
      VALUES (${JSON.stringify(eventJson)}::jsonb)
    `
  }

  /**
   * Claim a batch of pending events for delivery.
   * Uses FOR UPDATE SKIP LOCKED to prevent duplicate processing across replicas.
   */
  async drainBatch(limit: number): Promise<OutboxEvent[]> {
    const sql = getPool()
    // Use any for tx to preserve tagged template call signatures
    const rows = await sql.begin(async (tx: any) => {
      return tx`
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
      `
    })

    return (rows as Array<{ id: number; event_json: Record<string, unknown>; attempts: number }>).map((row) => ({
      id: row.id,
      event_json: row.event_json,
      attempts: row.attempts,
    }))
  }

  /**
   * Mark an event as successfully delivered (will be cleaned up later).
   */
  async markDelivered(id: number): Promise<void> {
    const sql = getPool()
    await sql`
      UPDATE nostr_event_outbox
      SET status = 'delivered'
      WHERE id = ${id}
    `
  }

  /**
   * Mark an event as failed with exponential backoff for retry.
   * Backoff: 30s, 60s, 120s, 240s, 480s (capped at 8 min).
   */
  async markFailed(id: number, attempts: number): Promise<void> {
    const sql = getPool()
    const backoffSeconds = Math.min(30 * Math.pow(2, attempts), 480)
    await sql`
      UPDATE nostr_event_outbox
      SET status = 'pending',
          attempts = ${attempts + 1},
          next_retry_at = NOW() + ${`${backoffSeconds} seconds`}::interval
      WHERE id = ${id}
    `
  }

  /**
   * Clean up old events:
   * - Delivered events older than 1 hour
   * - Failed events (>20 attempts) older than 24 hours
   */
  async cleanup(): Promise<void> {
    const sql = getPool()
    await sql`
      DELETE FROM nostr_event_outbox
      WHERE (status = 'delivered' AND created_at < NOW() - INTERVAL '1 hour')
         OR (attempts > 20 AND created_at < NOW() - INTERVAL '24 hours')
    `
  }

  /**
   * Get current outbox statistics.
   */
  async stats(): Promise<{ pending: number; failed: number }> {
    const sql = getPool()
    const rows = await sql`
      SELECT
        COUNT(*) FILTER (WHERE status = 'pending') AS pending,
        COUNT(*) FILTER (WHERE attempts > 0 AND status = 'pending') AS failed
      FROM nostr_event_outbox
    `
    return {
      pending: Number(rows[0].pending),
      failed: Number(rows[0].failed),
    }
  }
}
