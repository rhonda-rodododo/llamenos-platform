import { describe, it, expect, vi } from 'vitest'
import { FirehoseAgentService } from '@worker/services/firehose-agent'
import { createMockDb } from './mock-db'

describe('FirehoseAgentService', () => {
  function setup() {
    const { db } = createMockDb()
    const firehose = {
      listActiveConnections: vi.fn().mockResolvedValue([]),
      getConnection: vi.fn().mockResolvedValue(null),
      updateConnection: vi.fn().mockResolvedValue(undefined),
      getUnextractedMessages: vi.fn().mockResolvedValue([]),
      markMessagesExtracted: vi.fn().mockResolvedValue(undefined),
      getWindowKey: vi.fn().mockResolvedValue(null),
    } as any
    const conversations = {
      create: vi.fn().mockResolvedValue({ id: 'conv-1' }),
      addMessage: vi.fn().mockResolvedValue({ id: 'msg-1' }),
    } as any
    const auditService = { log: vi.fn().mockResolvedValue(undefined) } as any
    const settings = { getCustomFields: vi.fn().mockResolvedValue({ fields: [] }) } as any

    const service = new FirehoseAgentService(
      db as any,
      firehose,
      conversations,
      auditService,
      settings,
      'seal-key',
      {},
    )

    return { service, firehose, conversations, auditService }
  }

  describe('heuristicCluster', () => {
    it('returns empty for empty messages', () => {
      const { service } = setup()
      const result = service.heuristicCluster([])
      expect(result).toEqual([])
    })

    it('puts all messages in one cluster when within window', () => {
      const { service } = setup()
      const messages = [
        { id: 'm1', senderUsername: 'u1', content: 'a', timestamp: '2024-01-01T00:00:00Z' },
        { id: 'm2', senderUsername: 'u2', content: 'b', timestamp: '2024-01-01T00:01:00Z' },
        { id: 'm3', senderUsername: 'u1', content: 'c', timestamp: '2024-01-01T00:02:00Z' },
      ]

      const result = service.heuristicCluster(messages)
      expect(result).toHaveLength(1)
      expect(result[0].messages).toHaveLength(3)
    })

    it('splits into multiple clusters when gap exceeds window', () => {
      const { service } = setup()
      const messages = [
        { id: 'm1', senderUsername: 'u1', content: 'a', timestamp: '2024-01-01T00:00:00Z' },
        { id: 'm2', senderUsername: 'u2', content: 'b', timestamp: '2024-01-01T00:10:00Z' },
      ]

      const result = service.heuristicCluster(messages)
      expect(result).toHaveLength(2)
    })

    it('sorts messages by timestamp before clustering', () => {
      const { service } = setup()
      const messages = [
        { id: 'm2', senderUsername: 'u2', content: 'b', timestamp: '2024-01-01T00:10:00Z' },
        { id: 'm1', senderUsername: 'u1', content: 'a', timestamp: '2024-01-01T00:00:00Z' },
      ]

      const result = service.heuristicCluster(messages)
      expect(result).toHaveLength(2)
      expect(result[0].messages[0].id).toBe('m1')
      expect(result[1].messages[0].id).toBe('m2')
    })

    it('sets default confidence on clusters', () => {
      const { service } = setup()
      const messages = [
        { id: 'm1', senderUsername: 'u1', content: 'a', timestamp: '2024-01-01T00:00:00Z' },
      ]

      const result = service.heuristicCluster(messages)
      expect(result[0].confidence).toBe(0.7)
    })
  })

  describe('lifecycle', () => {
    it('isRunning returns false when no agent started', () => {
      const { service } = setup()
      expect(service.isRunning('conn-1')).toBe(false)
    })

    it('init starts agents for active connections', async () => {
      const { service, firehose } = setup()
      firehose.listActiveConnections.mockResolvedValue([{ id: 'conn-1', status: 'active' }])
      firehose.getConnection.mockResolvedValue({
        id: 'conn-1',
        status: 'active',
        hubId: 'hub-1',
        agentPubkey: 'pk1',
        encryptedAgentNsec: 'enc-nsec',
        extractionIntervalSec: 60,
      })

      await service.init()
      expect(firehose.listActiveConnections).toHaveBeenCalled()
    })

    it('init handles connection startup failures gracefully', async () => {
      const { service, firehose } = setup()
      firehose.listActiveConnections.mockResolvedValue([{ id: 'conn-1' }])
      firehose.getConnection.mockResolvedValue(null)

      await service.init()
    })

    it('shutdown stops all agents', () => {
      const { service } = setup()
      service.shutdown()
      expect(service.isRunning('conn-1')).toBe(false)
    })
  })
})
