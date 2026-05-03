import { describe, it, expect } from 'bun:test'
import { ShiftsService } from '@worker/services/shifts'
import { ServiceError } from '@worker/services/settings'
import { createMockDb } from './mock-db'

describe('ShiftsService', () => {
  function setup(opts: { fallbackPubkeys?: string[] } = {}) {
    const { db } = createMockDb(['shifts', 'pushRemindersSent'])
    const settingsService = opts.fallbackPubkeys
      ? { getFallbackGroup: async () => ({ userPubkeys: opts.fallbackPubkeys! }) }
      : undefined
    const service = new ShiftsService(db as any, settingsService)
    return { db, service }
  }

  function makeShift(overrides: Partial<{ id: string; hubId: string; name: string; startTime: string; endTime: string; days: number[]; userPubkeys: string[] }> = {}) {
    return {
      id: 'shift-1',
      hubId: 'hub-1',
      name: 'Morning',
      startTime: '08:00',
      endTime: '12:00',
      days: [1, 2, 3, 4, 5],
      userPubkeys: ['pk1', 'pk2'],
      createdAt: new Date(),
      ...overrides,
    }
  }

  describe('create', () => {
    it('creates a shift with valid times', async () => {
      const { db, service } = setup()
      const shift = makeShift()
      db.$setInsertResult([shift])

      const result = await service.create('hub-1', {
        name: 'Morning',
        startTime: '08:00',
        endTime: '12:00',
        days: [1, 2, 3, 4, 5],
        userPubkeys: ['pk1', 'pk2'],
      })

      expect(result.name).toBe('Morning')
    })

    it('rejects invalid time format', async () => {
      const { service } = setup()
      await expect(service.create('hub-1', {
        name: 'Bad',
        startTime: '8:00',
        endTime: '12:00',
        days: [1],
        userPubkeys: [],
      })).rejects.toThrow(ServiceError)
    })

    it('rejects 24:00', async () => {
      const { service } = setup()
      await expect(service.create('hub-1', {
        name: 'Bad',
        startTime: '24:00',
        endTime: '12:00',
        days: [1],
        userPubkeys: [],
      })).rejects.toThrow(ServiceError)
    })

    it('rejects invalid minutes', async () => {
      const { service } = setup()
      await expect(service.create('hub-1', {
        name: 'Bad',
        startTime: '08:60',
        endTime: '12:00',
        days: [1],
        userPubkeys: [],
      })).rejects.toThrow(ServiceError)
    })
  })

  describe('update', () => {
    it('updates a shift', async () => {
      const { db, service } = setup()
      const updated = makeShift({ name: 'Updated' })
      db.$setUpdateResult([updated])

      const result = await service.update('hub-1', 'shift-1', { name: 'Updated' })
      expect(result.name).toBe('Updated')
    })

    it('throws 404 if shift not found', async () => {
      const { db, service } = setup()
      db.$setUpdateResult([])

      await expect(service.update('hub-1', 'shift-1', { name: 'Updated' }))
        .rejects.toThrow('Shift not found')
    })

    it('validates startTime format', async () => {
      const { service } = setup()
      await expect(service.update('hub-1', 'shift-1', { startTime: '8:00' }))
        .rejects.toThrow('Invalid time format')
    })
  })

  describe('delete', () => {
    it('deletes existing shift', async () => {
      const { db, service } = setup()
      db.$setDeleteResult([{ id: 'shift-1' }])

      const result = await service.delete('hub-1', 'shift-1')
      expect(result.ok).toBe(true)
    })

    it('throws 404 for missing shift', async () => {
      const { db, service } = setup()
      db.$setDeleteResult([])

      await expect(service.delete('hub-1', 'shift-1'))
        .rejects.toThrow('Shift not found')
    })
  })

  describe('getCurrentVolunteers', () => {
    it('returns active volunteers', async () => {
      const { db, service } = setup()
      const now = new Date()
      const currentDay = now.getUTCDay()
      const currentHour = String(now.getUTCHours()).padStart(2, '0')
      const nextHour = String((now.getUTCHours() + 1) % 24).padStart(2, '0')

      db.$setSelectResult([makeShift({
        days: [currentDay],
        startTime: `${currentHour}:00`,
        endTime: `${nextHour}:00`,
        userPubkeys: ['pk1', 'pk2'],
      })])

      const result = await service.getCurrentVolunteers('hub-1')
      expect(result).toContain('pk1')
      expect(result).toContain('pk2')
    })

    it('returns unique volunteers across multiple shifts', async () => {
      const { db, service } = setup()
      const now = new Date()
      const currentDay = now.getUTCDay()
      const currentHour = String(now.getUTCHours()).padStart(2, '0')
      const nextHour = String((now.getUTCHours() + 1) % 24).padStart(2, '0')

      db.$setSelectResult([
        makeShift({
          id: 'shift-1',
          days: [currentDay],
          startTime: `${currentHour}:00`,
          endTime: `${nextHour}:00`,
          userPubkeys: ['pk1'],
        }),
        makeShift({
          id: 'shift-2',
          days: [currentDay],
          startTime: `${currentHour}:00`,
          endTime: `${nextHour}:00`,
          userPubkeys: ['pk1', 'pk2'],
        }),
      ])

      const result = await service.getCurrentVolunteers('hub-1')
      expect(result).toHaveLength(2)
      expect(result).toContain('pk1')
      expect(result).toContain('pk2')
    })

    it('falls back to settings group when no active shifts', async () => {
      const { db, service } = setup({ fallbackPubkeys: ['fallback1'] })
      db.$setSelectResult([])

      const result = await service.getCurrentVolunteers('hub-1')
      expect(result).toEqual(['fallback1'])
    })

    it('returns empty array when no active shifts and no fallback', async () => {
      const { db, service } = setup()
      db.$setSelectResult([])

      const result = await service.getCurrentVolunteers('hub-1')
      expect(result).toEqual([])
    })

    it('handles overnight shifts correctly', async () => {
      const { db, service } = setup()
      const now = new Date()
      const currentDay = now.getUTCDay()
      const currentHour = now.getUTCHours()

      let startTime: string
      let endTime: string

      if (currentHour >= 22 || currentHour < 6) {
        startTime = '22:00'
        endTime = '06:00'
      } else {
        startTime = '06:00'
        endTime = '22:00'
      }

      db.$setSelectResult([makeShift({
        days: [currentDay],
        startTime,
        endTime,
        userPubkeys: ['pk1'],
      })])

      const result = await service.getCurrentVolunteers('hub-1')

      if (currentHour >= 22 || currentHour < 6) {
        expect(result).toContain('pk1')
      } else {
        expect(result).toContain('pk1')
      }
    })
  })

  describe('getMyStatus', () => {
    it('returns onShift=true when currently in shift', async () => {
      const { db, service } = setup()
      const now = new Date()
      const currentDay = now.getUTCDay()
      const currentHour = String(now.getUTCHours()).padStart(2, '0')
      const nextHour = String((now.getUTCHours() + 1) % 24).padStart(2, '0')

      db.$setSelectResult([makeShift({
        days: [currentDay],
        startTime: `${currentHour}:00`,
        endTime: `${nextHour}:00`,
        userPubkeys: ['pk1'],
      })])

      const result = await service.getMyStatus('hub-1', 'pk1')
      expect(result.onShift).toBe(true)
      expect(result.currentShift).not.toBeNull()
    })

    it('returns onShift=false when not in any shift', async () => {
      const { db, service } = setup()
      db.$setSelectResult([makeShift({
        days: [1, 2, 3],
        startTime: '08:00',
        endTime: '12:00',
        userPubkeys: ['pk1'],
      })])

      const result = await service.getMyStatus('hub-1', 'pk1')
      expect(result.onShift).toBe(false)
      expect(result.currentShift).toBeNull()
    })

    it('finds next upcoming shift', async () => {
      const { db, service } = setup()
      const tomorrow = (new Date().getUTCDay() + 1) % 7

      db.$setSelectResult([makeShift({
        days: [tomorrow],
        startTime: '09:00',
        endTime: '17:00',
        userPubkeys: ['pk1'],
      })])

      const result = await service.getMyStatus('hub-1', 'pk1')
      expect(result.nextShift).not.toBeNull()
      expect(result.nextShift?.day).toBe(tomorrow)
    })

    it('handles volunteer in no shifts', async () => {
      const { db, service } = setup()
      db.$setSelectResult([makeShift({
        days: [1],
        startTime: '08:00',
        endTime: '12:00',
        userPubkeys: ['pk2'],
      })])

      const result = await service.getMyStatus('hub-1', 'pk1')
      expect(result.onShift).toBe(false)
      expect(result.nextShift).toBeNull()
    })
  })

  describe('reminder tracking', () => {
    it('marks reminder as sent', async () => {
      const { service } = setup()
      await expect(service.markReminderSent('shift-1', '2024-01-01', 'pk1'))
        .resolves.toBeUndefined()
    })

    it('checks if reminder was sent', async () => {
      const { db, service } = setup()
      db.$setSelectResult([{ shiftId: 'shift-1' }])

      const result = await service.hasReminderBeenSent('shift-1', '2024-01-01', 'pk1')
      expect(result).toBe(true)
    })

    it('returns false if reminder not sent', async () => {
      const { db, service } = setup()
      db.$setSelectResult([])

      const result = await service.hasReminderBeenSent('shift-1', '2024-01-01', 'pk1')
      expect(result).toBe(false)
    })
  })

  describe('reset', () => {
    it('resets shifts for hub', async () => {
      const { service } = setup()
      const result = await service.reset('hub-1')
      expect(result.ok).toBe(true)
    })
  })
})
