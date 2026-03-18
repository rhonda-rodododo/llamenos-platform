/**
 * Persistent outbox for Nostr relay event delivery.
 * Events are inserted into PostgreSQL before WebSocket delivery attempt.
 * Failed events are retried with exponential backoff by the outbox poller.
 *
 * Uses FOR UPDATE SKIP LOCKED for safe concurrent draining across replicas.
 *
 * NOTE: drainBatch uses raw SQL (tx.execute) and includes parseJsonbValue() to handle
 * legacy double-serialized JSONB strings from before the bun-jsonb fix (see db/bun-jsonb.ts).
 * New inserts store proper JSONB objects. This compat layer can be removed once all
 * deployments have been migrated.
 */
import { eq, sql } from 'drizzle-orm'
import type { Database } from '../db'
import { nostrEventOutbox } from '../db/schema'

/** Required fields for a valid signed Nostr event. */
const REQUIRED_EVENT_FIELDS = ['id', 'pubkey', 'sig', 'kind', 'content', 'tags', 'created_at'] as const

export interface OutboxEvent {
  id: number
  event_json: Record<string, unknown>
  attempts: number
}

/**
 * Validate that an event has all required Nostr event fields.
 * Returns null if valid, or an error message describing what's missing.
 */
function validateNostrEvent(eventJson: Record<string, unknown>): string | null {
  const missing = REQUIRED_EVENT_FIELDS.filter((f) => eventJson[f] === undefined)
  if (missing.length > 0) {
    return `missing fields: ${missing.join(', ')}`
  }
  if (typeof eventJson.id !== 'string' || eventJson.id.length !== 64) {
    return `invalid event id: ${String(eventJson.id).substring(0, 20)}`
  }
  if (typeof eventJson.sig !== 'string' || eventJson.sig.length < 64) {
    return `invalid signature`
  }
  return null
}

/**
 * Parse a JSONB value that may be double-serialized by drizzle/bun-sql.
 * Drizzle's jsonb mapToDriverValue calls JSON.stringify(), but Bun SQL
 * also serializes objects — resulting in JSONB string values instead of objects.
 * This function unwraps the double-serialization when reading via raw SQL.
 */
function parseJsonbValue(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
    } catch {
      // Not valid JSON
    }
  }
  return null
}

export class EventOutbox {
  constructor(private db: Database) {}

  /**
   * Insert an event into the outbox for delivery.
   * Validates that the event has all required Nostr fields before persisting.
   */
  async enqueue(eventJson: Record<string, unknown>): Promise<void> {
    const error = validateNostrEvent(eventJson)
    if (error) {
      console.error(`[outbox] Rejected invalid event at enqueue: ${error}`, {
        kind: eventJson.kind,
        hasId: 'id' in eventJson,
        hasSig: 'sig' in eventJson,
      })
      return
    }

    await this.db.insert(nostrEventOutbox).values({
      eventJson,
    })
  }

  /**
   * Claim a batch of pending events for delivery.
   * Uses FOR UPDATE SKIP LOCKED to prevent duplicate processing across replicas.
   * Handles drizzle/bun-sql JSONB double-serialization by parsing string values.
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

    const events: OutboxEvent[] = []
    for (const row of rows) {
      const rawRow = row as Record<string, unknown>
      const parsed = parseJsonbValue(rawRow.event_json)
      if (!parsed) {
        console.error(`[outbox] Skipping event ${rawRow.id}: event_json is not a valid object`)
        await this.markPermanentlyFailed(rawRow.id as number)
        continue
      }

      const error = validateNostrEvent(parsed)
      if (error) {
        console.error(`[outbox] Skipping event ${rawRow.id}: ${error}`)
        await this.markPermanentlyFailed(rawRow.id as number)
        continue
      }

      events.push({
        id: rawRow.id as number,
        event_json: parsed,
        attempts: rawRow.attempts as number,
      })
    }

    return events
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
   * Mark an event as permanently failed (invalid, will never succeed).
   * These are cleaned up on the next cleanup cycle.
   */
  private async markPermanentlyFailed(id: number): Promise<void> {
    await this.db.update(nostrEventOutbox)
      .set({ status: 'dead', attempts: 999 })
      .where(eq(nostrEventOutbox.id, id))
  }

  /**
   * Clean up old events:
   * - Delivered events older than 1 hour
   * - Dead (permanently invalid) events immediately
   * - Failed events (>20 attempts) older than 24 hours
   */
  async cleanup(): Promise<void> {
    await this.db.execute(sql`
      DELETE FROM nostr_event_outbox
      WHERE (status = 'delivered' AND created_at < NOW() - INTERVAL '1 hour')
         OR (status = 'dead')
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
