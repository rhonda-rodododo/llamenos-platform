import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BlastsService } from '../../services/blasts'
import type { Database } from '../../db'
import { blasts, blastDeliveries } from '../../db/schema'

vi.mock('@worker/lib/crypto', () => ({
  hashPhone: vi.fn().mockReturnValue('hashed-phone'),
  hashIP: vi.fn().mockReturnValue('hashed-ip'),
  encryptContactIdentifier: vi.fn().mockReturnValue('encrypted'),
  decryptContactIdentifier: vi.fn().mockReturnValue('+1234567890'),
}))

vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('drizzle-orm')>()
  return {
    ...actual,
    eq: vi.fn((a, b) => ({ column: a, value: b })),
    and: vi.fn((...conds) => ({ conditions: conds })),
    sql: vi.fn((strings, ...values) => ({ raw: strings, values })),
  }
})

function createMockDb(): Database {
  const mockLimit = vi.fn().mockResolvedValue([])
  const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit })
  const mockFrom = vi.fn().mockReturnValue({ where: mockWhere })
  const mockSelect = vi.fn().mockReturnValue({ from: mockFrom })

  const mockReturning = vi.fn().mockResolvedValue([])
  const mockUpdateWhere = vi.fn().mockReturnValue({ returning: mockReturning })
  const mockUpdateSet = vi.fn().mockReturnValue({ where: mockUpdateWhere })
  const mockUpdate = vi.fn().mockReturnValue({ set: mockUpdateSet })

  return {
    update: mockUpdate,
    select: mockSelect,
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockResolvedValue([]),
        returning: vi.fn().mockResolvedValue([]),
      }),
    }),
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }),
    }),
    execute: vi.fn().mockResolvedValue([]),
  } as unknown as Database
}

function mockBlast(status: string): typeof blasts.$inferSelect {
  const now = new Date()
  return {
    id: 'blast-1',
    hubId: 'hub-1',
    name: 'Test Blast',
    content: { text: 'Hello' },
    status,
    targetChannels: ['sms'],
    targetTags: [],
    targetLanguages: [],
    createdBy: 'admin-1',
    scheduledAt: null,
    sentAt: null,
    cancelledAt: null,
    createdAt: now,
    updatedAt: now,
    stats: { totalRecipients: 10, sent: 0, delivered: 0, failed: 0, optedOut: 0 },
    completedAt: null,
  }
}

function mockDelivery(status: string, attempts: number, error?: string): typeof blastDeliveries.$inferSelect {
  const now = new Date()
  return {
    id: 'delivery-1',
    blastId: 'blast-1',
    subscriberId: 'sub-1',
    channel: 'sms',
    status,
    externalId: null,
    attempts,
    lastAttemptAt: null,
    nextRetryAt: null,
    deliveredAt: null,
    failedAt: null,
    error: error ?? null,
    createdAt: now,
  }
}

describe('BlastsService.retryDelivery', () => {
  let db: Database
  let service: BlastsService

  beforeEach(() => {
    db = createMockDb()
    service = new BlastsService(db, 'a'.repeat(64))
  })

  it('resets a failed delivery to pending with incremented attempts', async () => {
    const blast = mockBlast('sent')
    const delivery = mockDelivery('failed', 2, 'timeout')

    // Mock getBlast
    vi.spyOn(service, 'getBlast').mockResolvedValue(blast)

    // Mock select to return the delivery
    const mockLimit = vi.fn().mockResolvedValue([delivery])
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit })
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere })
    const mockSelect = vi.fn().mockReturnValue({ from: mockFrom })
    db.select = mockSelect

    // Mock update returning
    const updatedDelivery = { ...delivery, status: 'pending', attempts: 3, error: null, nextRetryAt: new Date() }
    const mockUpdateReturning = vi.fn().mockResolvedValue([updatedDelivery])
    const mockUpdateWhere = vi.fn().mockReturnValue({ returning: mockUpdateReturning })
    const mockUpdateSet = vi.fn().mockReturnValue({ where: mockUpdateWhere })
    db.update = vi.fn().mockReturnValue({ set: mockUpdateSet })

    const result = await service.retryDelivery(blast.id, delivery.id)

    expect(result.status).toBe('pending')
    expect(result.attempts).toBe(3)
    expect(result.error).toBeNull()
    expect(result.nextRetryAt).toBeDefined()
  })

  it('throws if delivery is not in failed status', async () => {
    const blast = mockBlast('sending')
    const delivery = mockDelivery('sent', 1)

    vi.spyOn(service, 'getBlast').mockResolvedValue(blast)

    const mockLimit = vi.fn().mockResolvedValue([delivery])
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit })
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere })
    const mockSelect = vi.fn().mockReturnValue({ from: mockFrom })
    db.select = mockSelect

    await expect(service.retryDelivery(blast.id, delivery.id))
      .rejects.toThrow('Only failed deliveries can be retried')
  })

  it('throws if blast is not in sending or sent status', async () => {
    const blast = mockBlast('draft')
    const delivery = mockDelivery('failed', 1)

    vi.spyOn(service, 'getBlast').mockResolvedValue(blast)

    await expect(service.retryDelivery(blast.id, delivery.id))
      .rejects.toThrow('Blast must be in sending or sent state to retry')
  })
})

describe('BlastsService.retryFailedDeliveries', () => {
  let db: Database
  let service: BlastsService

  beforeEach(() => {
    db = createMockDb()
    service = new BlastsService(db, 'a'.repeat(64))
  })

  it('resets all failed deliveries for a blast to pending', async () => {
    const blast = mockBlast('sent')

    vi.spyOn(service, 'getBlast').mockResolvedValue(blast)

    // Mock update returning 2 rows
    const mockUpdateReturning = vi.fn().mockResolvedValue([{ id: 'del-1' }, { id: 'del-2' }])
    const mockUpdateWhere = vi.fn().mockReturnValue({ returning: mockUpdateReturning })
    const mockUpdateSet = vi.fn().mockReturnValue({ where: mockUpdateWhere })
    db.update = vi.fn().mockReturnValue({ set: mockUpdateSet })

    const count = await service.retryFailedDeliveries(blast.id)

    expect(count).toBe(2)
  })

  it('throws if blast is not in sending or sent status', async () => {
    const blast = mockBlast('cancelled')

    vi.spyOn(service, 'getBlast').mockResolvedValue(blast)

    await expect(service.retryFailedDeliveries(blast.id))
      .rejects.toThrow('Blast must be in sending or sent state to retry')
  })

  it('transitions blast back to sending when retrying from sent', async () => {
    const blast = mockBlast('sent')

    vi.spyOn(service, 'getBlast').mockResolvedValue(blast)

    // Mock update returning 1 row
    const mockUpdateReturning = vi.fn().mockResolvedValue([{ id: 'del-1' }])
    const mockUpdateWhere = vi.fn().mockReturnValue({ returning: mockUpdateReturning })
    const mockUpdateSet = vi.fn().mockReturnValue({ where: mockUpdateWhere })
    db.update = vi.fn().mockReturnValue({ set: mockUpdateSet })

    await service.retryFailedDeliveries(blast.id)

    expect(db.update).toHaveBeenCalled()
  })
})
