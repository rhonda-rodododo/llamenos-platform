import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  startScheduledBlastPoller,
  stopScheduledBlastPoller,
} from '@worker/lib/blast-scheduled-poller'
import type { BlastsService } from '@worker/services/blasts'
import type { BlastContent } from '@shared/types'

function createMockBlastsService(overrides: Partial<BlastsService> = {}): BlastsService {
  return {
    getDueScheduledBlasts: vi.fn().mockResolvedValue([]),
    send: vi.fn().mockResolvedValue({ id: 'blast-1', status: 'sending' }),
    expandBlast: vi.fn().mockResolvedValue(0),
    ...overrides,
  } as unknown as BlastsService
}

describe('blast-scheduled-poller', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false })
    stopScheduledBlastPoller()
  })

  afterEach(() => {
    stopScheduledBlastPoller()
    vi.useRealTimers()
  })

  describe('lifecycle', () => {
    it('ignores duplicate start calls', () => {
      const service = createMockBlastsService()
      startScheduledBlastPoller(service)
      startScheduledBlastPoller(service)
      expect(vi.getTimerCount()).toBeGreaterThan(0)
    })

    it('stops cleanly when no timer is running', () => {
      expect(() => stopScheduledBlastPoller()).not.toThrow()
    })
  })

  describe('scheduled blast processing', () => {
    it('transitions due scheduled blasts to sending and expands them', async () => {
      const service = createMockBlastsService({
        getDueScheduledBlasts: vi.fn().mockResolvedValue([
          { id: 'blast-1', hubId: 'hub-1', status: 'scheduled', content: { text: 'Hello' } as BlastContent },
        ]),
        expandBlast: vi.fn().mockResolvedValue(42),
      })

      startScheduledBlastPoller(service)
      await vi.advanceTimersByTimeAsync(15000)

      expect(service.send).toHaveBeenCalledWith('blast-1', 'hub-1')
      expect(service.expandBlast).toHaveBeenCalledWith('blast-1')
    })

    it('handles multiple due blasts in one poll', async () => {
      const service = createMockBlastsService({
        getDueScheduledBlasts: vi.fn().mockResolvedValue([
          { id: 'blast-1', hubId: 'hub-1', status: 'scheduled', content: { text: 'Hello' } as BlastContent },
          { id: 'blast-2', hubId: 'hub-2', status: 'scheduled', content: { text: 'World' } as BlastContent },
        ]),
        expandBlast: vi.fn().mockResolvedValue(10),
      })

      startScheduledBlastPoller(service)
      await vi.advanceTimersByTimeAsync(15000)

      expect(service.send).toHaveBeenCalledTimes(2)
      expect(service.expandBlast).toHaveBeenCalledTimes(2)
    })

    it('does nothing when no blasts are due', async () => {
      const service = createMockBlastsService({
        getDueScheduledBlasts: vi.fn().mockResolvedValue([]),
      })

      startScheduledBlastPoller(service)
      await vi.advanceTimersByTimeAsync(15000)

      expect(service.send).not.toHaveBeenCalled()
      expect(service.expandBlast).not.toHaveBeenCalled()
    })

    it('handles errors from individual blast transitions gracefully', async () => {
      const service = createMockBlastsService({
        getDueScheduledBlasts: vi.fn().mockResolvedValue([
          { id: 'blast-1', hubId: 'hub-1', status: 'scheduled', content: { text: 'Hello' } as BlastContent },
          { id: 'blast-2', hubId: 'hub-2', status: 'scheduled', content: { text: 'World' } as BlastContent },
        ]),
        send: vi.fn()
          .mockResolvedValueOnce({ id: 'blast-1', status: 'sending' })
          .mockRejectedValueOnce(new Error('Send failed')),
        expandBlast: vi.fn().mockResolvedValue(10),
      })

      startScheduledBlastPoller(service)
      await vi.advanceTimersByTimeAsync(15000)

      expect(service.send).toHaveBeenCalledTimes(2)
      expect(service.expandBlast).toHaveBeenCalledTimes(1)
    })

    it('handles errors from expandBlast gracefully', async () => {
      const service = createMockBlastsService({
        getDueScheduledBlasts: vi.fn().mockResolvedValue([
          { id: 'blast-1', hubId: 'hub-1', status: 'scheduled', content: { text: 'Hello' } as BlastContent },
        ]),
        send: vi.fn().mockResolvedValue({ id: 'blast-1', status: 'sending' }),
        expandBlast: vi.fn().mockRejectedValue(new Error('Expansion failed')),
      })

      startScheduledBlastPoller(service)
      await vi.advanceTimersByTimeAsync(15000)

      expect(service.send).toHaveBeenCalledWith('blast-1', 'hub-1')
      expect(service.expandBlast).toHaveBeenCalledWith('blast-1')
    })

    it('handles poll errors gracefully', async () => {
      const service = createMockBlastsService({
        getDueScheduledBlasts: vi.fn().mockRejectedValue(new Error('DB down')),
      })

      startScheduledBlastPoller(service)
      await vi.advanceTimersByTimeAsync(15000)

      expect(vi.getTimerCount()).toBeGreaterThan(0)
    })

    it('passes undefined hubId when hubId is missing', async () => {
      const service = createMockBlastsService({
        getDueScheduledBlasts: vi.fn().mockResolvedValue([
          { id: 'blast-1', hubId: null, status: 'scheduled', content: { text: 'Hello' } as BlastContent },
        ]),
        expandBlast: vi.fn().mockResolvedValue(5),
      })

      startScheduledBlastPoller(service)
      await vi.advanceTimersByTimeAsync(15000)

      expect(service.send).toHaveBeenCalledWith('blast-1', undefined)
    })

    it('polls on interval after initial delay', async () => {
      const service = createMockBlastsService({
        getDueScheduledBlasts: vi.fn().mockResolvedValue([]),
      })

      startScheduledBlastPoller(service)
      expect(service.getDueScheduledBlasts).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(15000)
      expect(service.getDueScheduledBlasts).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(60000)
      expect(service.getDueScheduledBlasts).toHaveBeenCalledTimes(2)
    })
  })
})
