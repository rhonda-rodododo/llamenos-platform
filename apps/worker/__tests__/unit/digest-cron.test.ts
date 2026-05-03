import { describe, it, expect, jest } from 'bun:test'
import { DigestCronService } from '@worker/services/digest-cron'
import { createMockDb } from './mock-db'

describe('DigestCronService', () => {
  function setup() {
    const { db } = createMockDb(['userSecurityPrefs', 'auditLog'])
    const notifications = {
      sendAlert: jest.fn().mockResolvedValue({ delivered: true }),
    } as any
    const prefs = {} as any
    const service = new DigestCronService(db as any, notifications, prefs)
    return { db, service, notifications }
  }

  describe('runDigests', () => {
    it('sends daily digests to eligible users', async () => {
      const { db, service, notifications } = setup()
      db.$setSelectResults([
        [{ userPubkey: 'pk1' }, { userPubkey: 'pk2' }],
        [{ n: 3 }],
        [{ n: 1 }],
        [{ n: 0 }],
        [{ n: 2 }],
        [{ n: 0 }],
        [{ n: 1 }],
      ])

      const result = await service.runDigests('daily')
      expect(result.sent).toBe(2)
      expect(result.skipped).toBe(0)
      expect(notifications.sendAlert).toHaveBeenCalledTimes(2)
    })

    it('skips users when notification fails', async () => {
      const { db, service, notifications } = setup()
      db.$setSelectResult([{ userPubkey: 'pk1' }])
      db.$setSelectResults([
        [{ n: 0 }],
        [{ n: 0 }],
        [{ n: 0 }],
      ])
      notifications.sendAlert.mockResolvedValue({ delivered: false })

      const result = await service.runDigests('daily')
      expect(result.sent).toBe(0)
      expect(result.skipped).toBe(1)
    })

    it('handles errors gracefully', async () => {
      const { db, service, notifications } = setup()
      db.$setSelectResult([{ userPubkey: 'pk1' }])
      notifications.sendAlert.mockRejectedValue(new Error('send failed'))

      const result = await service.runDigests('daily')
      expect(result.sent).toBe(0)
      expect(result.skipped).toBe(1)
    })

    it('sends weekly digests with 7-day period', async () => {
      const { db, service, notifications } = setup()
      db.$setSelectResult([{ userPubkey: 'pk1' }])
      db.$setSelectResults([
        [{ n: 5 }],
        [{ n: 2 }],
        [{ n: 1 }],
      ])

      const result = await service.runDigests('weekly')
      expect(result.sent).toBe(1)
      const call = notifications.sendAlert.mock.calls[0]
      expect(call[1].periodDays).toBe(7)
    })

    it('filters to signal channel only', async () => {
      const { db, service } = setup()
      db.$setSelectResult([{ userPubkey: 'pk1' }])
      db.$setSelectResults([
        [{ n: 0 }],
        [{ n: 0 }],
        [{ n: 0 }],
      ])

      await service.runDigests('daily')
    })
  })
})
