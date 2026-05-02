/**
 * Pure functions extracted from BlastsService for unit testing.
 * Backoff calculation and blast expansion logic — no DB dependencies.
 */

import { BLAST_MAX_RETRIES, BLAST_RETRY_BACKOFF_BASE_MS } from '../types'

// ---------------------------------------------------------------------------
// Backoff calculation
// ---------------------------------------------------------------------------

export interface RetryDecision {
  /** Whether the delivery is permanently failed */
  permanentlyFailed: boolean
  /** New attempt count */
  newAttempts: number
  /** Backoff delay in ms (only set when not permanently failed) */
  backoffMs?: number
  /** Absolute timestamp for next retry (only set when not permanently failed) */
  nextRetryAt?: Date
}

/**
 * Decide whether a delivery should be retried or permanently failed,
 * and compute the exponential backoff delay.
 *
 * Formula: backoffMs = base * 2^(newAttempts - 1)
 */
export function computeRetryDecision(
  currentAttempts: number,
  now: Date = new Date(),
  maxRetries: number = BLAST_MAX_RETRIES,
  backoffBaseMs: number = BLAST_RETRY_BACKOFF_BASE_MS,
): RetryDecision {
  const newAttempts = currentAttempts + 1

  if (newAttempts >= maxRetries) {
    return { permanentlyFailed: true, newAttempts }
  }

  const backoffMs = backoffBaseMs * Math.pow(2, newAttempts - 1)
  const nextRetryAt = new Date(now.getTime() + backoffMs)

  return { permanentlyFailed: false, newAttempts, backoffMs, nextRetryAt }
}

// ---------------------------------------------------------------------------
// Expansion logic — compute delivery rows from subscribers + channels
// ---------------------------------------------------------------------------

export interface SubscriberChannelInfo {
  type: string
  verified: boolean
}

export interface SubscriberForExpansion {
  id: string
  channels: SubscriberChannelInfo[]
}

export interface DeliveryRow {
  subscriberId: string
  channel: string
}

/**
 * Given a list of subscribers and target channels, compute which
 * subscriber-channel pairs should receive deliveries.
 * Only verified channels matching the target list produce a delivery.
 */
export function computeExpansionDeliveries(
  subscribers: SubscriberForExpansion[],
  targetChannels: string[],
): DeliveryRow[] {
  const deliveries: DeliveryRow[] = []

  for (const sub of subscribers) {
    for (const targetChannel of targetChannels) {
      const hasVerified = sub.channels.some(
        (ch) => ch.type === targetChannel && ch.verified,
      )
      if (hasVerified) {
        deliveries.push({ subscriberId: sub.id, channel: targetChannel })
      }
    }
  }

  return deliveries
}

/**
 * Split an array into chunks of a given size.
 * Used to batch-insert delivery rows (chunks of 500).
 */
export function batchChunks<T>(items: T[], batchSize: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += batchSize) {
    chunks.push(items.slice(i, i + batchSize))
  }
  return chunks
}

// ---------------------------------------------------------------------------
// Daily limit check
// ---------------------------------------------------------------------------

/**
 * Check whether the daily blast limit has been reached.
 */
export function isDailyLimitReached(
  sentTodayCount: number,
  maxBlastsPerDay: number,
): boolean {
  return sentTodayCount >= maxBlastsPerDay
}
