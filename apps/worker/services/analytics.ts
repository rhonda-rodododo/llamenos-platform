/**
 * AnalyticsService — admin dashboard metrics for calls, conversations, shifts, and system health.
 *
 * All queries are hub-scoped. Date range defaults to the last 30 days when not specified.
 */
import { and, count, eq, gte, lte, sql, sum } from 'drizzle-orm'
import type { Database } from '../db'
import { activeCalls, callRecords, conversations, shifts, users } from '../db/schema'

export interface DateRange {
  from: Date
  to: Date
}

export interface CallVolumeByPeriod {
  period: string    // ISO date (YYYY-MM-DD for day, YYYY-WW for week, YYYY-MM for month)
  total: number
  answered: number
  unanswered: number
  abandoned: number
}

export interface CallMetrics {
  totalCalls: number
  answeredCalls: number
  unansweredCalls: number
  abandonedCalls: number
  answerRate: number          // 0–1
  avgDurationSeconds: number  // average for answered calls
  byPeriod: CallVolumeByPeriod[]
}

export interface ConversationMetrics {
  totalConversations: number
  activeConversations: number
  waitingConversations: number
  closedConversations: number
  totalMessages: number
  avgMessagesPerConversation: number
  avgResponseTimeSeconds: number | null
  byChannel: Array<{
    channel: string
    total: number
    active: number
    messages: number
  }>
}

export interface ShiftCoverageSlot {
  date: string        // YYYY-MM-DD
  dayOfWeek: number   // 0 = Sunday
  startTime: string   // HH:MM
  endTime: string     // HH:MM
  volunteerCount: number
  isCovered: boolean
}

export interface ShiftMetrics {
  totalShifts: number
  totalVolunteersScheduled: number   // unique pubkeys across all shifts
  weeklyHoursCovered: number         // total scheduled hours per week
  coverageSlots: ShiftCoverageSlot[] // coverage grid for the upcoming week
}

export interface ServiceStatus {
  name: string
  status: 'ok' | 'degraded' | 'unknown'
  detail?: string
}

export interface SystemHealthMetrics {
  activeCallCount: number
  waitingConversationCount: number
  activeVolunteerCount: number
  services: ServiceStatus[]
}

/** Default date range: last 30 days */
function defaultRange(): DateRange {
  const to = new Date()
  const from = new Date(to)
  from.setDate(from.getDate() - 30)
  return { from, to }
}

export class AnalyticsService {
  constructor(private db: Database) {}

  // =========================================================================
  // Call Metrics
  // =========================================================================

  async getCallMetrics(hubId: string, range?: Partial<DateRange>): Promise<CallMetrics> {
    const { from, to } = { ...defaultRange(), ...range }

    const [summary] = await this.db
      .select({
        total: count(),
        answered: sum(
          sql<number>`CASE WHEN ${callRecords.status} = 'completed' THEN 1 ELSE 0 END`,
        ).mapWith(Number),
        unanswered: sum(
          sql<number>`CASE WHEN ${callRecords.status} = 'unanswered' THEN 1 ELSE 0 END`,
        ).mapWith(Number),
        abandoned: sum(
          sql<number>`CASE WHEN ${callRecords.status} = 'abandoned' THEN 1 ELSE 0 END`,
        ).mapWith(Number),
        avgDuration: sql<number>`COALESCE(AVG(CASE WHEN ${callRecords.status} = 'completed' THEN ${callRecords.duration} ELSE NULL END), 0)`.mapWith(Number),
      })
      .from(callRecords)
      .where(
        and(
          hubId ? eq(callRecords.hubId, hubId) : undefined,
          gte(callRecords.startedAt, from),
          lte(callRecords.startedAt, to),
        ),
      )

    const totalCalls = summary?.total ?? 0
    const answeredCalls = summary?.answered ?? 0
    const unansweredCalls = summary?.unanswered ?? 0
    const abandonedCalls = summary?.abandoned ?? 0
    const avgDurationSeconds = Math.round(summary?.avgDuration ?? 0)

    const byPeriod = await this.getCallVolumeByDay(hubId, from, to)

    return {
      totalCalls,
      answeredCalls,
      unansweredCalls,
      abandonedCalls,
      answerRate: totalCalls > 0 ? answeredCalls / totalCalls : 0,
      avgDurationSeconds,
      byPeriod,
    }
  }

  private async getCallVolumeByDay(
    hubId: string,
    from: Date,
    to: Date,
  ): Promise<CallVolumeByPeriod[]> {
    const rows = await this.db
      .select({
        period: sql<string>`DATE(${callRecords.startedAt})::text`,
        total: count(),
        answered: sum(
          sql<number>`CASE WHEN ${callRecords.status} = 'completed' THEN 1 ELSE 0 END`,
        ).mapWith(Number),
        unanswered: sum(
          sql<number>`CASE WHEN ${callRecords.status} = 'unanswered' THEN 1 ELSE 0 END`,
        ).mapWith(Number),
        abandoned: sum(
          sql<number>`CASE WHEN ${callRecords.status} = 'abandoned' THEN 1 ELSE 0 END`,
        ).mapWith(Number),
      })
      .from(callRecords)
      .where(
        and(
          hubId ? eq(callRecords.hubId, hubId) : undefined,
          gte(callRecords.startedAt, from),
          lte(callRecords.startedAt, to),
        ),
      )
      .groupBy(sql`DATE(${callRecords.startedAt})`)
      .orderBy(sql`DATE(${callRecords.startedAt})`)

    return rows.map((r) => ({
      period: r.period,
      total: r.total,
      answered: r.answered ?? 0,
      unanswered: r.unanswered ?? 0,
      abandoned: r.abandoned ?? 0,
    }))
  }

  // =========================================================================
  // Conversation Metrics
  // =========================================================================

  async getConversationMetrics(
    hubId: string,
    range?: Partial<DateRange>,
  ): Promise<ConversationMetrics> {
    const { from, to } = { ...defaultRange(), ...range }

    const [summary] = await this.db
      .select({
        total: count(),
        active: sum(
          sql<number>`CASE WHEN ${conversations.status} = 'active' THEN 1 ELSE 0 END`,
        ).mapWith(Number),
        waiting: sum(
          sql<number>`CASE WHEN ${conversations.status} = 'waiting' THEN 1 ELSE 0 END`,
        ).mapWith(Number),
        closed: sum(
          sql<number>`CASE WHEN ${conversations.status} = 'closed' THEN 1 ELSE 0 END`,
        ).mapWith(Number),
        totalMessages: sum(conversations.messageCount).mapWith(Number),
        avgMessages: sql<number>`COALESCE(AVG(${conversations.messageCount}), 0)`.mapWith(Number),
      })
      .from(conversations)
      .where(
        and(
          hubId ? eq(conversations.hubId, hubId) : undefined,
          gte(conversations.createdAt, from),
          lte(conversations.createdAt, to),
        ),
      )

    // Average response time: average gap between inbound message created_at
    // and the next outbound message in the same conversation (approximated via
    // a CTE so we avoid a correlated subquery alias conflict with Drizzle's ORM).
    // Returns null when there are no conversation pairs to measure.
    const responseTimeResult = await this.db.execute(sql`
      WITH first_responses AS (
        SELECT
          m_in.conversation_id,
          MIN(EXTRACT(EPOCH FROM (m_out.created_at - m_in.created_at))) AS gap_seconds
        FROM messages m_in
        JOIN messages m_out
          ON m_out.conversation_id = m_in.conversation_id
         AND m_out.direction = 'outbound'
         AND m_out.created_at > m_in.created_at
        JOIN conversations c ON c.id = m_in.conversation_id
        WHERE m_in.direction = 'inbound'
          ${hubId ? sql`AND c.hub_id = ${hubId}` : sql``}
          AND c.created_at >= ${from}
          AND c.created_at <= ${to}
        GROUP BY m_in.conversation_id
      )
      SELECT COALESCE(ROUND(AVG(gap_seconds)), NULL) AS avg_seconds
      FROM first_responses
    `)
    const avgRaw = (responseTimeResult as Array<{ avg_seconds: string | null }>)[0]?.avg_seconds
    const avgResponseTimeSeconds = avgRaw != null ? Number(avgRaw) : null

    const byChannel = await this.getConversationsByChannel(hubId, from, to)

    return {
      totalConversations: summary?.total ?? 0,
      activeConversations: summary?.active ?? 0,
      waitingConversations: summary?.waiting ?? 0,
      closedConversations: summary?.closed ?? 0,
      totalMessages: summary?.totalMessages ?? 0,
      avgMessagesPerConversation: Math.round((summary?.avgMessages ?? 0) * 10) / 10,
      avgResponseTimeSeconds,
      byChannel,
    }
  }

  private async getConversationsByChannel(
    hubId: string,
    from: Date,
    to: Date,
  ): Promise<ConversationMetrics['byChannel']> {
    const rows = await this.db
      .select({
        channel: conversations.channelType,
        total: count(),
        active: sum(
          sql<number>`CASE WHEN ${conversations.status} = 'active' THEN 1 ELSE 0 END`,
        ).mapWith(Number),
        messages: sum(conversations.messageCount).mapWith(Number),
      })
      .from(conversations)
      .where(
        and(
          hubId ? eq(conversations.hubId, hubId) : undefined,
          gte(conversations.createdAt, from),
          lte(conversations.createdAt, to),
        ),
      )
      .groupBy(conversations.channelType)
      .orderBy(conversations.channelType)

    return rows.map((r) => ({
      channel: r.channel,
      total: r.total,
      active: r.active ?? 0,
      messages: r.messages ?? 0,
    }))
  }

  // =========================================================================
  // Shift Metrics
  // =========================================================================

  async getShiftMetrics(hubId: string): Promise<ShiftMetrics> {
    const rows = await this.db
      .select()
      .from(shifts)
      .where(hubId ? eq(shifts.hubId, hubId) : undefined)

    const uniqueVolunteers = new Set<string>()
    let totalMinutesPerWeek = 0

    for (const shift of rows) {
      for (const pubkey of shift.userPubkeys) {
        uniqueVolunteers.add(pubkey)
      }
      // Calculate weekly hours from start/end time strings (HH:MM) * days per week
      const [startH, startM] = shift.startTime.split(':').map(Number)
      const [endH, endM] = shift.endTime.split(':').map(Number)
      if (
        startH !== undefined &&
        startM !== undefined &&
        endH !== undefined &&
        endM !== undefined
      ) {
        const durationMinutes = endH * 60 + endM - (startH * 60 + startM)
        totalMinutesPerWeek += (durationMinutes > 0 ? durationMinutes : 0) * shift.days.length
      }
    }

    const weeklyHoursCovered = Math.round((totalMinutesPerWeek / 60) * 10) / 10

    // Build coverage grid for the next 7 days
    const coverageSlots = this.buildCoverageSlots(rows)

    return {
      totalShifts: rows.length,
      totalVolunteersScheduled: uniqueVolunteers.size,
      weeklyHoursCovered,
      coverageSlots,
    }
  }

  private buildCoverageSlots(
    shiftRows: Array<(typeof shifts)['$inferSelect']>,
  ): ShiftCoverageSlot[] {
    const slots: ShiftCoverageSlot[] = []
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const date = new Date(today)
      date.setDate(today.getDate() + dayOffset)
      const dayOfWeek = date.getDay()
      const dateStr = date.toISOString().slice(0, 10)

      const dayShifts = shiftRows.filter((s) => s.days.includes(dayOfWeek))
      for (const shift of dayShifts) {
        slots.push({
          date: dateStr,
          dayOfWeek,
          startTime: shift.startTime,
          endTime: shift.endTime,
          volunteerCount: shift.userPubkeys.length,
          isCovered: shift.userPubkeys.length > 0,
        })
      }
    }

    return slots
  }

  // =========================================================================
  // System Health
  // =========================================================================

  async getSystemHealth(hubId: string): Promise<SystemHealthMetrics> {
    // Active calls right now
    const [activeCallRow] = await this.db
      .select({ total: count() })
      .from(activeCalls)
      .where(hubId ? eq(activeCalls.hubId, hubId) : undefined)

    // Waiting conversations right now
    const [waitingConvRow] = await this.db
      .select({ total: count() })
      .from(conversations)
      .where(
        and(
          hubId ? eq(conversations.hubId, hubId) : undefined,
          eq(conversations.status, 'waiting'),
        ),
      )

    // Active (available) volunteers for this hub
    const [activeVolRow] = await this.db
      .select({ total: count() })
      .from(users)
      .where(and(eq(users.availability, 'available'), eq(users.active, true)))

    // Service checks
    const services: ServiceStatus[] = []

    try {
      await this.db.execute(sql`SELECT 1`)
      services.push({ name: 'postgres', status: 'ok' })
    } catch (err) {
      services.push({
        name: 'postgres',
        status: 'degraded',
        detail: err instanceof Error ? err.message : 'unreachable',
      })
    }

    return {
      activeCallCount: activeCallRow?.total ?? 0,
      waitingConversationCount: waitingConvRow?.total ?? 0,
      activeVolunteerCount: activeVolRow?.total ?? 0,
      services,
    }
  }
}
