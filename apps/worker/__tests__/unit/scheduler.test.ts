import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TaskScheduler } from '@worker/services/scheduler'
import { createMockDb } from './mock-db'

vi.mock('@worker/lib/blast-delivery-worker', () => ({
  startBlastWorker: vi.fn(),
  stopBlastWorker: vi.fn(),
}))

vi.mock('@worker/lib/blast-scheduled-poller', () => ({
  startScheduledBlastPoller: vi.fn(),
  stopScheduledBlastPoller: vi.fn(),
}))

import { startBlastWorker, stopBlastWorker } from '@worker/lib/blast-delivery-worker'
import { startScheduledBlastPoller, stopScheduledBlastPoller } from '@worker/lib/blast-scheduled-poller'

describe('TaskScheduler', () => {
  function setup() {
    const { db } = createMockDb()
    const scheduler = new TaskScheduler(db as any)
    return { db, scheduler }
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('start', () => {
    it('starts blast worker and poller when deps provided', () => {
      const { scheduler } = setup()
      const mockBlastsService = {} as any
      const mockSettingsService = {} as any

      scheduler.start({
        blastsService: mockBlastsService,
        settingsService: mockSettingsService,
        resolveAdapter: async () => null,
        resolveIdentifier: async () => null,
      })

      expect(startBlastWorker).toHaveBeenCalledTimes(1)
      expect(startScheduledBlastPoller).toHaveBeenCalledTimes(1)
    })

    it('is idempotent — does not start twice', () => {
      const { scheduler } = setup()
      const deps = {
        blastsService: {} as any,
        settingsService: {} as any,
        resolveAdapter: async () => null,
        resolveIdentifier: async () => null,
      }

      scheduler.start(deps)
      scheduler.start(deps)

      expect(startBlastWorker).toHaveBeenCalledTimes(1)
      expect(startScheduledBlastPoller).toHaveBeenCalledTimes(1)
    })

    it('does not start workers when no deps provided', () => {
      const { scheduler } = setup()
      scheduler.start()

      expect(startBlastWorker).not.toHaveBeenCalled()
      expect(startScheduledBlastPoller).not.toHaveBeenCalled()
    })
  })

  describe('stop', () => {
    it('stops all workers', () => {
      const { scheduler } = setup()
      scheduler.start({
        blastsService: {} as any,
        settingsService: {} as any,
        resolveAdapter: async () => null,
        resolveIdentifier: async () => null,
      })
      scheduler.stop()

      expect(stopBlastWorker).toHaveBeenCalledTimes(1)
      expect(stopScheduledBlastPoller).toHaveBeenCalledTimes(1)
    })

    it('is idempotent — does not error when not started', () => {
      const { scheduler } = setup()
      expect(() => scheduler.stop()).not.toThrow()
      expect(stopBlastWorker).not.toHaveBeenCalled()
    })

    it('is idempotent — does not error when stopped twice', () => {
      const { scheduler } = setup()
      scheduler.start({
        blastsService: {} as any,
        settingsService: {} as any,
        resolveAdapter: async () => null,
        resolveIdentifier: async () => null,
      })
      scheduler.stop()
      scheduler.stop()

      expect(stopBlastWorker).toHaveBeenCalledTimes(1)
      expect(stopScheduledBlastPoller).toHaveBeenCalledTimes(1)
    })
  })
})
