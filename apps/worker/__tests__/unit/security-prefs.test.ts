import { describe, it, expect, beforeEach, jest } from 'bun:test'
import { SecurityPrefsService } from '../../services/security-prefs'

// ---------------------------------------------------------------------------
// Mock DB layer
// ---------------------------------------------------------------------------

function makeMockDb() {
  const store = new Map<string, Record<string, unknown>>()

  const mockChain = () => {
    let _whereKey: string | undefined
    return {
      from: () => mockChain(),
      where: (condition: unknown) => {
        // Extract the pubkey from the mock condition
        _whereKey = (condition as { value?: string })?.value
        return mockChain()
      },
      limit: () => {
        const key = _whereKey
        if (key && store.has(key)) return [store.get(key)]
        return []
      },
      set: () => mockChain(),
      returning: () => {
        const key = _whereKey
        if (key && store.has(key)) return [store.get(key)]
        return []
      },
    }
  }

  // Simplified mock that tracks calls and returns controlled data
  const db = {
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    _store: store,
  }

  return db
}

// ---------------------------------------------------------------------------
// Lightweight functional test with a real-ish mock
// ---------------------------------------------------------------------------

describe('SecurityPrefsService', () => {
  // These tests verify the pure logic of the service by mocking
  // at the service method level (integration-style unit tests).

  describe('defaults', () => {
    it('creates default prefs with web_push channel', async () => {
      const defaultRow = {
        userPubkey: 'pk1',
        notificationChannel: 'web_push',
        disappearingTimerDays: 1,
        digestCadence: 'weekly',
        alertOnNewDevice: true,
        alertOnPasskeyChange: true,
        alertOnPinChange: true,
        updatedAt: new Date(),
      }

      // Mock db where select returns empty, insert returns defaults
      const db = {
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([]),
            }),
          }),
        }),
        insert: jest.fn().mockReturnValue({
          values: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([defaultRow]),
          }),
        }),
      }

      const svc = new SecurityPrefsService(db as never)
      const result = await svc.get('pk1')

      expect(result.notificationChannel).toBe('web_push')
      expect(result.disappearingTimerDays).toBe(1)
      expect(result.digestCadence).toBe('weekly')
      expect(result.alertOnNewDevice).toBe(true)
      expect(result.alertOnPasskeyChange).toBe(true)
      expect(result.alertOnPinChange).toBe(true)
    })

    it('returns existing prefs if already created', async () => {
      const existingRow = {
        userPubkey: 'pk1',
        notificationChannel: 'signal',
        disappearingTimerDays: 7,
        digestCadence: 'off',
        alertOnNewDevice: false,
        alertOnPasskeyChange: false,
        alertOnPinChange: false,
        updatedAt: new Date(),
      }

      const db = {
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([existingRow]),
            }),
          }),
        }),
      }

      const svc = new SecurityPrefsService(db as never)
      const result = await svc.get('pk1')

      expect(result.notificationChannel).toBe('signal')
      expect(result.disappearingTimerDays).toBe(7)
      expect(result.digestCadence).toBe('off')
      // insert should NOT be called since row exists
      expect(db.select).toHaveBeenCalled()
    })

    it('throws if insert returns no rows', async () => {
      const db = {
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([]),
            }),
          }),
        }),
        insert: jest.fn().mockReturnValue({
          values: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([]),
          }),
        }),
      }

      const svc = new SecurityPrefsService(db as never)
      await expect(svc.get('pk1')).rejects.toThrow('Failed to insert security prefs')
    })
  })

  describe('update', () => {
    it('partially updates prefs and returns the new row', async () => {
      const existingRow = {
        userPubkey: 'pk1',
        notificationChannel: 'web_push',
        disappearingTimerDays: 1,
        digestCadence: 'weekly',
        alertOnNewDevice: true,
        alertOnPasskeyChange: true,
        alertOnPinChange: true,
        updatedAt: new Date(),
      }

      const updatedRow = {
        ...existingRow,
        notificationChannel: 'signal',
        disappearingTimerDays: 3,
      }

      const db = {
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([existingRow]),
            }),
          }),
        }),
        update: jest.fn().mockReturnValue({
          set: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              returning: jest.fn().mockResolvedValue([updatedRow]),
            }),
          }),
        }),
      }

      const svc = new SecurityPrefsService(db as never)
      const result = await svc.update('pk1', {
        notificationChannel: 'signal',
        disappearingTimerDays: 3,
      })

      expect(result.notificationChannel).toBe('signal')
      expect(result.disappearingTimerDays).toBe(3)
      // Other fields preserved
      expect(result.alertOnNewDevice).toBe(true)
    })

    it('throws if update returns no rows', async () => {
      const existingRow = {
        userPubkey: 'pk1',
        notificationChannel: 'web_push',
        disappearingTimerDays: 1,
        digestCadence: 'weekly',
        alertOnNewDevice: true,
        alertOnPasskeyChange: true,
        alertOnPinChange: true,
        updatedAt: new Date(),
      }

      const db = {
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([existingRow]),
            }),
          }),
        }),
        update: jest.fn().mockReturnValue({
          set: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              returning: jest.fn().mockResolvedValue([]),
            }),
          }),
        }),
      }

      const svc = new SecurityPrefsService(db as never)
      await expect(
        svc.update('pk1', { notificationChannel: 'signal' }),
      ).rejects.toThrow('Failed to update security prefs')
    })

    it('calls get() first to ensure row exists before update', async () => {
      // If get() fails because row doesn't exist AND insert fails,
      // update should not proceed
      const db = {
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([]),
            }),
          }),
        }),
        insert: jest.fn().mockReturnValue({
          values: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([]),
          }),
        }),
      }

      const svc = new SecurityPrefsService(db as never)
      await expect(
        svc.update('pk1', { notificationChannel: 'signal' }),
      ).rejects.toThrow('Failed to insert security prefs')
    })
  })
})
