import { describe, it, expect, beforeEach, afterEach, jest } from 'bun:test'
import {
  startScheduledBlastPoller,
  stopScheduledBlastPoller,
} from '@worker/lib/blast-scheduled-poller'
import type { BlastsService } from '@worker/services/blasts'
import type { BlastContent } from '@shared/types'

function createMockBlastsService(overrides: Partial<BlastsService> = {}): BlastsService {
  return {
    getDueScheduledBlasts: jest.fn().mockResolvedValue([]),
    send: jest.fn().mockResolvedValue({ id: 'blast-1', status: 'sending' }),
    expandBlast: jest.fn().mockResolvedValue(0),
    ...overrides,
  } as unknown as BlastsService
}

describe('blast-scheduled-poller', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    stopScheduledBlastPoller()
  })

  afterEach(() => {
    stopScheduledBlastPoller()
    jest.useRealTimers()
  })

  describe('lifecycle', () => {
    it('ignores duplicate start calls', () => {
      const service = createMockBlastsService()
      startScheduledBlastPoller(service)
      startScheduledBlastPoller(service)
      expect(jest.getTimerCount()).toBeGreaterThan(0)
    })

    it('stops cleanly when no timer is running', () => {
      expect(() => stopScheduledBlastPoller()).not.toThrow()
    })
  })

  describe('scheduled blast processing', () => {
    it('transitions due scheduled blasts to sending and expands them', async () => {
      const service = createMockBlastsService({
        getDueScheduledBlasts: jest.fn().mockResolvedValue([
          { id: 'blast-1', hubId: 'hub-1', status: 'scheduled', content: { text: 'Hello' } as BlastContent },
        ]),
        expandBlast: jest.fn().mockResolvedValue(42),
      })

      startScheduledBlastPoller(service)
      await jest.advanceTimersByTime(15000)

      expect(service.send).toHaveBeenCalledWith('blast-1', 'hub-1')
      expect(service.expandBlast).toHaveBeenCalledWith('blast-1')
    })

    it('handles multiple due blasts in one poll', async () => {
      const service = createMockBlastsService({
        getDueScheduledBlasts: jest.fn().mockResolvedValue([
          { id: 'blast-1', hubId: 'hub-1', status: 'scheduled', content: { text: 'Hello' } as BlastContent },
          { id: 'blast-2', hubId: 'hub-2', status: 'scheduled', content: { text: 'World' } as BlastContent },
        ]),
        expandBlast: jest.fn().mockResolvedValue(10),
      })

      startScheduledBlastPoller(service)
      await jest.advanceTimersByTime(15000)

      expect(service.send).toHaveBeenCalledTimes(2)
      expect(service.expandBlast).toHaveBeenCalledTimes(2)
    })

    it('does nothing when no blasts are due', async () => {
      const service = createMockBlastsService({
        getDueScheduledBlasts: jest.fn().mockResolvedValue([]),
      })

      startScheduledBlastPoller(service)
      await jest.advanceTimersByTime(15000)

      expect(service.send).not.toHaveBeenCalled()
      expect(service.expandBlast).not.toHaveBeenCalled()
    })

    it('handles errors from individual blast transitions gracefully', async () => {
      const service = createMockBlastsService({
        getDueScheduledBlasts: jest.fn().mockResolvedValue([
          { id: 'blast-1', hubId: 'hub-1', status: 'scheduled', content: { text: 'Hello' } as BlastContent },
          { id: 'blast-2', hubId: 'hub-2', status: 'scheduled', content: { text: 'World' } as BlastContent },
        ]),
        send: jest.fn()
          .mockResolvedValueOnce({ id: 'blast-1', status: 'sending' })
          .mockRejectedValueOnce(new Error('Send failed')),
        expandBlast: jest.fn().mockResolvedValue(10),
      })

      startScheduledBlastPoller(service)
      await jest.advanceTimersByTime(15000)

      expect(service.send).toHaveBeenCalledTimes(2)
      expect(service.expandBlast).toHaveBeenCalledTimes(1)
    })

    it('handles errors from expandBlast gracefully', async () => {
      const service = createMockBlastsService({
        getDueScheduledBlasts: jest.fn().mockResolvedValue([
          { id: 'blast-1', hubId: 'hub-1', status: 'scheduled', content: { text: 'Hello' } as BlastContent },
        ]),
        send: jest.fn().mockResolvedValue({ id: 'blast-1', status: 'sending' }),
        expandBlast: jest.fn().mockRejectedValue(new Error('Expansion failed')),
      })

      startScheduledBlastPoller(service)
      await jest.advanceTimersByTime(15000)

      expect(service.send).toHaveBeenCalledWith('blast-1', 'hub-1')
      expect(service.expandBlast).toHaveBeenCalledWith('blast-1')
    })

    it('handles poll errors gracefully', async () => {
      const service = createMockBlastsService({
        getDueScheduledBlasts: jest.fn().mockRejectedValue(new Error('DB down')),
      })

      startScheduledBlastPoller(service)
      await jest.advanceTimersByTime(15000)

      expect(jest.getTimerCount()).toBeGreaterThan(0)
    })

    it('passes undefined hubId when hubId is missing', async () => {
      const service = createMockBlastsService({
        getDueScheduledBlasts: jest.fn().mockResolvedValue([
          { id: 'blast-1', hubId: null, status: 'scheduled', content: { text: 'Hello' } as BlastContent },
        ]),
        expandBlast: jest.fn().mockResolvedValue(5),
      })

      startScheduledBlastPoller(service)
      await jest.advanceTimersByTime(15000)

      expect(service.send).toHaveBeenCalledWith('blast-1', undefined)
    })

    it('polls on interval after initial delay', async () => {
      const service = createMockBlastsService({
        getDueScheduledBlasts: jest.fn().mockResolvedValue([]),
      })

      startScheduledBlastPoller(service)
      expect(service.getDueScheduledBlasts).not.toHaveBeenCalled()

      await jest.advanceTimersByTime(15000)
      expect(service.getDueScheduledBlasts).toHaveBeenCalledTimes(1)

      await jest.advanceTimersByTime(60000)
      expect(service.getDueScheduledBlasts).toHaveBeenCalledTimes(2)
    })
  })
})
