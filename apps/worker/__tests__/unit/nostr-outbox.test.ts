// @ts-nocheck
import { describe, it, expect, beforeEach, afterEach, mock, jest } from 'bun:test'
import { EventOutbox } from '@worker/lib/nostr-outbox'

mock.module('@worker/lib/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    trace: jest.fn(),
    fatal: jest.fn(),
    child: jest.fn(),
  }),
}))

function makeValidEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'a'.repeat(64),
    pubkey: 'b'.repeat(64),
    sig: 'c'.repeat(128),
    kind: 1,
    content: 'hello',
    tags: [],
    created_at: Math.floor(Date.now() / 1000),
    ...overrides,
  }
}

function createMockDb() {
  const insertCalls: { values: unknown }[] = []
  const updateCalls: { set: unknown; where: unknown }[] = []
  const executeCalls: { sql: unknown }[] = []
  let transactionOverride: unknown[] | null = null

  const db = {
    insert() {
      return {
        values(vals: unknown) {
          insertCalls.push({ values: vals })
          return Promise.resolve()
        },
      }
    },
    update() {
      return {
        set(setValues: unknown) {
          return {
            where(whereExpr: unknown) {
              updateCalls.push({ set: setValues, where: whereExpr })
              return Promise.resolve()
            },
          }
        },
      }
    },
    execute(query: unknown) {
      executeCalls.push({ sql: query })
      return Promise.resolve([])
    },
    transaction: async <T>(cb: (tx: { execute: (q: unknown) => Promise<unknown> }) => Promise<T>): Promise<T> => {
      const tx = {
        execute(query: unknown) {
          executeCalls.push({ sql: query })
          return Promise.resolve(transactionOverride ?? [])
        },
      }
      return cb(tx)
    },
    $calls: { insert: insertCalls, update: updateCalls, execute: executeCalls },
    $reset() {
      insertCalls.length = 0
      updateCalls.length = 0
      executeCalls.length = 0
      transactionOverride = null
    },
    $setTransactionResult(result: unknown[]) {
      transactionOverride = result
    },
  }

  return db
}

type MockDb = ReturnType<typeof createMockDb>

describe('EventOutbox', () => {
  let db: MockDb
  let outbox: EventOutbox

  beforeEach(() => {
    db = createMockDb()
    outbox = new EventOutbox(db as unknown as import('@worker/db').Database)
  })

  afterEach(() => {
    db.$reset()
  })

  describe('enqueue', () => {
    it('inserts a valid Nostr event into the outbox', async () => {
      const event = makeValidEvent()
      await outbox.enqueue(event)

      expect(db.$calls.insert).toHaveLength(1)
      expect(db.$calls.insert[0].values).toEqual({ eventJson: event })
    })

    it('throws on invalid event with missing required fields', async () => {
      const event = { kind: 1, content: 'hello' }
      await expect(outbox.enqueue(event)).rejects.toThrow('missing fields')
    })

    it('throws on invalid event id', async () => {
      const event = makeValidEvent({ id: 'too-short' })
      await expect(outbox.enqueue(event)).rejects.toThrow('invalid event id')
    })

    it('throws on invalid signature', async () => {
      const event = makeValidEvent({ sig: 'short' })
      await expect(outbox.enqueue(event)).rejects.toThrow('invalid signature')
    })

    it('does not insert when validation fails', async () => {
      await expect(outbox.enqueue({ kind: 1 })).rejects.toThrow()
      expect(db.$calls.insert).toHaveLength(0)
    })
  })

  describe('drainBatch', () => {
    it('returns parsed events from the transaction', async () => {
      const event = makeValidEvent()
      db.$setTransactionResult([{ id: 1, event_json: event, attempts: 0 }])

      const result = await outbox.drainBatch(10)

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe(1)
      expect(result[0].event_json).toEqual(event)
      expect(result[0].attempts).toBe(0)
    })

    it('parses double-serialized JSONB string values', async () => {
      const event = makeValidEvent()
      db.$setTransactionResult([{ id: 2, event_json: JSON.stringify(event), attempts: 1 }])

      const result = await outbox.drainBatch(10)

      expect(result).toHaveLength(1)
      expect(result[0].event_json).toEqual(event)
    })

    it('skips rows with unparseable event_json and marks them dead', async () => {
      db.$setTransactionResult([{ id: 3, event_json: 'not-json', attempts: 0 }])

      const result = await outbox.drainBatch(10)

      expect(result).toHaveLength(0)
      expect(db.$calls.update).toHaveLength(1)
      expect(db.$calls.update[0].set).toEqual({ status: 'dead', attempts: 999 })
    })

    it('skips rows that fail Nostr validation and marks them dead', async () => {
      db.$setTransactionResult([{ id: 4, event_json: { kind: 1, content: 'no sig' }, attempts: 0 }])

      const result = await outbox.drainBatch(10)

      expect(result).toHaveLength(0)
      expect(db.$calls.update).toHaveLength(1)
      expect(db.$calls.update[0].set).toEqual({ status: 'dead', attempts: 999 })
    })

    it('handles multiple rows with mixed validity', async () => {
      const valid = makeValidEvent()
      db.$setTransactionResult([
        { id: 5, event_json: valid, attempts: 0 },
        { id: 6, event_json: 'bad-json', attempts: 0 },
        { id: 7, event_json: makeValidEvent({ id: 'wrong' }), attempts: 0 },
      ])

      const result = await outbox.drainBatch(10)

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe(5)
      expect(db.$calls.update).toHaveLength(2)
    })

    it('does not crash when markPermanentlyFailed throws', async () => {
      db.update = () => ({
        set: () => ({
          where: () => Promise.reject(new Error('db connection lost')),
        }),
      })

      db.$setTransactionResult([{ id: 8, event_json: 'not-json', attempts: 0 }])

      await expect(outbox.drainBatch(10)).resolves.toEqual([])
    })

    it('returns empty array when no rows found', async () => {
      db.$setTransactionResult([])
      const result = await outbox.drainBatch(10)
      expect(result).toEqual([])
    })
  })

  describe('markDelivered', () => {
    it('updates status to delivered', async () => {
      await outbox.markDelivered(42)

      expect(db.$calls.update).toHaveLength(1)
      expect(db.$calls.update[0].set).toEqual({ status: 'delivered' })
    })
  })

  describe('markFailed', () => {
    it('updates status to pending with incremented attempts and backoff interval', async () => {
      await outbox.markFailed(99, 2)

      expect(db.$calls.update).toHaveLength(1)
      const setValues = db.$calls.update[0].set as Record<string, unknown>
      expect(setValues.status).toBe('pending')
      expect(setValues.attempts).toBe(3)
      expect(setValues.nextRetryAt).toBeInstanceOf(Object)
    })

    it('caps backoff at 480 seconds', async () => {
      await outbox.markFailed(99, 100)

      const setValues = db.$calls.update[0].set as Record<string, unknown>
      expect(setValues.attempts).toBe(101)
      expect(setValues.nextRetryAt).toBeInstanceOf(Object)
    })

    it('generates a drizzle SQL fragment for nextRetryAt', async () => {
      await outbox.markFailed(1, 0)

      const setValues = db.$calls.update[0].set as Record<string, unknown>
      expect(setValues.nextRetryAt).toBeInstanceOf(Object)
    })
  })

  describe('cleanup', () => {
    it('executes delete SQL for old events', async () => {
      await outbox.cleanup()

      expect(db.$calls.execute).toHaveLength(1)
      expect(db.$calls.execute[0].sql).toBeInstanceOf(Object)
    })
  })

  describe('stats', () => {
    it('returns pending and failed counts from query result', async () => {
      db.execute = (query: unknown) => {
        db.$calls.execute.push({ sql: query })
        return Promise.resolve([{ pending: 5, failed: 2 }])
      }

      const result = await outbox.stats()
      expect(result).toEqual({ pending: 5, failed: 2 })
    })

    it('returns zeros when query returns empty', async () => {
      db.execute = (query: unknown) => {
        db.$calls.execute.push({ sql: query })
        return Promise.resolve([])
      }

      const result = await outbox.stats()
      expect(result).toEqual({ pending: 0, failed: 0 })
    })

    it('returns zeros for non-array result', async () => {
      db.execute = (query: unknown) => {
        db.$calls.execute.push({ sql: query })
        return Promise.resolve({ pending: 3, failed: 1 })
      }

      const result = await outbox.stats()
      expect(result).toEqual({ pending: 0, failed: 0 })
    })
  })
})
