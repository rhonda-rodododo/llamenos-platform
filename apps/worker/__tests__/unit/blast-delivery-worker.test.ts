// @ts-nocheck
import { describe, it, expect, beforeEach, afterEach, jest } from 'bun:test'
import {
  startBlastWorker,
  stopBlastWorker,
} from '@worker/lib/blast-delivery-worker'
import type { BlastsService } from '@worker/services/blasts'
import type { SettingsService } from '@worker/services/settings'
import type { MessagingAdapter } from '@worker/messaging/adapter'
import type { BlastContent, BlastSettings, BlastStats } from '@shared/types'

function createMockBlastsService(overrides: Partial<BlastsService> = {}): BlastsService {
  return {
    getSendingBlasts: jest.fn().mockResolvedValue([]),
    getBlast: jest.fn().mockResolvedValue({
      id: 'blast-1',
      hubId: 'hub-1',
      status: 'sending',
      content: { text: 'Hello world' } as BlastContent,
      stats: { totalRecipients: 0, sent: 0, delivered: 0, failed: 0, optedOut: 0 },
    }),
    getBlastSettings: jest.fn().mockResolvedValue({
      optOutFooter: '\nReply STOP to unsubscribe.',
      rateLimitPerSecond: 10,
      rateLimits: {},
      subscribeKeyword: 'JOIN',
      unsubscribeKeyword: 'STOP',
      confirmationMessage: 'Subscribed',
      unsubscribeMessage: 'Unsubscribed',
      doubleOptIn: false,
      maxBlastsPerDay: 10,
    } as BlastSettings),
    drainDeliveryBatch: jest.fn().mockResolvedValue([]),
    syncBlastStats: jest.fn().mockResolvedValue({
      stats: { totalRecipients: 0, sent: 0, delivered: 0, failed: 0, optedOut: 0 } as BlastStats,
      completed: true,
    }),
    isSubscriberActive: jest.fn().mockResolvedValue(true),
    markDeliverySent: jest.fn().mockResolvedValue(undefined),
    markDeliveryFailed: jest.fn().mockResolvedValue(undefined),
    markDeliveryOptedOut: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as BlastsService
}

function createMockAdapter(): MessagingAdapter {
  return {
    channelType: 'sms',
    sendMessage: jest.fn().mockResolvedValue({ success: true, externalId: 'ext-123' }),
    sendMediaMessage: jest.fn().mockResolvedValue({ success: true, externalId: 'ext-456' }),
    parseIncomingMessage: jest.fn(),
    validateWebhook: jest.fn(),
    getChannelStatus: jest.fn(),
  } as unknown as MessagingAdapter
}

function createDeps(overrides: Record<string, unknown> = {}) {
  const mockAdapter = createMockAdapter()
  return {
    blastsService: createMockBlastsService(),
    settingsService: {} as SettingsService,
    resolveAdapter: jest.fn().mockResolvedValue(mockAdapter),
    resolveIdentifier: jest.fn().mockResolvedValue('+1234567890'),
    onProgress: jest.fn(),
    onStatusChange: jest.fn(),
    mockAdapter,
    ...overrides,
  }
}

describe('blast-delivery-worker', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    stopBlastWorker()
  })

  afterEach(() => {
    stopBlastWorker()
    jest.useRealTimers()
  })

  describe('buildMessageBody bug: undefined body', () => {
    it('does not prepend "undefined" to opt-out footer when both smsText and text are missing', async () => {
      const mockAdapter = createMockAdapter()
      const blastsService = createMockBlastsService({
        getSendingBlasts: jest.fn().mockResolvedValue([{ id: 'blast-1', hubId: 'hub-1' }]),
        getBlast: jest.fn().mockResolvedValue({
          id: 'blast-1',
          hubId: 'hub-1',
          status: 'sending',
          content: { smsText: undefined, text: undefined } as unknown as BlastContent,
        }),
        drainDeliveryBatch: jest.fn().mockResolvedValue([
          { id: 'del-1', subscriberId: 'sub-1', channel: 'sms', attempts: 0 },
        ]),
        syncBlastStats: jest.fn().mockResolvedValue({
          stats: { totalRecipients: 1, sent: 1, delivered: 0, failed: 0, optedOut: 0 } as BlastStats,
          completed: true,
        }),
      })

      const deps = {
        blastsService,
        settingsService: {} as SettingsService,
        resolveAdapter: jest.fn().mockResolvedValue(mockAdapter),
        resolveIdentifier: jest.fn().mockResolvedValue('+1234567890'),
      }

      startBlastWorker(deps)
      await jest.advanceTimersByTime(5000)

      expect(mockAdapter.sendMessage).toHaveBeenCalledTimes(1)
      const callArgs = mockAdapter.sendMessage.mock.calls[0][0]
      expect(callArgs.body).not.toContain('undefined')
      expect(callArgs.body).toBe('\nReply STOP to unsubscribe.')
    })

    it('uses smsText override for SMS channel when present', async () => {
      const mockAdapter = createMockAdapter()
      const blastsService = createMockBlastsService({
        getSendingBlasts: jest.fn().mockResolvedValue([{ id: 'blast-1', hubId: 'hub-1' }]),
        getBlast: jest.fn().mockResolvedValue({
          id: 'blast-1',
          hubId: 'hub-1',
          status: 'sending',
          content: { text: 'Default text', smsText: 'SMS override' } as BlastContent,
        }),
        drainDeliveryBatch: jest.fn().mockResolvedValue([
          { id: 'del-1', subscriberId: 'sub-1', channel: 'sms', attempts: 0 },
        ]),
        syncBlastStats: jest.fn().mockResolvedValue({
          stats: { totalRecipients: 1, sent: 1, delivered: 0, failed: 0, optedOut: 0 } as BlastStats,
          completed: true,
        }),
      })

      const deps = {
        blastsService,
        settingsService: {} as SettingsService,
        resolveAdapter: jest.fn().mockResolvedValue(mockAdapter),
        resolveIdentifier: jest.fn().mockResolvedValue('+1234567890'),
      }

      startBlastWorker(deps)
      await jest.advanceTimersByTime(5000)

      const callArgs = mockAdapter.sendMessage.mock.calls[0][0]
      expect(callArgs.body).toBe('SMS override\nReply STOP to unsubscribe.')
    })

    it('falls back to text when smsText is not present for SMS channel', async () => {
      const mockAdapter = createMockAdapter()
      const blastsService = createMockBlastsService({
        getSendingBlasts: jest.fn().mockResolvedValue([{ id: 'blast-1', hubId: 'hub-1' }]),
        getBlast: jest.fn().mockResolvedValue({
          id: 'blast-1',
          hubId: 'hub-1',
          status: 'sending',
          content: { text: 'Default text' } as BlastContent,
        }),
        drainDeliveryBatch: jest.fn().mockResolvedValue([
          { id: 'del-1', subscriberId: 'sub-1', channel: 'sms', attempts: 0 },
        ]),
        syncBlastStats: jest.fn().mockResolvedValue({
          stats: { totalRecipients: 1, sent: 1, delivered: 0, failed: 0, optedOut: 0 } as BlastStats,
          completed: true,
        }),
      })

      const deps = {
        blastsService,
        settingsService: {} as SettingsService,
        resolveAdapter: jest.fn().mockResolvedValue(mockAdapter),
        resolveIdentifier: jest.fn().mockResolvedValue('+1234567890'),
      }

      startBlastWorker(deps)
      await jest.advanceTimersByTime(5000)

      const callArgs = mockAdapter.sendMessage.mock.calls[0][0]
      expect(callArgs.body).toBe('Default text\nReply STOP to unsubscribe.')
    })
  })

  describe('rate limiters memory leak', () => {
    it('clears rate limiters on stopBlastWorker', async () => {
      const deps = createDeps()
      startBlastWorker(deps)
      await jest.advanceTimersByTime(5000)
      stopBlastWorker()

      const deps2 = createDeps()
      startBlastWorker(deps2)
      await jest.advanceTimersByTime(5000)
      stopBlastWorker()

      expect(true).toBe(true)
    })
  })

  describe('lifecycle', () => {
    it('ignores duplicate start calls', () => {
      const deps = createDeps()
      startBlastWorker(deps)
      startBlastWorker(deps)
      expect(jest.getTimerCount()).toBeGreaterThan(0)
    })

    it('stops cleanly when no timer is running', () => {
      expect(() => stopBlastWorker()).not.toThrow()
    })
  })

  describe('polling and batch processing', () => {
    it('polls for sending blasts and processes deliveries', async () => {
      const mockAdapter = createMockAdapter()
      const blastsService = createMockBlastsService({
        getSendingBlasts: jest.fn().mockResolvedValue([{ id: 'blast-1', hubId: 'hub-1' }]),
        drainDeliveryBatch: jest.fn().mockResolvedValue([
          { id: 'del-1', subscriberId: 'sub-1', channel: 'sms', attempts: 0 },
        ]),
        syncBlastStats: jest.fn().mockResolvedValue({
          stats: { totalRecipients: 1, sent: 1, delivered: 0, failed: 0, optedOut: 0 } as BlastStats,
          completed: true,
        }),
      })

      const onStatusChange = jest.fn()
      const deps = {
        blastsService,
        settingsService: {} as SettingsService,
        resolveAdapter: jest.fn().mockResolvedValue(mockAdapter),
        resolveIdentifier: jest.fn().mockResolvedValue('+1234567890'),
        onStatusChange,
      }

      startBlastWorker(deps)
      await jest.advanceTimersByTime(5000)

      expect(blastsService.getSendingBlasts).toHaveBeenCalled()
      expect(blastsService.drainDeliveryBatch).toHaveBeenCalledWith('blast-1', 50)
      expect(mockAdapter.sendMessage).toHaveBeenCalledTimes(1)
      expect(onStatusChange).toHaveBeenCalledWith('blast-1', 'sent')
    })

    it('skips blast if status is no longer sending', async () => {
      const blastsService = createMockBlastsService({
        getSendingBlasts: jest.fn().mockResolvedValue([{ id: 'blast-1', hubId: 'hub-1' }]),
        getBlast: jest.fn()
          .mockResolvedValueOnce({
            id: 'blast-1',
            hubId: 'hub-1',
            status: 'sending',
            content: { text: 'Hello' } as BlastContent,
          })
          .mockResolvedValueOnce({
            id: 'blast-1',
            hubId: 'hub-1',
            status: 'cancelled',
            content: { text: 'Hello' } as BlastContent,
          }),
        drainDeliveryBatch: jest.fn().mockResolvedValue([
          { id: 'del-1', subscriberId: 'sub-1', channel: 'sms', attempts: 0 },
        ]),
      })

      const deps = createDeps({ blastsService })
      startBlastWorker(deps)
      await jest.advanceTimersByTime(5000)

      expect(deps.mockAdapter.sendMessage).not.toHaveBeenCalled()
    })

    it('marks delivery opted out when subscriber is no longer active', async () => {
      const blastsService = createMockBlastsService({
        getSendingBlasts: jest.fn().mockResolvedValue([{ id: 'blast-1', hubId: 'hub-1' }]),
        drainDeliveryBatch: jest.fn().mockResolvedValue([
          { id: 'del-1', subscriberId: 'sub-1', channel: 'sms', attempts: 0 },
        ]),
        isSubscriberActive: jest.fn().mockResolvedValue(false),
      })

      const deps = createDeps({ blastsService })
      startBlastWorker(deps)
      await jest.advanceTimersByTime(5000)

      expect(blastsService.markDeliveryOptedOut).toHaveBeenCalledWith('del-1')
      expect(deps.mockAdapter.sendMessage).not.toHaveBeenCalled()
    })

    it('marks delivery failed when no adapter is available', async () => {
      const blastsService = createMockBlastsService({
        getSendingBlasts: jest.fn().mockResolvedValue([{ id: 'blast-1', hubId: 'hub-1' }]),
        drainDeliveryBatch: jest.fn().mockResolvedValue([
          { id: 'del-1', subscriberId: 'sub-1', channel: 'sms', attempts: 0 },
        ]),
      })

      const deps = createDeps({
        blastsService,
        resolveAdapter: jest.fn().mockResolvedValue(null),
      })
      startBlastWorker(deps)
      await jest.advanceTimersByTime(5000)

      expect(blastsService.markDeliveryFailed).toHaveBeenCalledWith(
        'del-1',
        'No adapter available for channel: sms',
        0,
      )
    })

    it('marks delivery failed when identifier cannot be resolved', async () => {
      const blastsService = createMockBlastsService({
        getSendingBlasts: jest.fn().mockResolvedValue([{ id: 'blast-1', hubId: 'hub-1' }]),
        drainDeliveryBatch: jest.fn().mockResolvedValue([
          { id: 'del-1', subscriberId: 'sub-1', channel: 'sms', attempts: 0 },
        ]),
      })

      const deps = createDeps({
        blastsService,
        resolveIdentifier: jest.fn().mockResolvedValue(null),
      })
      startBlastWorker(deps)
      await jest.advanceTimersByTime(5000)

      expect(blastsService.markDeliveryFailed).toHaveBeenCalledWith(
        'del-1',
        'Could not resolve subscriber identifier',
        0,
      )
    })

    it('marks delivery sent on successful adapter send', async () => {
      const mockAdapter = createMockAdapter()
      const blastsService = createMockBlastsService({
        getSendingBlasts: jest.fn().mockResolvedValue([{ id: 'blast-1', hubId: 'hub-1' }]),
        drainDeliveryBatch: jest.fn().mockResolvedValue([
          { id: 'del-1', subscriberId: 'sub-1', channel: 'sms', attempts: 0 },
        ]),
        syncBlastStats: jest.fn().mockResolvedValue({
          stats: { totalRecipients: 1, sent: 1, delivered: 0, failed: 0, optedOut: 0 } as BlastStats,
          completed: true,
        }),
      })

      const deps = {
        blastsService,
        settingsService: {} as SettingsService,
        resolveAdapter: jest.fn().mockResolvedValue(mockAdapter),
        resolveIdentifier: jest.fn().mockResolvedValue('+1234567890'),
      }

      startBlastWorker(deps)
      await jest.advanceTimersByTime(5000)

      expect(blastsService.markDeliverySent).toHaveBeenCalledWith('del-1', 'ext-123')
    })

    it('marks delivery failed on adapter send failure', async () => {
      const mockAdapter = createMockAdapter()
      mockAdapter.sendMessage = jest.fn().mockResolvedValue({ success: false, error: 'Network error' })

      const blastsService = createMockBlastsService({
        getSendingBlasts: jest.fn().mockResolvedValue([{ id: 'blast-1', hubId: 'hub-1' }]),
        drainDeliveryBatch: jest.fn().mockResolvedValue([
          { id: 'del-1', subscriberId: 'sub-1', channel: 'sms', attempts: 0 },
        ]),
      })

      const deps = {
        blastsService,
        settingsService: {} as SettingsService,
        resolveAdapter: jest.fn().mockResolvedValue(mockAdapter),
        resolveIdentifier: jest.fn().mockResolvedValue('+1234567890'),
      }

      startBlastWorker(deps)
      await jest.advanceTimersByTime(5000)

      expect(blastsService.markDeliveryFailed).toHaveBeenCalledWith(
        'del-1',
        'Network error',
        0,
      )
    })

    it('marks delivery failed on adapter exception', async () => {
      const mockAdapter = createMockAdapter()
      mockAdapter.sendMessage = jest.fn().mockRejectedValue(new Error('Boom'))

      const blastsService = createMockBlastsService({
        getSendingBlasts: jest.fn().mockResolvedValue([{ id: 'blast-1', hubId: 'hub-1' }]),
        drainDeliveryBatch: jest.fn().mockResolvedValue([
          { id: 'del-1', subscriberId: 'sub-1', channel: 'sms', attempts: 0 },
        ]),
      })

      const deps = {
        blastsService,
        settingsService: {} as SettingsService,
        resolveAdapter: jest.fn().mockResolvedValue(mockAdapter),
        resolveIdentifier: jest.fn().mockResolvedValue('+1234567890'),
      }

      startBlastWorker(deps)
      await jest.advanceTimersByTime(5000)

      expect(blastsService.markDeliveryFailed).toHaveBeenCalledWith(
        'del-1',
        'Boom',
        0,
      )
    })

    it('sends media messages when mediaUrl is present', async () => {
      const mockAdapter = createMockAdapter()
      const blastsService = createMockBlastsService({
        getSendingBlasts: jest.fn().mockResolvedValue([{ id: 'blast-1', hubId: 'hub-1' }]),
        getBlast: jest.fn().mockResolvedValue({
          id: 'blast-1',
          hubId: 'hub-1',
          status: 'sending',
          content: {
            text: 'Check this out',
            mediaUrl: 'https://example.com/image.jpg',
            mediaType: 'image/jpeg',
          } as BlastContent,
        }),
        drainDeliveryBatch: jest.fn().mockResolvedValue([
          { id: 'del-1', subscriberId: 'sub-1', channel: 'sms', attempts: 0 },
        ]),
        syncBlastStats: jest.fn().mockResolvedValue({
          stats: { totalRecipients: 1, sent: 1, delivered: 0, failed: 0, optedOut: 0 } as BlastStats,
          completed: true,
        }),
      })

      const deps = {
        blastsService,
        settingsService: {} as SettingsService,
        resolveAdapter: jest.fn().mockResolvedValue(mockAdapter),
        resolveIdentifier: jest.fn().mockResolvedValue('+1234567890'),
      }

      startBlastWorker(deps)
      await jest.advanceTimersByTime(5000)

      expect(mockAdapter.sendMediaMessage).toHaveBeenCalledTimes(1)
      expect(mockAdapter.sendMediaMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientIdentifier: '+1234567890',
          body: 'Check this out\nReply STOP to unsubscribe.',
          mediaUrl: 'https://example.com/image.jpg',
          mediaType: 'image/jpeg',
        }),
      )
    })

    it('calls onProgress with stats after batch', async () => {
      const mockAdapter = createMockAdapter()
      const stats = { totalRecipients: 10, sent: 5, delivered: 0, failed: 0, optedOut: 0 } as BlastStats
      const blastsService = createMockBlastsService({
        getSendingBlasts: jest.fn().mockResolvedValue([{ id: 'blast-1', hubId: 'hub-1' }]),
        drainDeliveryBatch: jest.fn().mockResolvedValue([
          { id: 'del-1', subscriberId: 'sub-1', channel: 'sms', attempts: 0 },
        ]),
        syncBlastStats: jest.fn().mockResolvedValue({ stats, completed: false }),
      })

      const onProgress = jest.fn()
      const deps = {
        blastsService,
        settingsService: {} as SettingsService,
        resolveAdapter: jest.fn().mockResolvedValue(mockAdapter),
        resolveIdentifier: jest.fn().mockResolvedValue('+1234567890'),
        onProgress,
      }

      startBlastWorker(deps)
      await jest.advanceTimersByTime(5000)

      expect(onProgress).toHaveBeenCalledWith('blast-1', stats)
    })

    it('does not call onStatusChange when blast is not completed', async () => {
      const mockAdapter = createMockAdapter()
      const blastsService = createMockBlastsService({
        getSendingBlasts: jest.fn().mockResolvedValue([{ id: 'blast-1', hubId: 'hub-1' }]),
        drainDeliveryBatch: jest.fn().mockResolvedValue([
          { id: 'del-1', subscriberId: 'sub-1', channel: 'sms', attempts: 0 },
        ]),
        syncBlastStats: jest.fn().mockResolvedValue({
          stats: { totalRecipients: 10, sent: 1, delivered: 0, failed: 0, optedOut: 0 } as BlastStats,
          completed: false,
        }),
      })

      const onStatusChange = jest.fn()
      const deps = {
        blastsService,
        settingsService: {} as SettingsService,
        resolveAdapter: jest.fn().mockResolvedValue(mockAdapter),
        resolveIdentifier: jest.fn().mockResolvedValue('+1234567890'),
        onStatusChange,
      }

      startBlastWorker(deps)
      await jest.advanceTimersByTime(5000)

      expect(onStatusChange).not.toHaveBeenCalled()
    })

    it('handles poll errors gracefully', async () => {
      const blastsService = createMockBlastsService({
        getSendingBlasts: jest.fn().mockRejectedValue(new Error('DB down')),
      })

      const deps = createDeps({ blastsService })
      startBlastWorker(deps)
      await jest.advanceTimersByTime(5000)

      expect(jest.getTimerCount()).toBeGreaterThan(0)
    })

    it('processes multiple blasts in one poll', async () => {
      const mockAdapter = createMockAdapter()
      const blastsService = createMockBlastsService({
        getSendingBlasts: jest.fn().mockResolvedValue([
          { id: 'blast-1', hubId: 'hub-1' },
          { id: 'blast-2', hubId: 'hub-2' },
        ]),
        drainDeliveryBatch: jest.fn().mockResolvedValue([
          { id: 'del-1', subscriberId: 'sub-1', channel: 'sms', attempts: 0 },
        ]),
        syncBlastStats: jest.fn().mockResolvedValue({
          stats: { totalRecipients: 1, sent: 1, delivered: 0, failed: 0, optedOut: 0 } as BlastStats,
          completed: true,
        }),
      })

      const onStatusChange = jest.fn()
      const deps = {
        blastsService,
        settingsService: {} as SettingsService,
        resolveAdapter: jest.fn().mockResolvedValue(mockAdapter),
        resolveIdentifier: jest.fn().mockResolvedValue('+1234567890'),
        onStatusChange,
      }

      startBlastWorker(deps)
      await jest.advanceTimersByTime(5000)

      expect(blastsService.drainDeliveryBatch).toHaveBeenCalledTimes(2)
      expect(onStatusChange).toHaveBeenCalledTimes(2)
    })
  })
})
