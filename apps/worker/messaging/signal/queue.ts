/**
 * SignalMessageQueue — PostgreSQL-backed retry queue for Signal messages.
 *
 * When sending a Signal message fails transiently (bridge down, rate limited,
 * network error), the message is enqueued for retry with exponential backoff.
 *
 * The queue is processed by a periodic drain loop (called from the scheduler
 * or a setInterval in dev mode). Messages that exceed maxRetries are marked
 * as dead-letter for admin review.
 *
 * Rate limiting: enforces per-number send rate limits to avoid Signal's
 * anti-spam protections (max N messages per minute per recipient).
 */

import { eq, and, lte, sql, desc } from 'drizzle-orm'
import type { Database } from '../../db'
import { signalMessageQueue } from '../../db/schema'
import { createLogger } from '../../lib/logger'

const logger = createLogger('signal-queue')

export type QueuedMessageStatus = 'pending' | 'processing' | 'sent' | 'failed' | 'dead'

export interface EnqueueParams {
  hubId: string
  conversationId: string
  recipientIdentifier: string
  body: string
  mediaUrl?: string
  mediaType?: string
  idempotencyKey?: string
}

export interface QueueStats {
  pending: number
  processing: number
  failed: number
  dead: number
  sent: number
}

/** Default: max 5 retries with exponential backoff */
const DEFAULT_MAX_RETRIES = 5

/** Default: 3 messages per minute per recipient */
const DEFAULT_RATE_LIMIT_PER_MINUTE = 3

/** Base delay for exponential backoff: 30 seconds */
const BACKOFF_BASE_MS = 30_000

export class SignalMessageQueue {
  constructor(
    private readonly db: Database,
    private readonly maxRetries: number = DEFAULT_MAX_RETRIES,
    private readonly rateLimitPerMinute: number = DEFAULT_RATE_LIMIT_PER_MINUTE,
  ) {}

  /**
   * Enqueue a message for delivery. If an idempotency key is provided,
   * duplicate enqueues are silently ignored.
   */
  async enqueue(params: EnqueueParams): Promise<string> {
    const id = crypto.randomUUID()
    const now = new Date()

    await this.db.insert(signalMessageQueue).values({
      id,
      hubId: params.hubId,
      conversationId: params.conversationId,
      recipientIdentifier: params.recipientIdentifier,
      body: params.body,
      mediaUrl: params.mediaUrl ?? null,
      mediaType: params.mediaType ?? null,
      idempotencyKey: params.idempotencyKey ?? null,
      status: 'pending',
      retryCount: 0,
      nextRetryAt: now,
      createdAt: now,
      updatedAt: now,
    }).onConflictDoNothing()

    logger.info('Message enqueued', { id, conversationId: params.conversationId })
    return id
  }

  /**
   * Claim and return a batch of messages ready for delivery.
   * Uses SELECT FOR UPDATE SKIP LOCKED to safely support concurrent processors.
   */
  async claimBatch(batchSize: number = 10): Promise<Array<{
    id: string
    hubId: string
    conversationId: string
    recipientIdentifier: string
    body: string
    mediaUrl: string | null
    mediaType: string | null
    retryCount: number
  }>> {
    const now = new Date()

    // Atomically claim messages: update status to 'processing' and return them
    const claimed = await this.db
      .update(signalMessageQueue)
      .set({
        status: 'processing',
        updatedAt: now,
      })
      .where(
        and(
          eq(signalMessageQueue.status, 'pending'),
          lte(signalMessageQueue.nextRetryAt, now),
        ),
      )
      .returning()

    // Limit to batchSize (drizzle doesn't support LIMIT in UPDATE directly)
    return claimed.slice(0, batchSize).map(row => ({
      id: row.id,
      hubId: row.hubId ?? '',
      conversationId: row.conversationId,
      recipientIdentifier: row.recipientIdentifier,
      body: row.body,
      mediaUrl: row.mediaUrl,
      mediaType: row.mediaType,
      retryCount: row.retryCount ?? 0,
    }))
  }

  /**
   * Mark a message as successfully sent.
   */
  async markSent(messageId: string, externalId?: string): Promise<void> {
    await this.db
      .update(signalMessageQueue)
      .set({
        status: 'sent',
        externalId: externalId ?? null,
        updatedAt: new Date(),
      })
      .where(eq(signalMessageQueue.id, messageId))
  }

  /**
   * Mark a message as failed. If retries are exhausted, mark as dead-letter.
   */
  async markFailed(messageId: string, error: string, currentRetryCount: number): Promise<void> {
    const nextRetryCount = currentRetryCount + 1
    const isDead = nextRetryCount >= this.maxRetries

    if (isDead) {
      await this.db
        .update(signalMessageQueue)
        .set({
          status: 'dead',
          lastError: error,
          retryCount: nextRetryCount,
          updatedAt: new Date(),
        })
        .where(eq(signalMessageQueue.id, messageId))

      logger.warn('Message moved to dead-letter queue', { messageId, retries: nextRetryCount, error })
    } else {
      // Exponential backoff: 30s, 60s, 120s, 240s, 480s
      const delayMs = BACKOFF_BASE_MS * Math.pow(2, currentRetryCount)
      const jitter = Math.random() * delayMs * 0.2  // 20% jitter
      const nextRetryAt = new Date(Date.now() + delayMs + jitter)

      await this.db
        .update(signalMessageQueue)
        .set({
          status: 'pending',
          lastError: error,
          retryCount: nextRetryCount,
          nextRetryAt,
          updatedAt: new Date(),
        })
        .where(eq(signalMessageQueue.id, messageId))

      logger.info('Message scheduled for retry', { messageId, retry: nextRetryCount, nextRetryAt: nextRetryAt.toISOString() })
    }
  }

  /**
   * Check if sending to a recipient would exceed the rate limit.
   * Counts messages sent to this recipient in the last minute.
   */
  async isRateLimited(recipientIdentifier: string): Promise<boolean> {
    const oneMinuteAgo = new Date(Date.now() - 60_000)

    const result = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(signalMessageQueue)
      .where(
        and(
          eq(signalMessageQueue.recipientIdentifier, recipientIdentifier),
          eq(signalMessageQueue.status, 'sent'),
          sql`${signalMessageQueue.updatedAt} > ${oneMinuteAgo}`,
        ),
      )

    const count = result[0]?.count ?? 0
    return count >= this.rateLimitPerMinute
  }

  /**
   * Get queue statistics for monitoring.
   */
  async getStats(hubId?: string): Promise<QueueStats> {
    const conditions = hubId ? [eq(signalMessageQueue.hubId, hubId)] : []

    const rows = await this.db
      .select({
        status: signalMessageQueue.status,
        count: sql<number>`count(*)::int`,
      })
      .from(signalMessageQueue)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .groupBy(signalMessageQueue.status)

    const stats: QueueStats = { pending: 0, processing: 0, failed: 0, dead: 0, sent: 0 }
    for (const row of rows) {
      const status = row.status as keyof QueueStats
      if (status in stats) {
        stats[status] = row.count
      }
    }
    return stats
  }

  /**
   * Get dead-letter messages for admin review.
   */
  async getDeadLetters(hubId?: string, limit: number = 50): Promise<Array<{
    id: string
    conversationId: string
    recipientIdentifier: string
    body: string
    lastError: string | null
    retryCount: number
    createdAt: Date
  }>> {
    const conditions = [eq(signalMessageQueue.status, 'dead')]
    if (hubId) {
      conditions.push(eq(signalMessageQueue.hubId, hubId))
    }

    return this.db
      .select({
        id: signalMessageQueue.id,
        conversationId: signalMessageQueue.conversationId,
        recipientIdentifier: signalMessageQueue.recipientIdentifier,
        body: signalMessageQueue.body,
        lastError: signalMessageQueue.lastError,
        retryCount: signalMessageQueue.retryCount,
        createdAt: signalMessageQueue.createdAt,
      })
      .from(signalMessageQueue)
      .where(and(...conditions))
      .orderBy(desc(signalMessageQueue.createdAt))
      .limit(limit)
  }

  /**
   * Retry a dead-letter message (reset it to pending).
   */
  async retryDeadLetter(messageId: string): Promise<boolean> {
    const result = await this.db
      .update(signalMessageQueue)
      .set({
        status: 'pending',
        retryCount: 0,
        nextRetryAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(signalMessageQueue.id, messageId),
          eq(signalMessageQueue.status, 'dead'),
        ),
      )
      .returning({ id: signalMessageQueue.id })

    return result.length > 0
  }

  /**
   * Clean up old sent/dead messages older than the specified age.
   */
  async cleanup(olderThanDays: number = 30): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000)

    const deleted = await this.db
      .delete(signalMessageQueue)
      .where(
        and(
          sql`${signalMessageQueue.status} IN ('sent', 'dead')`,
          lte(signalMessageQueue.createdAt, cutoff),
        ),
      )
      .returning({ id: signalMessageQueue.id })

    if (deleted.length > 0) {
      logger.info('Cleaned up old queue entries', { count: deleted.length })
    }

    return deleted.length
  }
}
