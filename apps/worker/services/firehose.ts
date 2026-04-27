/**
 * FirehoseService — CRUD and buffer operations for firehose connections.
 *
 * Manages the lifecycle of firehose connections (Signal group → inference agent),
 * encrypted message buffer, window keys for forward secrecy, and notification opt-outs.
 */
import { and, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm'
import type { Database } from '../db'
import {
  firehoseConnections,
  firehoseMessageBuffer,
  firehoseWindowKeys,
  firehoseNotificationOptouts,
} from '../db/schema/firehose'
import type { FirehoseConnectionStatus } from '@protocol/schemas/firehose'

type FirehoseConnection = typeof firehoseConnections.$inferSelect
type FirehoseMessageBufferRow = typeof firehoseMessageBuffer.$inferSelect
type FirehoseWindowKey = typeof firehoseWindowKeys.$inferSelect
type FirehoseNotificationOptout = typeof firehoseNotificationOptouts.$inferSelect

export interface CreateConnectionData {
  id?: string
  signalGroupId?: string | null
  displayName?: string
  encryptedDisplayName?: unknown
  reportTypeId: string
  agentPubkey: string
  encryptedAgentNsec: string
  geoContext?: string | null
  geoContextCountryCodes?: string[] | null
  inferenceEndpoint?: string | null
  extractionIntervalSec?: number
  systemPromptSuffix?: string | null
  bufferTtlDays?: number
  notifyViaSignal?: boolean
  status?: FirehoseConnectionStatus
}

export type UpdateConnectionData = Omit<
  Partial<CreateConnectionData>,
  'agentPubkey' | 'encryptedAgentNsec'
>

export interface AddBufferMessageData {
  signalTimestamp: Date
  encryptedContent: string
  encryptedSenderInfo: string
  windowKeyId?: string
  expiresAt: Date
}

export interface CreateWindowKeyData {
  connectionId: string
  sealedKey: string
  windowStart: Date
  windowEnd: Date
}

export class FirehoseService {
  constructor(protected readonly db: Database) {}

  // ---------------------------------------------------------------------------
  // Connection CRUD
  // ---------------------------------------------------------------------------

  async createConnection(hubId: string, data: CreateConnectionData): Promise<FirehoseConnection> {
    const id = data.id ?? crypto.randomUUID()
    const now = new Date()
    const [row] = await this.db
      .insert(firehoseConnections)
      .values({
        id,
        hubId,
        signalGroupId: data.signalGroupId ?? null,
        displayName: data.displayName ?? '',
        encryptedDisplayName: data.encryptedDisplayName ?? null,
        reportTypeId: data.reportTypeId,
        agentPubkey: data.agentPubkey,
        encryptedAgentNsec: data.encryptedAgentNsec,
        geoContext: data.geoContext ?? null,
        geoContextCountryCodes: data.geoContextCountryCodes ?? null,
        inferenceEndpoint: data.inferenceEndpoint ?? null,
        extractionIntervalSec: data.extractionIntervalSec ?? 60,
        systemPromptSuffix: data.systemPromptSuffix ?? null,
        bufferTtlDays: data.bufferTtlDays ?? 7,
        notifyViaSignal: data.notifyViaSignal ?? true,
        status: data.status ?? 'pending',
        createdAt: now,
        updatedAt: now,
      })
      .returning()
    return row
  }

  async getConnection(id: string): Promise<FirehoseConnection | null> {
    const rows = await this.db
      .select()
      .from(firehoseConnections)
      .where(eq(firehoseConnections.id, id))
      .limit(1)
    return rows[0] ?? null
  }

  async listConnections(hubId: string): Promise<FirehoseConnection[]> {
    return this.db
      .select()
      .from(firehoseConnections)
      .where(eq(firehoseConnections.hubId, hubId))
      .orderBy(firehoseConnections.createdAt)
  }

  async listActiveConnections(): Promise<FirehoseConnection[]> {
    return this.db
      .select()
      .from(firehoseConnections)
      .where(eq(firehoseConnections.status, 'active'))
      .orderBy(firehoseConnections.createdAt)
  }

  async updateConnection(
    id: string,
    data: UpdateConnectionData,
  ): Promise<FirehoseConnection | null> {
    const now = new Date()
    const rows = await this.db
      .update(firehoseConnections)
      .set({
        ...(data.signalGroupId !== undefined ? { signalGroupId: data.signalGroupId } : {}),
        ...(data.displayName !== undefined ? { displayName: data.displayName } : {}),
        ...(data.encryptedDisplayName !== undefined
          ? { encryptedDisplayName: data.encryptedDisplayName }
          : {}),
        ...(data.reportTypeId !== undefined ? { reportTypeId: data.reportTypeId } : {}),
        ...(data.geoContext !== undefined ? { geoContext: data.geoContext } : {}),
        ...(data.geoContextCountryCodes !== undefined
          ? { geoContextCountryCodes: data.geoContextCountryCodes }
          : {}),
        ...(data.inferenceEndpoint !== undefined
          ? { inferenceEndpoint: data.inferenceEndpoint }
          : {}),
        ...(data.extractionIntervalSec !== undefined
          ? { extractionIntervalSec: data.extractionIntervalSec }
          : {}),
        ...(data.systemPromptSuffix !== undefined
          ? { systemPromptSuffix: data.systemPromptSuffix }
          : {}),
        ...(data.bufferTtlDays !== undefined ? { bufferTtlDays: data.bufferTtlDays } : {}),
        ...(data.notifyViaSignal !== undefined ? { notifyViaSignal: data.notifyViaSignal } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        updatedAt: now,
      })
      .where(eq(firehoseConnections.id, id))
      .returning()
    return rows[0] ?? null
  }

  async setAgentKeypair(
    id: string,
    pubkey: string,
    encryptedNsec: string,
  ): Promise<FirehoseConnection | null> {
    const now = new Date()
    const rows = await this.db
      .update(firehoseConnections)
      .set({ agentPubkey: pubkey, encryptedAgentNsec: encryptedNsec, updatedAt: now })
      .where(eq(firehoseConnections.id, id))
      .returning()
    return rows[0] ?? null
  }

  async deleteConnection(id: string): Promise<void> {
    await this.db.delete(firehoseConnections).where(eq(firehoseConnections.id, id))
  }

  async findConnectionBySignalGroup(
    signalGroupId: string,
    hubId?: string,
  ): Promise<FirehoseConnection | null> {
    const conditions = [eq(firehoseConnections.signalGroupId, signalGroupId)]
    if (hubId !== undefined) {
      conditions.push(eq(firehoseConnections.hubId, hubId))
    }
    const rows = await this.db
      .select()
      .from(firehoseConnections)
      .where(and(...conditions))
      .limit(1)
    return rows[0] ?? null
  }

  async findPendingConnection(hubId: string): Promise<FirehoseConnection | null> {
    const rows = await this.db
      .select()
      .from(firehoseConnections)
      .where(
        and(
          eq(firehoseConnections.hubId, hubId),
          eq(firehoseConnections.status, 'pending'),
          isNull(firehoseConnections.signalGroupId),
        ),
      )
      .orderBy(firehoseConnections.createdAt)
      .limit(1)
    return rows[0] ?? null
  }

  // ---------------------------------------------------------------------------
  // Buffer Operations
  // ---------------------------------------------------------------------------

  async addBufferMessage(
    connectionId: string,
    data: AddBufferMessageData,
  ): Promise<FirehoseMessageBufferRow> {
    const id = crypto.randomUUID()
    const [row] = await this.db
      .insert(firehoseMessageBuffer)
      .values({
        id,
        connectionId,
        signalTimestamp: data.signalTimestamp,
        encryptedContent: data.encryptedContent,
        encryptedSenderInfo: data.encryptedSenderInfo,
        windowKeyId: data.windowKeyId ?? null,
        clusterId: null,
        extractedReportId: null,
        receivedAt: new Date(),
        expiresAt: data.expiresAt,
      })
      .returning()
    return row
  }

  async getUnextractedMessages(connectionId: string): Promise<FirehoseMessageBufferRow[]> {
    return this.db
      .select()
      .from(firehoseMessageBuffer)
      .where(
        and(
          eq(firehoseMessageBuffer.connectionId, connectionId),
          isNull(firehoseMessageBuffer.extractedReportId),
        ),
      )
      .orderBy(firehoseMessageBuffer.signalTimestamp)
  }

  async markMessagesExtracted(
    messageIds: string[],
    reportId: string,
    clusterId: string,
  ): Promise<void> {
    if (messageIds.length === 0) return
    await this.db
      .update(firehoseMessageBuffer)
      .set({ extractedReportId: reportId, clusterId })
      .where(inArray(firehoseMessageBuffer.id, messageIds))
  }

  async purgeExpiredMessages(): Promise<number> {
    const now = new Date()
    const result = await this.db
      .delete(firehoseMessageBuffer)
      .where(lt(firehoseMessageBuffer.expiresAt, now))
      .returning({ id: firehoseMessageBuffer.id })
    return result.length
  }

  async getBufferSize(connectionId: string): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(firehoseMessageBuffer)
      .where(eq(firehoseMessageBuffer.connectionId, connectionId))
    return result[0]?.count ?? 0
  }

  // ---------------------------------------------------------------------------
  // Window Key Operations
  // ---------------------------------------------------------------------------

  async createWindowKey(data: CreateWindowKeyData): Promise<FirehoseWindowKey> {
    const id = crypto.randomUUID()
    const [row] = await this.db
      .insert(firehoseWindowKeys)
      .values({
        id,
        connectionId: data.connectionId,
        sealedKey: data.sealedKey,
        windowStart: data.windowStart,
        windowEnd: data.windowEnd,
        messageCount: 0,
        createdAt: new Date(),
      })
      .returning()
    return row
  }

  async getWindowKey(id: string): Promise<FirehoseWindowKey | null> {
    const rows = await this.db
      .select()
      .from(firehoseWindowKeys)
      .where(eq(firehoseWindowKeys.id, id))
      .limit(1)
    return rows[0] ?? null
  }

  async getCurrentWindowKey(connectionId: string): Promise<FirehoseWindowKey | null> {
    const now = new Date()
    const rows = await this.db
      .select()
      .from(firehoseWindowKeys)
      .where(
        and(
          eq(firehoseWindowKeys.connectionId, connectionId),
          lt(firehoseWindowKeys.windowStart, now),
        ),
      )
      .orderBy(desc(firehoseWindowKeys.windowStart))
      .limit(1)
    // Return the most recent window that started before now
    return rows[0] ?? null
  }

  async incrementWindowKeyMessageCount(windowKeyId: string): Promise<void> {
    await this.db
      .update(firehoseWindowKeys)
      .set({ messageCount: sql`${firehoseWindowKeys.messageCount} + 1` })
      .where(eq(firehoseWindowKeys.id, windowKeyId))
  }

  async purgeExpiredWindowKeys(connectionId: string, retainDays: number): Promise<number> {
    const cutoff = new Date(Date.now() - retainDays * 24 * 60 * 60 * 1000)
    const result = await this.db
      .delete(firehoseWindowKeys)
      .where(
        and(
          eq(firehoseWindowKeys.connectionId, connectionId),
          lt(firehoseWindowKeys.windowEnd, cutoff),
        ),
      )
      .returning({ id: firehoseWindowKeys.id })
    return result.length
  }

  // ---------------------------------------------------------------------------
  // Notification Opt-outs
  // ---------------------------------------------------------------------------

  async addOptout(connectionId: string, userId: string): Promise<FirehoseNotificationOptout> {
    const id = crypto.randomUUID()
    const now = new Date()
    const [row] = await this.db
      .insert(firehoseNotificationOptouts)
      .values({ id, connectionId, userId, optedOutAt: now })
      .onConflictDoNothing()
      .returning()
    if (row) return row
    const existing = await this.db
      .select()
      .from(firehoseNotificationOptouts)
      .where(
        and(
          eq(firehoseNotificationOptouts.connectionId, connectionId),
          eq(firehoseNotificationOptouts.userId, userId),
        ),
      )
      .limit(1)
    return existing[0]
  }

  async removeOptout(connectionId: string, userId: string): Promise<void> {
    await this.db
      .delete(firehoseNotificationOptouts)
      .where(
        and(
          eq(firehoseNotificationOptouts.connectionId, connectionId),
          eq(firehoseNotificationOptouts.userId, userId),
        ),
      )
  }

  async isOptedOut(connectionId: string, userId: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: firehoseNotificationOptouts.id })
      .from(firehoseNotificationOptouts)
      .where(
        and(
          eq(firehoseNotificationOptouts.connectionId, connectionId),
          eq(firehoseNotificationOptouts.userId, userId),
        ),
      )
      .limit(1)
    return rows.length > 0
  }

  // ---------------------------------------------------------------------------
  // Test Helpers
  // ---------------------------------------------------------------------------

  async resetForTest(): Promise<void> {
    await this.db.delete(firehoseConnections)
  }
}
