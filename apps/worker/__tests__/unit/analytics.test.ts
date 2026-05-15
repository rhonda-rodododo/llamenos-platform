import { describe, it, expect } from 'vitest'
import { AnalyticsService } from '@worker/services/analytics'
import { createMockDb } from './mock-db'

describe('AnalyticsService', () => {
  function setup() {
    const { db } = createMockDb(['callRecords', 'conversations', 'shifts', 'activeCalls', 'users', 'notes'])
    const service = new AnalyticsService(db as any)
    return { db, service }
  }

  describe('getCallMetrics', () => {
    it('returns call metrics for hub', async () => {
      const { db, service } = setup()
      db.$setSelectResults([
        [{ total: 10, answered: 7, unanswered: 2, abandoned: 1, avgDuration: 120 }],
        [
          { period: '2024-01-01', total: 5, answered: 3, unanswered: 1, abandoned: 1 },
          { period: '2024-01-02', total: 5, answered: 4, unanswered: 1, abandoned: 0 },
        ],
      ])

      const result = await service.getCallMetrics('hub-1')
      expect(result.totalCalls).toBe(10)
      expect(result.answeredCalls).toBe(7)
      expect(result.answerRate).toBe(0.7)
      expect(result.avgDurationSeconds).toBe(120)
      expect(result.byPeriod).toHaveLength(2)
    })

    it('handles zero calls', async () => {
      const { db, service } = setup()
      db.$setSelectResults([
        [{ total: 0, answered: 0, unanswered: 0, abandoned: 0, avgDuration: 0 }],
        [],
      ])

      const result = await service.getCallMetrics('hub-1')
      expect(result.totalCalls).toBe(0)
      expect(result.answerRate).toBe(0)
    })
  })

  describe('getConversationMetrics', () => {
    it('returns conversation metrics', async () => {
      const { db, service } = setup()
      db.$setSelectResults([
        [{ total: 10, active: 3, waiting: 2, closed: 5, totalMessages: 50, avgMessages: 5 }],
        [
          { channel: 'sms', total: 6, active: 2, messages: 30 },
          { channel: 'whatsapp', total: 4, active: 1, messages: 20 },
        ],
      ])
      db.$setExecuteResult([{ avg_seconds: '45' }])

      const result = await service.getConversationMetrics('hub-1')
      expect(result.totalConversations).toBe(10)
      expect(result.activeConversations).toBe(3)
      expect(result.totalMessages).toBe(50)
      expect(result.avgResponseTimeSeconds).toBe(45)
      expect(result.byChannel).toHaveLength(2)
    })
  })

  describe('getShiftMetrics', () => {
    it('returns shift metrics', async () => {
      const { db, service } = setup()
      db.$setSelectResult([
        { id: 'shift-1', startTime: '08:00', endTime: '12:00', days: [1, 2, 3], userPubkeys: ['pk1', 'pk2'] },
        { id: 'shift-2', startTime: '14:00', endTime: '18:00', days: [1, 2], userPubkeys: ['pk2', 'pk3'] },
      ])

      const result = await service.getShiftMetrics('hub-1')
      expect(result.totalShifts).toBe(2)
      expect(result.totalVolunteersScheduled).toBe(3)
      expect(result.weeklyHoursCovered).toBeGreaterThan(0)
      expect(result.coverageSlots).toHaveLength(5)
    })
  })

  describe('getSystemHealth', () => {
    it('returns system health', async () => {
      const { db, service } = setup()
      db.$setSelectResults([
        [{ total: 2 }],
        [{ total: 3 }],
        [{ total: 5 }],
      ])
      db.$setExecuteResult([{ avg_seconds: '45' }])

      const result = await service.getSystemHealth('hub-1')
      expect(result.activeCallCount).toBe(2)
      expect(result.waitingConversationCount).toBe(3)
      expect(result.activeVolunteerCount).toBe(5)
      expect(result.services).toContainEqual(expect.objectContaining({ name: 'postgres', status: 'ok' }))
    })
  })

  describe('getHourlyDistribution', () => {
    it('returns 24 buckets with counts, filling zeros for missing hours', async () => {
      const { db, service } = setup()
      // Mock returns rows for hours 9, 10, 14 only
      db.$setSelectResults([
        [
          { hour: 9, count: 5 },
          { hour: 10, count: 12 },
          { hour: 14, count: 3 },
        ],
      ])
      const result = await service.getHourlyDistribution('hub-1', {
        from: new Date('2026-05-01'),
        to: new Date('2026-05-07'),
      })
      expect(result.buckets).toHaveLength(24)
      expect(result.buckets[9]).toEqual({ hour: 9, count: 5 })
      expect(result.buckets[10]).toEqual({ hour: 10, count: 12 })
      expect(result.buckets[0]).toEqual({ hour: 0, count: 0 })
      expect(result.totalCalls).toBe(20)
    })

    it('throws when hubId is undefined', async () => {
      const { service } = setup()
      await expect(
        service.getHourlyDistribution(undefined, {
          from: new Date('2026-05-01'),
          to: new Date('2026-05-07'),
        }),
      ).rejects.toThrow('hubId is required for analytics queries')
    })
  })

  describe('getUserStats', () => {
    it('returns per-user stats sorted by calls answered desc', async () => {
      const { db, service } = setup()
      db.$setSelectResults([
        [
          { pubkey: 'pk-alice', displayName: 'Alice', callsAnswered: 15, avgDuration: 180 },
          { pubkey: 'pk-bob', displayName: 'Bob', callsAnswered: 8, avgDuration: 120 },
        ],
        [
          { authorPubkey: 'pk-alice', notesCount: 10 },
          { authorPubkey: 'pk-bob', notesCount: 3 },
        ],
      ])
      const result = await service.getUserStats('hub-1', {
        from: new Date('2026-05-01'),
        to: new Date('2026-05-07'),
      })
      expect(result.users).toHaveLength(2)
      expect(result.users[0]).toEqual({
        pubkey: 'pk-alice',
        displayName: 'Alice',
        callsAnswered: 15,
        avgDurationSeconds: 180,
        notesCreated: 10,
      })
      expect(result.users[1].callsAnswered).toBe(8)
    })

    it('handles users with no notes', async () => {
      const { db, service } = setup()
      db.$setSelectResults([
        [{ pubkey: 'pk-carol', displayName: null, callsAnswered: 5, avgDuration: 90 }],
        [],
      ])
      const result = await service.getUserStats('hub-1', {
        from: new Date('2026-05-01'),
        to: new Date('2026-05-07'),
      })
      expect(result.users[0].notesCreated).toBe(0)
      expect(result.users[0].displayName).toBeNull()
    })
  })

  describe('getPersonalStats', () => {
    it('returns personal stats for a single user', async () => {
      const { db, service } = setup()
      db.$setSelectResults([
        [{ callsToday: 3 }],
        [{ callsInPeriod: 25, avgDuration: 210 }],
        [{ notesCount: 12 }],
      ])
      const result = await service.getPersonalStats('hub-1', 'pk-alice', {
        from: new Date('2026-05-01'),
        to: new Date('2026-05-07'),
      })
      expect(result).toEqual({
        callsToday: 3,
        callsThisPeriod: 25,
        avgDurationSeconds: 210,
        notesCreatedThisPeriod: 12,
      })
    })

    it('returns zeros when user has no activity', async () => {
      const { db, service } = setup()
      db.$setSelectResults([
        [{ callsToday: 0 }],
        [{ callsInPeriod: 0, avgDuration: 0 }],
        [{ notesCount: 0 }],
      ])
      const result = await service.getPersonalStats('hub-1', 'pk-newuser')
      expect(result.callsToday).toBe(0)
      expect(result.callsThisPeriod).toBe(0)
      expect(result.notesCreatedThisPeriod).toBe(0)
    })
  })
})
