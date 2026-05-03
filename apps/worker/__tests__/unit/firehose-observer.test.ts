import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  observeFirehoseMessage,
  clearWindowKeyCache,
  type FirehoseGroupMessage,
} from '@worker/messaging/firehose-observer'
import type { FirehoseService } from '@worker/services/firehose'

vi.mock('@worker/lib/crypto', () => ({
  eciesWrapKeyForRecipient: vi.fn((_key: Uint8Array, _pubkey: string, _label: string) => ({
    wrappedKey: 'mock-wrapped-key-hex',
    ephemeralPubkey: 'mock-ephemeral-pubkey-hex',
  })),
}))

vi.mock('@shared/crypto-labels', () => ({
  LABEL_FIREHOSE_BUFFER_ENCRYPT: 'llamenos:firehose:buffer-encrypt',
}))

function createMockFirehoseService(overrides: Partial<FirehoseService> = {}): FirehoseService {
  return {
    findConnectionBySignalGroup: vi.fn(),
    getCurrentWindowKey: vi.fn(),
    createWindowKey: vi.fn(),
    addBufferMessage: vi.fn(),
    incrementWindowKeyMessageCount: vi.fn(),
    ...overrides,
  } as unknown as FirehoseService
}

function createMockMessage(overrides: Partial<FirehoseGroupMessage> = {}): FirehoseGroupMessage {
  return {
    signalGroupId: 'group-123',
    senderIdentifier: '+15551234567',
    senderIdentifierHash: 'hash-abc',
    senderUsername: 'TestUser',
    content: 'Hello from Signal',
    timestamp: new Date('2025-01-01T00:00:00Z'),
    hubId: 'hub-456',
    ...overrides,
  }
}

describe('firehose-observer', () => {
  beforeEach(() => {
    clearWindowKeyCache()
  })

  afterEach(() => {
    clearWindowKeyCache()
    vi.clearAllMocks()
  })

  describe('observeFirehoseMessage', () => {
    it('returns false when no connection found', async () => {
      const firehose = createMockFirehoseService({
        findConnectionBySignalGroup: vi.fn().mockResolvedValue(null),
      })
      const msg = createMockMessage()

      const result = await observeFirehoseMessage(firehose, msg)

      expect(result).toBe(false)
      expect(firehose.findConnectionBySignalGroup).toHaveBeenCalledWith('group-123', 'hub-456')
      expect(firehose.addBufferMessage).not.toHaveBeenCalled()
    })

    it('returns false when connection status is not active', async () => {
      const firehose = createMockFirehoseService({
        findConnectionBySignalGroup: vi.fn().mockResolvedValue({
          id: 'conn-1',
          status: 'pending',
          agentPubkey: 'pubkey-abc',
          bufferTtlDays: 7,
        }),
      })
      const msg = createMockMessage()

      const result = await observeFirehoseMessage(firehose, msg)

      expect(result).toBe(false)
      expect(firehose.addBufferMessage).not.toHaveBeenCalled()
    })

    it('returns true and encrypts message when connection is active', async () => {
      const firehose = createMockFirehoseService({
        findConnectionBySignalGroup: vi.fn().mockResolvedValue({
          id: 'conn-1',
          status: 'active',
          agentPubkey: 'pubkey-abc',
          bufferTtlDays: 7,
        }),
        getCurrentWindowKey: vi.fn().mockResolvedValue(null),
        createWindowKey: vi.fn().mockResolvedValue({ id: 'wk-1' }),
        addBufferMessage: vi.fn().mockResolvedValue(undefined),
        incrementWindowKeyMessageCount: vi.fn().mockResolvedValue(undefined),
      })
      const msg = createMockMessage()

      const result = await observeFirehoseMessage(firehose, msg)

      expect(result).toBe(true)
      expect(firehose.findConnectionBySignalGroup).toHaveBeenCalledWith('group-123', 'hub-456')
      expect(firehose.createWindowKey).toHaveBeenCalledWith({
        connectionId: 'conn-1',
        sealedKey: expect.stringContaining('mock-wrapped-key'),
        windowStart: expect.any(Date),
        windowEnd: expect.any(Date),
      })
      expect(firehose.addBufferMessage).toHaveBeenCalledWith(
        'conn-1',
        expect.objectContaining({
          signalTimestamp: msg.timestamp,
          encryptedContent: expect.stringMatching(/^[0-9a-f]+$/i),
          encryptedSenderInfo: expect.stringMatching(/^[0-9a-f]+$/i),
          windowKeyId: 'wk-1',
          expiresAt: expect.any(Date),
        }),
      )
      expect(firehose.incrementWindowKeyMessageCount).toHaveBeenCalledWith('wk-1')
    })

    it('reuses existing window key when valid and cached', async () => {
      const firehose = createMockFirehoseService({
        findConnectionBySignalGroup: vi.fn().mockResolvedValue({
          id: 'conn-1',
          status: 'active',
          agentPubkey: 'pubkey-abc',
          bufferTtlDays: 7,
        }),
        getCurrentWindowKey: vi.fn().mockResolvedValue(null),
        createWindowKey: vi.fn().mockResolvedValue({ id: 'wk-existing' }),
        addBufferMessage: vi.fn().mockResolvedValue(undefined),
        incrementWindowKeyMessageCount: vi.fn().mockResolvedValue(undefined),
      })

      const msg1 = createMockMessage({ content: 'First message' })
      const result1 = await observeFirehoseMessage(firehose, msg1)
      expect(result1).toBe(true)
      expect(firehose.createWindowKey).toHaveBeenCalledTimes(1)
      expect(firehose.addBufferMessage).toHaveBeenCalledWith(
        'conn-1',
        expect.objectContaining({ windowKeyId: 'wk-existing' }),
      )

      const msg2 = createMockMessage({ content: 'Second message' })
      vi.clearAllMocks()
      const firehose2 = createMockFirehoseService({
        findConnectionBySignalGroup: vi.fn().mockResolvedValue({
          id: 'conn-1',
          status: 'active',
          agentPubkey: 'pubkey-abc',
          bufferTtlDays: 7,
        }),
        getCurrentWindowKey: vi.fn().mockResolvedValue({
          id: 'wk-existing',
          windowEnd: new Date('2099-01-01T00:00:00Z'),
          sealedKey: 'sealed-key-hex',
        }),
        addBufferMessage: vi.fn().mockResolvedValue(undefined),
        incrementWindowKeyMessageCount: vi.fn().mockResolvedValue(undefined),
      })

      const result2 = await observeFirehoseMessage(firehose2, msg2)
      expect(result2).toBe(true)
      expect(firehose2.createWindowKey).not.toHaveBeenCalled()
      expect(firehose2.addBufferMessage).toHaveBeenCalledWith(
        'conn-1',
        expect.objectContaining({ windowKeyId: 'wk-existing' }),
      )
    })

    it('returns false when encryption throws', async () => {
      const firehose = createMockFirehoseService({
        findConnectionBySignalGroup: vi.fn().mockResolvedValue({
          id: 'conn-1',
          status: 'active',
          agentPubkey: 'pubkey-abc',
          bufferTtlDays: 7,
        }),
        getCurrentWindowKey: vi.fn().mockRejectedValue(new Error('DB error')),
      })
      const msg = createMockMessage()

      const result = await observeFirehoseMessage(firehose, msg)

      expect(result).toBe(false)
    })
  })

  describe('clearWindowKeyCache', () => {
    it('clears the in-memory window key cache', async () => {
      const firehose = createMockFirehoseService({
        findConnectionBySignalGroup: vi.fn().mockResolvedValue({
          id: 'conn-1',
          status: 'active',
          agentPubkey: 'pubkey-abc',
          bufferTtlDays: 7,
        }),
        getCurrentWindowKey: vi.fn().mockResolvedValue(null),
        createWindowKey: vi.fn().mockResolvedValue({ id: 'wk-1' }),
        addBufferMessage: vi.fn().mockResolvedValue(undefined),
        incrementWindowKeyMessageCount: vi.fn().mockResolvedValue(undefined),
      })
      const msg = createMockMessage()

      await observeFirehoseMessage(firehose, msg)
      expect(firehose.createWindowKey).toHaveBeenCalledTimes(1)

      clearWindowKeyCache()

      const firehose2 = createMockFirehoseService({
        findConnectionBySignalGroup: vi.fn().mockResolvedValue({
          id: 'conn-1',
          status: 'active',
          agentPubkey: 'pubkey-abc',
          bufferTtlDays: 7,
        }),
        getCurrentWindowKey: vi.fn().mockResolvedValue({
          id: 'wk-1',
          windowEnd: new Date('2099-01-01T00:00:00Z'),
          sealedKey: 'sealed-key-hex',
        }),
        createWindowKey: vi.fn().mockResolvedValue({ id: 'wk-2' }),
        addBufferMessage: vi.fn().mockResolvedValue(undefined),
        incrementWindowKeyMessageCount: vi.fn().mockResolvedValue(undefined),
      })

      const msg2 = createMockMessage()
      await observeFirehoseMessage(firehose2, msg2)

      expect(firehose2.createWindowKey).toHaveBeenCalledTimes(1)
    })
  })
})
