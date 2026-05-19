import { createHash } from 'crypto'
import { webhookNonces } from '../db/schema/webhook-nonces'
import { lt } from 'drizzle-orm'
import { createLogger } from '../lib/logger'
import type { Database } from '../db'

const logger = createLogger('webhook-replay')

const DEFAULT_WINDOW_S = 300

/**
 * Check if a webhook has already been processed.
 * Returns true if this is the first delivery (proceed with processing).
 * Returns false if this is a replay (skip processing, return idempotent 200).
 */
export async function checkWebhookReplay(
  db: Database,
  provider: string,
  bodyText: string,
  windowSeconds: number = DEFAULT_WINDOW_S,
): Promise<boolean> {
  const nonceInput = `${provider}:${bodyText}`
  const hash = createHash('sha256').update(nonceInput).digest('hex')

  const expiresAt = new Date(Date.now() + windowSeconds * 1000)

  try {
    await db.insert(webhookNonces).values({
      nonceHash: hash,
      provider,
      expiresAt,
    })
    return true
  } catch (e: unknown) {
    if ((e as { code?: string }).code === '23505') {
      logger.info('Webhook replay detected', { provider })
      return false
    }
    throw e
  }
}

/**
 * Cleanup expired nonce records. Call periodically.
 */
export async function cleanupExpiredNonces(db: Database): Promise<void> {
  await db.delete(webhookNonces).where(
    lt(webhookNonces.expiresAt, new Date())
  )
}
