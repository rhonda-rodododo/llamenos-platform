import { describe, it, expect } from 'bun:test'
import { AnalyticsService } from '@worker/services/analytics'
import { createMockDb } from './mock-db'

describe('AnalyticsService', () => {
  function setup() {
    const { db } = createMockDb(['callRecords', 'conversations', 'shifts', 'activeCalls', 'users'])
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
})
