/**
 * CallsService — replaces CallRouterDO.
 *
 * Manages active call state, call history records (encrypted),
 * and volunteer presence derived from shifts + active calls.
 * All state is stored in PostgreSQL via Drizzle ORM.
 */
import { eq, and, desc, sql, gte, lte, count, or, lt } from 'drizzle-orm'
import type { Database } from '../db'
import { activeCalls, callRecords } from '../db/schema'
import { ServiceError } from './settings'
import type { ShiftsService } from './shifts'

/** Ringing calls older than 3 minutes are stale */
const RINGING_TTL_MS = 3 * 60 * 1000

/** In-progress calls older than 2 hours are stale */
const IN_PROGRESS_TTL_MS = 2 * 60 * 60 * 1000

type ActiveCallRow = typeof activeCalls.$inferSelect
type CallRecordRow = typeof callRecords.$inferSelect

export class CallsService {
  constructor(
    protected db: Database,
    private shiftsService?: ShiftsService,
  ) {}

  // =========================================================================
  // Active Calls
  // =========================================================================

  /**
   * List active calls for a hub, automatically expiring stale entries.
   * - Ringing calls > 3 min old -> status 'unanswered', moved to call_records
   * - In-progress calls > 2 hours old -> status 'completed', moved to call_records
   */
  async getActiveCalls(hubId: string): Promise<ActiveCallRow[]> {
    const rows = await this.db
      .select()
      .from(activeCalls)
      .where(eq(activeCalls.hubId, hubId))

    const now = Date.now()
    const active: ActiveCallRow[] = []
    const stale: ActiveCallRow[] = []

    for (const row of rows) {
      const age = now - new Date(row.startedAt).getTime()
      if (
        (row.status === 'ringing' && age > RINGING_TTL_MS) ||
        (row.status === 'in-progress' && age > IN_PROGRESS_TTL_MS)
      ) {
        stale.push(row)
      } else {
        active.push(row)
      }
    }

    // Move stale calls to call_records atomically
    if (stale.length > 0) {
      await this.db.transaction(async (tx) => {
        for (const call of stale) {
          const endedAt = call.endedAt ?? new Date()
          const duration = call.duration ?? Math.floor(
            (new Date(endedAt).getTime() - new Date(call.startedAt).getTime()) / 1000,
          )
          const finalStatus = call.status === 'ringing' ? 'unanswered' : 'completed'

          await tx.insert(callRecords).values({
            callId: call.callId,
            hubId: call.hubId,
            callerLast4: call.callerLast4,
            startedAt: call.startedAt,
            endedAt,
            duration,
            status: finalStatus,
            hasTranscription: call.hasTranscription ?? false,
            hasVoicemail: call.hasVoicemail ?? false,
            hasRecording: call.hasRecording ?? false,
            recordingSid: call.recordingSid,
            encryptedContent: '',
            adminEnvelopes: [],
          }).onConflictDoNothing()

          await tx
            .delete(activeCalls)
            .where(eq(activeCalls.callId, call.callId))
        }
      })
    }

    return active
  }

  /** Count calls started today (active + historical) */
  async getTodayCount(hubId: string): Promise<number> {
    const todayStart = new Date()
    todayStart.setUTCHours(0, 0, 0, 0)

    const [activeResult] = await this.db
      .select({ total: count() })
      .from(activeCalls)
      .where(
        and(
          eq(activeCalls.hubId, hubId),
          gte(activeCalls.startedAt, todayStart),
        ),
      )

    const [historyResult] = await this.db
      .select({ total: count() })
      .from(callRecords)
      .where(
        and(
          eq(callRecords.hubId, hubId),
          gte(callRecords.startedAt, todayStart),
        ),
      )

    return (activeResult?.total ?? 0) + (historyResult?.total ?? 0)
  }

  /**
   * Get presence info: active calls + available volunteers.
   * Delegates to ShiftsService.getCurrentVolunteers for on-shift data.
   */
  async getPresence(hubId: string): Promise<{
    activeCalls: number
    availableVolunteers: number
    users: Array<{ pubkey: string; status: 'available' | 'on-call' }>
  }> {
    const active = await this.getActiveCalls(hubId)

    const onCallPubkeys = new Set(
      active
        .filter(c => c.answeredBy && c.status === 'in-progress')
        .map(c => c.answeredBy!),
    )

    let onShiftPubkeys: string[] = []
    if (this.shiftsService) {
      onShiftPubkeys = await this.shiftsService.getCurrentVolunteers(hubId)
    }

    const presenceUsers = onShiftPubkeys.map(pubkey => ({
      pubkey,
      status: onCallPubkeys.has(pubkey) ? 'on-call' as const : 'available' as const,
    }))

    const available = onShiftPubkeys.filter(pk => !onCallPubkeys.has(pk)).length

    return {
      activeCalls: active.length,
      availableVolunteers: available,
      users: presenceUsers,
    }
  }

  // =========================================================================
  // Call Lifecycle
  // =========================================================================

  /** Add a new active call */
  async addCall(
    hubId: string,
    data: {
      callId: string
      callerNumber: string
      callerLast4?: string
      status?: string
    },
  ): Promise<ActiveCallRow> {
    const [row] = await this.db
      .insert(activeCalls)
      .values({
        callId: data.callId,
        hubId,
        callerNumber: data.callerNumber,
        callerLast4: data.callerLast4 ?? null,
        status: data.status ?? 'ringing',
      })
      .returning()

    return row
  }

  /** Mark a call as answered by a volunteer */
  async answerCall(hubId: string, callId: string, pubkey: string): Promise<ActiveCallRow> {
    const [row] = await this.db
      .update(activeCalls)
      .set({
        answeredBy: pubkey,
        status: 'in-progress',
        answeredAt: new Date(),
      })
      .where(
        and(
          eq(activeCalls.callId, callId),
          eq(activeCalls.hubId, hubId),
        ),
      )
      .returning()

    if (!row) {
      throw new ServiceError(404, 'Call not found')
    }

    return row
  }

  /**
   * End an active call: remove from active_calls and insert into call_records.
   * Accepts optional encrypted content and admin envelopes for the history record.
   */
  async endCall(
    hubId: string,
    callId: string,
    data?: {
      encryptedContent?: string
      adminEnvelopes?: unknown[]
    },
  ): Promise<CallRecordRow> {
    const record = await this.db.transaction(async (tx) => {
      // Fetch and delete the active call
      const [call] = await tx
        .delete(activeCalls)
        .where(
          and(
            eq(activeCalls.callId, callId),
            eq(activeCalls.hubId, hubId),
          ),
        )
        .returning()

      if (!call) {
        throw new ServiceError(404, 'Call not found')
      }

      const endedAt = new Date()
      const duration = Math.floor(
        (endedAt.getTime() - new Date(call.startedAt).getTime()) / 1000,
      )
      const finalStatus = call.answeredBy ? 'completed' : 'unanswered'

      const [row] = await tx
        .insert(callRecords)
        .values({
          callId: call.callId,
          hubId: call.hubId,
          callerLast4: call.callerLast4,
          startedAt: call.startedAt,
          endedAt,
          duration,
          status: finalStatus,
          hasTranscription: call.hasTranscription ?? false,
          hasVoicemail: call.hasVoicemail ?? false,
          hasRecording: call.hasRecording ?? false,
          recordingSid: call.recordingSid,
          encryptedContent: data?.encryptedContent ?? '',
          adminEnvelopes: data?.adminEnvelopes ?? [],
        })
        .returning()

      return row
    })

    return record
  }

  // =========================================================================
  // Call History
  // =========================================================================

  /** Get a single encrypted call record by ID */
  async getCallRecord(callId: string): Promise<CallRecordRow | null> {
    const [row] = await this.db
      .select()
      .from(callRecords)
      .where(eq(callRecords.callId, callId))
      .limit(1)

    return row ?? null
  }

  /**
   * List call history with pagination and optional filters.
   * Supports search by callerLast4 or callId, and date range filtering.
   */
  async listCallHistory(
    hubId: string,
    filters?: {
      search?: string
      dateFrom?: string
      dateTo?: string
      page?: number
      limit?: number
    },
  ): Promise<{
    calls: CallRecordRow[]
    total: number
    hasMore: boolean
  }> {
    const page = filters?.page ?? 1
    const limit = filters?.limit ?? 50
    const offset = (page - 1) * limit

    // Build WHERE conditions
    const conditions = [eq(callRecords.hubId, hubId)]

    if (filters?.search) {
      const q = filters.search.toLowerCase()
      conditions.push(
        or(
          sql`LOWER(${callRecords.callerLast4}) LIKE ${'%' + q + '%'}`,
          sql`LOWER(${callRecords.callId}) LIKE ${'%' + q + '%'}`,
        )!,
      )
    }

    if (filters?.dateFrom) {
      conditions.push(gte(callRecords.startedAt, new Date(filters.dateFrom)))
    }

    if (filters?.dateTo) {
      // dateTo is inclusive of the entire day
      const toDate = new Date(filters.dateTo)
      toDate.setUTCHours(23, 59, 59, 999)
      conditions.push(lte(callRecords.startedAt, toDate))
    }

    const where = and(...conditions)

    // Get total count
    const [countResult] = await this.db
      .select({ total: count() })
      .from(callRecords)
      .where(where)

    const total = countResult?.total ?? 0

    // Get page of results
    const calls = await this.db
      .select()
      .from(callRecords)
      .where(where)
      .orderBy(desc(callRecords.startedAt))
      .limit(limit)
      .offset(offset)

    return {
      calls,
      total,
      hasMore: offset + limit < total,
    }
  }

  // =========================================================================
  // Debug & Reset
  // =========================================================================

  /** Dump active calls state for debugging */
  async debug(hubId: string): Promise<{
    activeCount: number
    activeCalls: Array<{
      callId: string
      status: string
      startedAt: Date
      answeredBy: string | null
      callerLast4: string | null
    }>
  }> {
    const active = await this.db
      .select({
        callId: activeCalls.callId,
        status: activeCalls.status,
        startedAt: activeCalls.startedAt,
        answeredBy: activeCalls.answeredBy,
        callerLast4: activeCalls.callerLast4,
      })
      .from(activeCalls)
      .where(eq(activeCalls.hubId, hubId))

    return {
      activeCount: active.length,
      activeCalls: active,
    }
  }

  /** Get a single active call by callId */
  async getActiveCallById(hubId: string, callId: string): Promise<ActiveCallRow | null> {
    const [row] = await this.db
      .select()
      .from(activeCalls)
      .where(
        and(
          eq(activeCalls.callId, callId),
          eq(activeCalls.hubId, hubId),
        ),
      )
      .limit(1)

    return row ?? null
  }

  /** Look up an active call by ID without hub filtering — for routes with no hub context. */
  async getActiveCallByCallId(callId: string): Promise<ActiveCallRow | null> {
    const [row] = await this.db
      .select()
      .from(activeCalls)
      .where(eq(activeCalls.callId, callId))
      .limit(1)

    return row ?? null
  }

  /** Mark a call as having a voicemail */
  async markVoicemail(hubId: string, callId: string): Promise<{ ok: true }> {
    await this.db
      .update(activeCalls)
      .set({ hasVoicemail: true })
      .where(
        and(
          eq(activeCalls.callId, callId),
          eq(activeCalls.hubId, hubId),
        ),
      )
    return { ok: true }
  }

  /** Update call metadata (recordingSid, hasRecording, etc.) */
  async updateMetadata(
    hubId: string,
    callId: string,
    data: Partial<Pick<ActiveCallRow, 'recordingSid' | 'hasRecording' | 'hasTranscription'>>,
  ): Promise<{ ok: true }> {
    await this.db
      .update(activeCalls)
      .set(data)
      .where(
        and(
          eq(activeCalls.callId, callId),
          eq(activeCalls.hubId, hubId),
        ),
      )
    return { ok: true }
  }

  /** Report a call as spam */
  async reportSpam(hubId: string, callId: string, pubkey: string): Promise<{ ok: true }> {
    // Mark the call as spam in the active calls table
    await this.db
      .update(activeCalls)
      .set({ status: 'spam' })
      .where(
        and(
          eq(activeCalls.callId, callId),
          eq(activeCalls.hubId, hubId),
        ),
      )
    return { ok: true }
  }

  /** Truncate all call data for a hub */
  async reset(hubId: string): Promise<{ ok: true }> {
    await this.db.delete(activeCalls).where(eq(activeCalls.hubId, hubId))
    await this.db.delete(callRecords).where(eq(callRecords.hubId, hubId))
    return { ok: true }
  }
}
