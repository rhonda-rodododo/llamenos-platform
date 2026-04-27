/**
 * BlastsService — replaces BlastDO.
 *
 * Manages subscriber lists, broadcast messaging, blast settings,
 * keyword handling, and delivery lifecycle.
 * All state is stored in PostgreSQL via Drizzle ORM, unifying the
 * previously duplicated data stores from ConversationDO and BlastDO.
 */
import { eq, and, desc, sql, count, inArray, lt, isNull } from 'drizzle-orm'
import type { Database } from '../db'
import {
  subscribers,
  blasts,
  blastDeliveries,
  blastSettings as blastSettingsTable,
} from '../db/schema'
import type {
  MessagingChannelType,
  Subscriber,
  Blast,
  BlastSettings,
  BlastContent,
  BlastDeliveryStatus,
  BlastStats,
  SubscriberChannel,
} from '@shared/types'
import { DEFAULT_BLAST_SETTINGS } from '@shared/types'
import { BLAST_MAX_RETRIES, BLAST_RETRY_BACKOFF_BASE_MS } from '../types'
import { hmac } from '@noble/hashes/hmac.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import { utf8ToBytes } from '@noble/ciphers/utils.js'
import { HMAC_PREFERENCE_TOKEN, HMAC_SUBSCRIBER } from '@shared/crypto-labels'
import { encryptContactIdentifier } from '../lib/crypto'
import { ServiceError } from './settings'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SubscriberFilters {
  hubId?: string
  tag?: string
  channel?: MessagingChannelType
  status?: Subscriber['status']
  limit?: number
  offset?: number
}

export interface CreateBlastInput {
  hubId?: string
  name: string
  content: BlastContent
  targetChannels: MessagingChannelType[]
  targetTags?: string[]
  targetLanguages?: string[]
  createdBy: string
}

export interface UpdateBlastInput {
  name?: string
  content?: BlastContent
  targetChannels?: MessagingChannelType[]
  targetTags?: string[]
  targetLanguages?: string[]
}

export interface ImportSubscriberEntry {
  identifier: string
  channel: MessagingChannelType
  tags?: string[]
  language?: string
}

export interface SubscriberStats {
  total: number
  byChannel: Record<string, number>
  byStatus: Record<string, number>
}

// Infer row types from the schema
type SubscriberRow = typeof subscribers.$inferSelect
type BlastRow = typeof blasts.$inferSelect
type BlastDeliveryRow = typeof blastDeliveries.$inferSelect

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class BlastsService {
  constructor(
    protected db: Database,
    protected hmacSecret?: string,
  ) {}

  // --- Preference token generation ---

  private generatePreferenceToken(identifierHash: string): string {
    if (!this.hmacSecret) {
      throw new ServiceError(500, 'HMAC secret not configured')
    }
    const key = hexToBytes(this.hmacSecret)
    const input = utf8ToBytes(`${HMAC_PREFERENCE_TOKEN}${identifierHash}`)
    return bytesToHex(hmac(sha256, key, input))
  }

  private hashIdentifier(identifier: string): string {
    if (!this.hmacSecret) {
      throw new ServiceError(500, 'HMAC secret not configured')
    }
    return bytesToHex(
      hmac(sha256, hexToBytes(this.hmacSecret), utf8ToBytes(`${HMAC_SUBSCRIBER}${identifier}`)),
    )
  }

  // --- Blast settings ---

  async getBlastSettings(hubId: string): Promise<BlastSettings> {
    const [row] = await this.db
      .select()
      .from(blastSettingsTable)
      .where(eq(blastSettingsTable.hubId, hubId))
      .limit(1)

    if (!row) return DEFAULT_BLAST_SETTINGS
    return (row.settings ?? DEFAULT_BLAST_SETTINGS) as BlastSettings
  }

  async updateBlastSettings(hubId: string, data: Partial<BlastSettings>): Promise<BlastSettings> {
    const current = await this.getBlastSettings(hubId)
    const updated: BlastSettings = { ...current, ...data }

    await this.db
      .insert(blastSettingsTable)
      .values({
        hubId,
        settings: updated,
      })
      .onConflictDoUpdate({
        target: blastSettingsTable.hubId,
        set: { settings: updated },
      })

    return updated
  }

  // --- Subscriber CRUD ---

  async getSubscriberByIdentifierHash(
    identifierHash: string,
    hubId?: string,
  ): Promise<SubscriberRow | null> {
    const conditions = [eq(subscribers.identifierHash, identifierHash)]
    if (hubId) conditions.push(eq(subscribers.hubId, hubId))

    const [row] = await this.db
      .select()
      .from(subscribers)
      .where(and(...conditions))
      .limit(1)

    return row ?? null
  }

  async listSubscribers(
    filters: SubscriberFilters = {},
  ): Promise<{ subscribers: SubscriberRow[]; total: number }> {
    const conditions = []

    if (filters.hubId) {
      conditions.push(eq(subscribers.hubId, filters.hubId))
    }
    if (filters.status) {
      conditions.push(eq(subscribers.status, filters.status))
    }
    if (filters.tag) {
      conditions.push(sql`${filters.tag} = ANY(${subscribers.tags})`)
    }
    if (filters.channel) {
      conditions.push(
        sql`EXISTS (SELECT 1 FROM jsonb_array_elements(${subscribers.channels}) elem WHERE elem->>'type' = ${filters.channel})`,
      )
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined
    const limit = filters.limit ?? 50
    const offset = filters.offset ?? 0

    const [rows, [totalRow]] = await Promise.all([
      this.db
        .select()
        .from(subscribers)
        .where(where)
        .orderBy(desc(subscribers.subscribedAt))
        .limit(limit)
        .offset(offset),
      this.db
        .select({ count: count() })
        .from(subscribers)
        .where(where),
    ])

    return { subscribers: rows, total: totalRow.count }
  }

  async deleteSubscriber(id: string): Promise<void> {
    const result = await this.db
      .delete(subscribers)
      .where(eq(subscribers.id, id))
      .returning({ id: subscribers.id })

    if (result.length === 0) throw new ServiceError(404, 'Subscriber not found')
  }

  async importBulk(
    hubId: string,
    entries: ImportSubscriberEntry[],
  ): Promise<{ imported: number; skipped: number; total: number }> {
    let imported = 0
    let skipped = 0

    for (const entry of entries) {
      const identifierHash = this.hashIdentifier(entry.identifier)

      const existing = await this.getSubscriberByIdentifierHash(identifierHash, hubId)
      if (existing) {
        // Merge channels and tags
        const channels = (existing.channels ?? []) as SubscriberChannel[]
        const tags = existing.tags ?? []
        let changed = false

        const hasChannel = channels.some((ch: SubscriberChannel) => ch.type === entry.channel)
        if (!hasChannel) {
          channels.push({ type: entry.channel, verified: false })
          changed = true
        }
        if (entry.tags) {
          const newTags = entry.tags.filter((t) => !tags.includes(t))
          if (newTags.length > 0) {
            tags.push(...newTags)
            changed = true
          }
        }

        if (changed) {
          await this.db
            .update(subscribers)
            .set({
              channels: channels,
              tags,
            })
            .where(eq(subscribers.id, existing.id))
        }
        skipped++
        continue
      }

      const preferenceToken = this.generatePreferenceToken(identifierHash)
      const encrypted = this.hmacSecret
        ? encryptContactIdentifier(entry.identifier, this.hmacSecret)
        : null
      await this.db
        .insert(subscribers)
        .values({
          hubId,
          identifierHash,
          encryptedIdentifier: encrypted,
          channels: [{ type: entry.channel, verified: false }],
          tags: entry.tags ?? [],
          language: entry.language ?? 'en',
          status: 'active',
          doubleOptInConfirmed: false,
          preferenceToken,
        })
      imported++
    }

    return { imported, skipped, total: imported + skipped }
  }

  // --- Preference token operations ---

  async validatePreferenceToken(
    token: string,
  ): Promise<{
    id: string
    channels: SubscriberChannel[]
    tags: string[]
    language: string
    status: string
  }> {
    const [row] = await this.db
      .select()
      .from(subscribers)
      .where(eq(subscribers.preferenceToken, token))
      .limit(1)

    if (!row) throw new ServiceError(404, 'Invalid token')

    return {
      id: row.id,
      channels: (row.channels ?? []) as SubscriberChannel[],
      tags: row.tags ?? [],
      language: row.language,
      status: row.status,
    }
  }

  async getByPreferenceToken(token: string): Promise<SubscriberRow> {
    const [row] = await this.db
      .select()
      .from(subscribers)
      .where(eq(subscribers.preferenceToken, token))
      .limit(1)

    if (!row) throw new ServiceError(404, 'Invalid token')
    return row
  }

  async updatePreferences(
    token: string,
    data: { language?: string; status?: 'active' | 'paused' | 'unsubscribed'; tags?: string[] },
  ): Promise<{
    id: string
    channels: SubscriberChannel[]
    tags: string[]
    language: string
    status: string
  }> {
    const sub = await this.getByPreferenceToken(token)

    const updates: Record<string, unknown> = {}
    if (data.language) updates.language = data.language
    if (data.status) updates.status = data.status
    if (data.tags) updates.tags = data.tags

    const [updated] = await this.db
      .update(subscribers)
      .set(updates)
      .where(eq(subscribers.id, sub.id))
      .returning()

    return {
      id: updated.id,
      channels: (updated.channels ?? []) as SubscriberChannel[],
      tags: updated.tags ?? [],
      language: updated.language,
      status: updated.status,
    }
  }

  // --- Keyword handling ---

  async handleSubscriberKeyword(
    hubId: string,
    data: {
      identifier: string
      identifierHash: string
      keyword: string
      channel: MessagingChannelType
    },
  ): Promise<{ action: string; message: string; subscriberId?: string }> {
    const settings = await this.getBlastSettings(hubId)
    const normalizedKeyword = data.keyword.toUpperCase()

    // --- Unsubscribe ---
    if (
      normalizedKeyword === settings.unsubscribeKeyword.toUpperCase() ||
      normalizedKeyword === 'STOP'
    ) {
      const existing = await this.getSubscriberByIdentifierHash(data.identifierHash, hubId)
      if (existing) {
        await this.db
          .update(subscribers)
          .set({ status: 'unsubscribed' })
          .where(eq(subscribers.id, existing.id))
      }
      return { action: 'unsubscribed', message: settings.unsubscribeMessage }
    }

    // --- Subscribe ---
    if (normalizedKeyword === settings.subscribeKeyword.toUpperCase()) {
      const existing = await this.getSubscriberByIdentifierHash(data.identifierHash, hubId)
      if (existing) {
        // Re-subscribe
        const channels = (existing.channels ?? []) as SubscriberChannel[]
        const hasChannel = channels.some((ch: SubscriberChannel) => ch.type === data.channel)
        if (!hasChannel) {
          channels.push({ type: data.channel, verified: true })
        }
        await this.db
          .update(subscribers)
          .set({
            status: 'active',
            channels: channels,
          })
          .where(eq(subscribers.id, existing.id))
        return { action: 'resubscribed', message: settings.confirmationMessage }
      }

      // Create new subscriber
      const preferenceToken = this.generatePreferenceToken(data.identifierHash)
      const encrypted = this.hmacSecret
        ? encryptContactIdentifier(data.identifier, this.hmacSecret)
        : null
      const [created] = await this.db
        .insert(subscribers)
        .values({
          hubId,
          identifierHash: data.identifierHash,
          encryptedIdentifier: encrypted,
          channels: [{ type: data.channel, verified: true }],
          tags: [],
          language: 'en',
          status: settings.doubleOptIn ? 'paused' : 'active',
          doubleOptInConfirmed: !settings.doubleOptIn,
          preferenceToken,
        })
        .returning()

      return {
        action: 'subscribed',
        message: settings.confirmationMessage,
        subscriberId: created.id,
      }
    }

    return { action: 'ignored', message: '' }
  }

  // --- Subscriber stats ---

  async getSubscriberStats(hubId?: string): Promise<SubscriberStats> {
    const conditions = hubId ? [eq(subscribers.hubId, hubId)] : []
    const where = conditions.length > 0 ? and(...conditions) : undefined

    const [statusRows, allRows] = await Promise.all([
      this.db
        .select({
          status: subscribers.status,
          count: count(),
        })
        .from(subscribers)
        .where(where)
        .groupBy(subscribers.status),
      this.db
        .select({
          channels: subscribers.channels,
        })
        .from(subscribers)
        .where(where),
    ])

    const byStatus: Record<string, number> = { active: 0, paused: 0, unsubscribed: 0 }
    let total = 0
    for (const row of statusRows) {
      byStatus[row.status] = row.count
      total += row.count
    }

    // Count by channel (requires iterating JSONB channels)
    const byChannel: Record<string, number> = {}
    for (const row of allRows) {
      const channels = (row.channels ?? []) as SubscriberChannel[]
      for (const ch of channels) {
        byChannel[ch.type] = (byChannel[ch.type] ?? 0) + 1
      }
    }

    return { total, byChannel, byStatus }
  }

  // --- Blast CRUD ---

  async createBlast(input: CreateBlastInput): Promise<BlastRow> {
    const [row] = await this.db
      .insert(blasts)
      .values({
        hubId: input.hubId,
        name: input.name,
        content: input.content,
        status: 'draft',
        targetChannels: input.targetChannels,
        targetTags: input.targetTags ?? [],
        targetLanguages: input.targetLanguages ?? [],
        createdBy: input.createdBy,
        stats: { totalRecipients: 0, sent: 0, delivered: 0, failed: 0, optedOut: 0 },
      })
      .returning()

    return row
  }

  async getBlast(id: string): Promise<BlastRow> {
    const [row] = await this.db
      .select()
      .from(blasts)
      .where(eq(blasts.id, id))
      .limit(1)

    if (!row) throw new ServiceError(404, 'Blast not found')
    return row
  }

  async listBlasts(hubId?: string): Promise<BlastRow[]> {
    const conditions = hubId ? [eq(blasts.hubId, hubId)] : []
    const where = conditions.length > 0 ? and(...conditions) : undefined

    return this.db
      .select()
      .from(blasts)
      .where(where)
      .orderBy(desc(blasts.createdAt))
  }

  async updateBlast(id: string, input: UpdateBlastInput): Promise<BlastRow> {
    const existing = await this.getBlast(id)
    if (existing.status !== 'draft') {
      throw new ServiceError(400, 'Can only edit draft blasts')
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() }
    if (input.name !== undefined) updates.name = input.name
    if (input.content !== undefined) updates.content = input.content
    if (input.targetChannels !== undefined) updates.targetChannels = input.targetChannels
    if (input.targetTags !== undefined) updates.targetTags = input.targetTags
    if (input.targetLanguages !== undefined) updates.targetLanguages = input.targetLanguages

    const [row] = await this.db
      .update(blasts)
      .set(updates)
      .where(eq(blasts.id, id))
      .returning()

    if (!row) throw new ServiceError(404, 'Blast not found')
    return row
  }

  async deleteBlast(id: string): Promise<void> {
    const existing = await this.getBlast(id)
    if (existing.status !== 'draft') {
      throw new ServiceError(400, 'Can only delete draft blasts')
    }

    await this.db
      .delete(blasts)
      .where(eq(blasts.id, id))
  }

  // --- Blast lifecycle ---

  async send(id: string, hubId?: string): Promise<BlastRow> {
    const blast = await this.getBlast(id)
    if (blast.status !== 'draft' && blast.status !== 'scheduled') {
      throw new ServiceError(400, 'Blast is not in a sendable state')
    }

    // Enforce maxBlastsPerDay limit
    const effectiveHubId = hubId ?? blast.hubId ?? ''
    const settings = await this.getBlastSettings(effectiveHubId)
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)

    const [sentTodayRow] = await this.db
      .select({ count: count() })
      .from(blasts)
      .where(
        and(
          sql`${blasts.status} IN ('sent', 'sending')`,
          sql`${blasts.sentAt} >= ${today}`,
          hubId ? eq(blasts.hubId, hubId) : undefined,
        ),
      )

    if (sentTodayRow.count >= (settings.maxBlastsPerDay ?? 10)) {
      throw new ServiceError(429, 'Daily blast limit reached')
    }

    const [row] = await this.db
      .update(blasts)
      .set({
        status: 'sending',
        sentAt: new Date(),
        updatedAt: new Date(),
        stats: {
          totalRecipients: 0,
          sent: 0,
          delivered: 0,
          failed: 0,
          optedOut: 0,
        },
      })
      .where(eq(blasts.id, id))
      .returning()

    return row
  }

  async schedule(id: string, scheduledAt: string): Promise<BlastRow> {
    const blast = await this.getBlast(id)
    if (blast.status !== 'draft') {
      throw new ServiceError(400, 'Can only schedule draft blasts')
    }

    const scheduledTime = new Date(scheduledAt).getTime()
    if (isNaN(scheduledTime) || scheduledTime <= Date.now()) {
      throw new ServiceError(400, 'scheduledAt must be a future date')
    }

    const [row] = await this.db
      .update(blasts)
      .set({
        status: 'scheduled',
        scheduledAt: new Date(scheduledAt),
        updatedAt: new Date(),
      })
      .where(eq(blasts.id, id))
      .returning()

    return row
  }

  async cancel(id: string): Promise<BlastRow> {
    const blast = await this.getBlast(id)
    if (blast.status !== 'scheduled' && blast.status !== 'sending') {
      throw new ServiceError(400, 'Can only cancel scheduled or sending blasts')
    }

    // Cancel all pending/sending delivery rows
    await this.db.execute(
      sql`UPDATE blast_deliveries SET status = 'cancelled' WHERE blast_id = ${id} AND status IN ('pending', 'sending')`,
    )

    const [row] = await this.db
      .update(blasts)
      .set({
        status: 'cancelled',
        cancelledAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(blasts.id, id))
      .returning()

    return row
  }

  // --- Blast delivery processing ---

  /**
   * Count subscribers matching a blast's target criteria.
   */
  private async countTargetSubscribers(blast: BlastRow, hubId?: string): Promise<number> {
    const conditions = [eq(subscribers.status, 'active')]
    if (hubId) conditions.push(eq(subscribers.hubId, hubId))

    const targetChannels = (blast.targetChannels ?? []) as string[]
    if (targetChannels.length > 0) {
      // Filter subscribers who have at least one verified channel matching the target
      const channelConditions = targetChannels.map(
        (ch) =>
          sql`EXISTS (SELECT 1 FROM jsonb_array_elements(${subscribers.channels}) elem WHERE elem->>'type' = ${ch} AND (elem->>'verified')::boolean = true)`,
      )
      conditions.push(sql`(${sql.join(channelConditions, sql` OR `)})`)
    }

    const targetTags = (blast.targetTags ?? []) as string[]
    if (targetTags.length > 0) {
      conditions.push(sql`${subscribers.tags} && ${sql`ARRAY[${sql.join(targetTags.map(t => sql`${t}`), sql`,`)}]::text[]`}`)
    }

    const targetLanguages = (blast.targetLanguages ?? []) as string[]
    if (targetLanguages.length > 0) {
      conditions.push(inArray(subscribers.language, targetLanguages))
    }

    const [result] = await this.db
      .select({ count: count() })
      .from(subscribers)
      .where(and(...conditions))

    return result.count
  }

  // --- Blast expansion: enumerate subscribers into delivery rows ---

  /**
   * Expand a blast into individual delivery rows.
   * Called after `send()` transitions a blast to 'sending'.
   * Creates one delivery row per subscriber-channel pair.
   * Returns the number of deliveries created.
   */
  async expandBlast(blastId: string): Promise<number> {
    const blast = await this.getBlast(blastId)
    if (blast.status !== 'sending') {
      throw new ServiceError(400, 'Can only expand blasts in sending state')
    }

    const targetChannels = (blast.targetChannels ?? []) as MessagingChannelType[]
    if (targetChannels.length === 0) {
      throw new ServiceError(400, 'Blast has no target channels')
    }

    // Build subscriber query conditions — only active, double-opt-in confirmed subscribers
    const conditions = [
      eq(subscribers.status, 'active'),
      eq(subscribers.doubleOptInConfirmed, true),
    ]
    if (blast.hubId) conditions.push(eq(subscribers.hubId, blast.hubId))

    const targetTags = (blast.targetTags ?? []) as string[]
    if (targetTags.length > 0) {
      conditions.push(sql`${subscribers.tags} && ${sql`ARRAY[${sql.join(targetTags.map(t => sql`${t}`), sql`,`)}]::text[]`}`)
    }

    const targetLanguages = (blast.targetLanguages ?? []) as string[]
    if (targetLanguages.length > 0) {
      conditions.push(inArray(subscribers.language, targetLanguages))
    }

    // Fetch matching subscribers
    const matchingSubscribers = await this.db
      .select()
      .from(subscribers)
      .where(and(...conditions))

    // Create delivery rows — one per subscriber per matching verified channel
    let deliveryCount = 0
    const deliveryValues: (typeof blastDeliveries.$inferInsert)[] = []

    for (const sub of matchingSubscribers) {
      const subChannels = (sub.channels ?? []) as SubscriberChannel[]
      for (const targetChannel of targetChannels) {
        const hasVerifiedChannel = subChannels.some(
          (ch) => ch.type === targetChannel && ch.verified,
        )
        if (hasVerifiedChannel) {
          deliveryValues.push({
            blastId,
            subscriberId: sub.id,
            channel: targetChannel,
            status: 'pending',
            attempts: 0,
          })
          deliveryCount++
        }
      }
    }

    // Batch insert deliveries (chunks of 500 to avoid query size limits)
    const BATCH_SIZE = 500
    for (let i = 0; i < deliveryValues.length; i += BATCH_SIZE) {
      const batch = deliveryValues.slice(i, i + BATCH_SIZE)
      await this.db.insert(blastDeliveries).values(batch)
    }

    // Update blast stats with actual delivery count
    await this.db
      .update(blasts)
      .set({
        stats: {
          totalRecipients: deliveryCount,
          sent: 0,
          delivered: 0,
          failed: 0,
          optedOut: 0,
        },
        updatedAt: new Date(),
      })
      .where(eq(blasts.id, blastId))

    return deliveryCount
  }

  // --- Delivery draining: fetch pending deliveries for processing ---

  /**
   * Drain a batch of deliveries ready to send.
   * Returns pending deliveries that are either:
   *   - Never attempted (pending, no nextRetryAt)
   *   - Due for retry (pending, nextRetryAt <= now)
   * Also checks subscriber hasn't opted out mid-flight.
   */
  async drainDeliveryBatch(blastId: string, batchSize: number): Promise<BlastDeliveryRow[]> {
    // Use FOR UPDATE SKIP LOCKED to prevent concurrent pollers from double-sending
    const rows = await this.db.execute(
      sql`WITH claimed AS (
        SELECT id FROM blast_deliveries
        WHERE blast_id = ${blastId}
          AND status = 'pending'
          AND (next_retry_at IS NULL OR next_retry_at <= NOW())
        LIMIT ${batchSize}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE blast_deliveries
      SET status = 'sending'
      WHERE id IN (SELECT id FROM claimed)
      RETURNING *`,
    )

    // db.execute returns Record<string, any>[] — raw SQL results at system boundary
    return rows as BlastDeliveryRow[]
  }

  /**
   * Check if a subscriber has opted out (mid-flight opt-out check).
   */
  async isSubscriberActive(subscriberId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ status: subscribers.status, doubleOptInConfirmed: subscribers.doubleOptInConfirmed })
      .from(subscribers)
      .where(eq(subscribers.id, subscriberId))
      .limit(1)

    return row?.status === 'active' && row.doubleOptInConfirmed === true
  }

  /**
   * Mark a delivery as sent (message accepted by provider).
   */
  async markDeliverySent(deliveryId: string, externalId?: string): Promise<void> {
    await this.db
      .update(blastDeliveries)
      .set({
        status: 'sent',
        externalId: externalId ?? null,
        lastAttemptAt: new Date(),
        attempts: sql`${blastDeliveries.attempts} + 1`,
      })
      .where(eq(blastDeliveries.id, deliveryId))
  }

  /**
   * Mark a delivery as delivered (confirmed by provider webhook).
   */
  async markDeliveryDelivered(deliveryId: string): Promise<void> {
    await this.db
      .update(blastDeliveries)
      .set({
        status: 'delivered',
        deliveredAt: new Date(),
      })
      .where(eq(blastDeliveries.id, deliveryId))
  }

  /**
   * Mark a delivery as failed with retry scheduling.
   * If max retries exceeded, marks as permanently failed.
   */
  async markDeliveryFailed(deliveryId: string, error: string, currentAttempts: number): Promise<void> {
    const newAttempts = currentAttempts + 1

    if (newAttempts >= BLAST_MAX_RETRIES) {
      // Permanently failed
      await this.db
        .update(blastDeliveries)
        .set({
          status: 'failed',
          error,
          failedAt: new Date(),
          lastAttemptAt: new Date(),
          attempts: newAttempts,
        })
        .where(eq(blastDeliveries.id, deliveryId))
    } else {
      // Schedule retry with exponential backoff
      const backoffMs = BLAST_RETRY_BACKOFF_BASE_MS * Math.pow(2, newAttempts - 1)
      const nextRetry = new Date(Date.now() + backoffMs)

      await this.db
        .update(blastDeliveries)
        .set({
          error,
          lastAttemptAt: new Date(),
          nextRetryAt: nextRetry,
          attempts: newAttempts,
        })
        .where(eq(blastDeliveries.id, deliveryId))
    }
  }

  /**
   * Mark a delivery as opted out (subscriber unsubscribed mid-flight).
   */
  async markDeliveryOptedOut(deliveryId: string): Promise<void> {
    await this.db
      .update(blastDeliveries)
      .set({
        status: 'opted_out',
        lastAttemptAt: new Date(),
      })
      .where(eq(blastDeliveries.id, deliveryId))
  }

  // --- Blast stats from delivery rows ---

  /**
   * Compute live stats for a blast from its delivery rows.
   */
  async computeBlastStats(blastId: string): Promise<BlastStats> {
    const rows = await this.db
      .select({
        status: blastDeliveries.status,
        count: count(),
      })
      .from(blastDeliveries)
      .where(eq(blastDeliveries.blastId, blastId))
      .groupBy(blastDeliveries.status)

    const stats: BlastStats = {
      totalRecipients: 0,
      sent: 0,
      delivered: 0,
      failed: 0,
      optedOut: 0,
    }

    for (const row of rows) {
      stats.totalRecipients += row.count
      switch (row.status) {
        case 'sent':
          stats.sent += row.count
          break
        case 'delivered':
          stats.delivered += row.count
          break
        case 'failed':
          stats.failed += row.count
          break
        case 'opted_out':
          stats.optedOut += row.count
          break
        case 'skipped':
          stats.optedOut += row.count
          break
        // 'pending' is implicitly tracked via totalRecipients - others
      }
    }

    return stats
  }

  /**
   * Sync blast stats and check if blast is complete.
   * Transitions blast to 'sent' when all deliveries are terminal.
   */
  async syncBlastStats(blastId: string): Promise<{ stats: BlastStats; completed: boolean }> {
    const stats = await this.computeBlastStats(blastId)
    const blast = await this.getBlast(blastId)

    // Check if any deliveries are still pending
    const pendingCount = stats.totalRecipients - stats.sent - stats.delivered - stats.failed - stats.optedOut
    const completed = pendingCount <= 0

    // Update blast stats
    const updates: Record<string, unknown> = {
      stats,
      updatedAt: new Date(),
    }

    // Only transition to 'sent' from 'sending' — never overwrite 'cancelled'
    if (completed && blast.status === 'sending') {
      updates.status = 'sent'
      updates.completedAt = new Date()
    }

    await this.db
      .update(blasts)
      .set(updates)
      .where(eq(blasts.id, blastId))

    return { stats, completed: completed && blast.status === 'sending' }
  }

  /**
   * Get delivery details for a blast (paginated).
   */
  async getDeliveries(
    blastId: string,
    opts: { status?: BlastDeliveryStatus; limit?: number; offset?: number } = {},
  ): Promise<{ deliveries: BlastDeliveryRow[]; total: number }> {
    const conditions = [eq(blastDeliveries.blastId, blastId)]
    if (opts.status) {
      conditions.push(eq(blastDeliveries.status, opts.status))
    }

    const where = and(...conditions)
    const limit = opts.limit ?? 50
    const offset = opts.offset ?? 0

    const [rows, [totalRow]] = await Promise.all([
      this.db
        .select()
        .from(blastDeliveries)
        .where(where)
        .orderBy(blastDeliveries.createdAt)
        .limit(limit)
        .offset(offset),
      this.db
        .select({ count: count() })
        .from(blastDeliveries)
        .where(where),
    ])

    return { deliveries: rows, total: totalRow.count }
  }

  /**
   * Find a delivery by external ID (for webhook correlation).
   */
  async findDeliveryByExternalId(externalId: string): Promise<BlastDeliveryRow | null> {
    const [row] = await this.db
      .select()
      .from(blastDeliveries)
      .where(eq(blastDeliveries.externalId, externalId))
      .limit(1)

    return row ?? null
  }

  /**
   * Get all blasts currently in 'sending' state.
   */
  async getSendingBlasts(): Promise<BlastRow[]> {
    return this.db
      .select()
      .from(blasts)
      .where(eq(blasts.status, 'sending'))
  }

  /**
   * Get scheduled blasts that are now due for sending.
   */
  async getDueScheduledBlasts(): Promise<BlastRow[]> {
    return this.db
      .select()
      .from(blasts)
      .where(
        and(
          eq(blasts.status, 'scheduled'),
          sql`${blasts.scheduledAt} <= NOW()`,
        ),
      )
  }

  // --- Subscriber identifier resolution ---

  /**
   * Resolve a subscriber's plaintext identifier from their encryptedIdentifier column.
   * Returns null if the subscriber doesn't exist or has no encrypted identifier.
   */
  async resolveSubscriberIdentifier(subscriberId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ encryptedIdentifier: subscribers.encryptedIdentifier })
      .from(subscribers)
      .where(eq(subscribers.id, subscriberId))
      .limit(1)

    if (!row?.encryptedIdentifier) return null

    // Delegate to crypto utility for decryption
    const { decryptContactIdentifier } = await import('../lib/crypto')
    if (!this.hmacSecret) return null
    return decryptContactIdentifier(row.encryptedIdentifier, this.hmacSecret)
  }

  // --- Reset (demo/development only) ---

  async reset(): Promise<void> {
    await this.db.delete(blastDeliveries)
    await this.db.delete(blastSettingsTable)
    await this.db.delete(blasts)
    await this.db.delete(subscribers)
  }
}
