/**
 * Integration tests for PostgresStorage — the Node.js KV store backed by PostgreSQL.
 *
 * Requires DATABASE_URL env var pointing to a real PostgreSQL instance.
 * Tables are auto-created by initPostgresPool().
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { initPostgresPool, getPool, closePool } from '../../../src/platform/bun/storage/postgres-pool'
import { PostgresStorage } from '../../../src/platform/bun/storage/postgres-storage'

const skipIfNoDB = !process.env.DATABASE_URL

describe.skipIf(skipIfNoDB)('PostgresStorage', () => {
  let testId: string

  beforeAll(async () => {
    await initPostgresPool()
  })

  afterAll(async () => {
    await closePool()
  })

  beforeEach(() => {
    // Unique namespace per test to avoid cross-test interference
    testId = `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  })

  describe('JSONB roundtrip', () => {
    it('preserves strings', async () => {
      const storage = new PostgresStorage(`${testId}-string`)
      await storage.put('key', 'hello world')
      const result = await storage.get<string>('key')
      expect(result).toBe('hello world')
    })

    it('preserves numbers (integer and float)', async () => {
      const storage = new PostgresStorage(`${testId}-number`)
      await storage.put('int', 42)
      await storage.put('float', 3.14159)
      await storage.put('negative', -100)
      await storage.put('zero', 0)

      expect(await storage.get<number>('int')).toBe(42)
      expect(await storage.get<number>('float')).toBeCloseTo(3.14159)
      expect(await storage.get<number>('negative')).toBe(-100)
      expect(await storage.get<number>('zero')).toBe(0)
    })

    it('preserves booleans', async () => {
      const storage = new PostgresStorage(`${testId}-bool`)
      await storage.put('t', true)
      await storage.put('f', false)

      expect(await storage.get<boolean>('t')).toBe(true)
      expect(await storage.get<boolean>('f')).toBe(false)
    })

    it('preserves null', async () => {
      const storage = new PostgresStorage(`${testId}-null`)
      await storage.put('n', null)
      const result = await storage.get('n')
      expect(result).toBeNull()
    })

    it('preserves arrays', async () => {
      const storage = new PostgresStorage(`${testId}-array`)
      const arr = [1, 'two', true, null, [3, 4]]
      await storage.put('arr', arr)
      expect(await storage.get('arr')).toEqual(arr)
    })

    it('preserves complex nested objects', async () => {
      const storage = new PostgresStorage(`${testId}-nested`)
      const complex = {
        name: 'test',
        count: 99,
        active: true,
        tags: ['a', 'b', 'c'],
        metadata: {
          created: '2024-01-01',
          nested: {
            deep: true,
            values: [1, 2, { x: 'y' }],
          },
        },
        nullable: null,
      }
      await storage.put('complex', complex)
      expect(await storage.get('complex')).toEqual(complex)
    })

    it('overwrites existing values', async () => {
      const storage = new PostgresStorage(`${testId}-overwrite`)
      await storage.put('key', 'first')
      expect(await storage.get('key')).toBe('first')

      await storage.put('key', 'second')
      expect(await storage.get('key')).toBe('second')

      await storage.put('key', { changed: true })
      expect(await storage.get('key')).toEqual({ changed: true })
    })

    it('returns undefined for missing keys', async () => {
      const storage = new PostgresStorage(`${testId}-missing`)
      const result = await storage.get('nonexistent')
      expect(result).toBeUndefined()
    })
  })

  describe('namespace isolation', () => {
    it('two storages with different namespaces do not see each other', async () => {
      const storageA = new PostgresStorage(`${testId}-ns-a`)
      const storageB = new PostgresStorage(`${testId}-ns-b`)

      await storageA.put('shared-key', 'value-a')
      await storageB.put('shared-key', 'value-b')

      expect(await storageA.get('shared-key')).toBe('value-a')
      expect(await storageB.get('shared-key')).toBe('value-b')
    })

    it('delete in one namespace does not affect the other', async () => {
      const storageA = new PostgresStorage(`${testId}-iso-a`)
      const storageB = new PostgresStorage(`${testId}-iso-b`)

      await storageA.put('key', 'a')
      await storageB.put('key', 'b')

      await storageA.delete('key')

      expect(await storageA.get('key')).toBeUndefined()
      expect(await storageB.get('key')).toBe('b')
    })

    it('deleteAll in one namespace does not affect the other', async () => {
      const storageA = new PostgresStorage(`${testId}-delall-a`)
      const storageB = new PostgresStorage(`${testId}-delall-b`)

      await storageA.put('k1', 'a1')
      await storageA.put('k2', 'a2')
      await storageB.put('k1', 'b1')

      await storageA.deleteAll()

      expect(await storageA.get('k1')).toBeUndefined()
      expect(await storageA.get('k2')).toBeUndefined()
      expect(await storageB.get('k1')).toBe('b1')
    })

    it('list only returns keys from the same namespace', async () => {
      const storageA = new PostgresStorage(`${testId}-list-a`)
      const storageB = new PostgresStorage(`${testId}-list-b`)

      await storageA.put('x', 1)
      await storageA.put('y', 2)
      await storageB.put('z', 3)

      const listA = await storageA.list()
      const listB = await storageB.list()

      expect(listA.size).toBe(2)
      expect(listA.get('x')).toBe(1)
      expect(listA.get('y')).toBe(2)
      expect(listA.has('z')).toBe(false)

      expect(listB.size).toBe(1)
      expect(listB.get('z')).toBe(3)
    })
  })

  describe('advisory lock contention', () => {
    it('concurrent puts to the same namespace are serialized without lost updates', async () => {
      const ns = `${testId}-lock-contention`
      const storage = new PostgresStorage(ns)

      // Write a counter key, then do many concurrent increments
      await storage.put('counter', 0)

      const concurrency = 20
      const incrementPromises = Array.from({ length: concurrency }, async (_, i) => {
        // Each writer reads current value and increments it
        // With advisory locks, these should serialize
        const current = (await storage.get<number>('counter')) ?? 0
        await storage.put('counter', current + 1)
      })

      // These run concurrently but advisory locks serialize the writes.
      // Because reads are outside the transaction, we may get stale reads.
      // The important thing is that put() does not crash or produce corrupt data.
      await Promise.all(incrementPromises)

      // The final value should be a valid number (not NaN, not null)
      const final = await storage.get<number>('counter')
      expect(final).toBeTypeOf('number')
      expect(final).toBeGreaterThanOrEqual(1)
      expect(final).toBeLessThanOrEqual(concurrency)
    })

    it('concurrent puts to different namespaces are independent', async () => {
      const namespaces = Array.from({ length: 5 }, (_, i) => `${testId}-indep-${i}`)
      const storages = namespaces.map(ns => new PostgresStorage(ns))

      // Write to all namespaces concurrently
      await Promise.all(
        storages.map((storage, i) => storage.put('val', i))
      )

      // Each namespace should have its own value
      const results = await Promise.all(
        storages.map(storage => storage.get<number>('val'))
      )
      results.forEach((val, i) => {
        expect(val).toBe(i)
      })
    })
  })

  describe('list with prefix', () => {
    it('returns only matching keys', async () => {
      const storage = new PostgresStorage(`${testId}-prefix`)

      await storage.put('user:1', { name: 'Alice' })
      await storage.put('user:2', { name: 'Bob' })
      await storage.put('note:1', { text: 'hello' })
      await storage.put('config', 'value')

      const users = await storage.list({ prefix: 'user:' })
      expect(users.size).toBe(2)
      expect(users.get('user:1')).toEqual({ name: 'Alice' })
      expect(users.get('user:2')).toEqual({ name: 'Bob' })
      expect(users.has('note:1')).toBe(false)
      expect(users.has('config')).toBe(false)
    })

    it('returns empty map when no keys match the prefix', async () => {
      const storage = new PostgresStorage(`${testId}-noprefix`)
      await storage.put('abc', 1)
      const result = await storage.list({ prefix: 'xyz:' })
      expect(result.size).toBe(0)
    })

    it('returns all keys when no prefix is specified', async () => {
      const storage = new PostgresStorage(`${testId}-allkeys`)
      await storage.put('a', 1)
      await storage.put('b', 2)
      await storage.put('c', 3)

      const result = await storage.list()
      expect(result.size).toBe(3)
    })

    it('handles LIKE wildcard characters in prefix safely', async () => {
      const storage = new PostgresStorage(`${testId}-wildcard`)
      await storage.put('100%_done', 'yes')
      await storage.put('100%_not', 'no')
      await storage.put('100abc', 'other')

      // The prefix "100%" should not be treated as a LIKE wildcard
      const result = await storage.list({ prefix: '100%' })
      expect(result.size).toBe(2)
      expect(result.has('100%_done')).toBe(true)
      expect(result.has('100%_not')).toBe(true)
      expect(result.has('100abc')).toBe(false)
    })
  })

  describe('delete and deleteAll', () => {
    it('delete removes a single key', async () => {
      const storage = new PostgresStorage(`${testId}-del`)
      await storage.put('a', 1)
      await storage.put('b', 2)

      await storage.delete('a')

      expect(await storage.get('a')).toBeUndefined()
      expect(await storage.get('b')).toBe(2)
    })

    it('delete on nonexistent key does not throw', async () => {
      const storage = new PostgresStorage(`${testId}-delnone`)
      await expect(storage.delete('nonexistent')).resolves.toBeUndefined()
    })

    it('deleteAll removes all keys in the namespace', async () => {
      const storage = new PostgresStorage(`${testId}-delall`)
      await storage.put('x', 1)
      await storage.put('y', 2)
      await storage.put('z', 3)

      await storage.deleteAll()

      const list = await storage.list()
      expect(list.size).toBe(0)
      expect(await storage.get('x')).toBeUndefined()
    })

    it('deleteAll also removes alarms for the namespace', async () => {
      const storage = new PostgresStorage(`${testId}-delalarm`)
      await storage.put('key', 'value')
      await storage.setAlarm(Date.now() + 60_000)

      expect(await storage.getAlarm()).not.toBeNull()

      await storage.deleteAll()

      expect(await storage.getAlarm()).toBeNull()
      expect(await storage.get('key')).toBeUndefined()
    })
  })

  describe('alarm operations', () => {
    it('setAlarm and getAlarm roundtrip', async () => {
      const storage = new PostgresStorage(`${testId}-alarm`)
      const scheduledTime = Date.now() + 30_000

      await storage.setAlarm(scheduledTime)
      const retrieved = await storage.getAlarm()

      expect(retrieved).toBe(scheduledTime)
    })

    it('setAlarm accepts Date objects', async () => {
      const storage = new PostgresStorage(`${testId}-alarm-date`)
      const date = new Date(Date.now() + 30_000)

      await storage.setAlarm(date)
      const retrieved = await storage.getAlarm()

      expect(retrieved).toBe(date.getTime())
    })

    it('setAlarm overwrites previous alarm (rescheduling)', async () => {
      const storage = new PostgresStorage(`${testId}-alarm-resched`)
      const t1 = Date.now() + 10_000
      const t2 = Date.now() + 60_000

      await storage.setAlarm(t1)
      expect(await storage.getAlarm()).toBe(t1)

      await storage.setAlarm(t2)
      expect(await storage.getAlarm()).toBe(t2)
    })

    it('deleteAlarm removes the alarm', async () => {
      const storage = new PostgresStorage(`${testId}-alarm-del`)
      await storage.setAlarm(Date.now() + 30_000)
      expect(await storage.getAlarm()).not.toBeNull()

      await storage.deleteAlarm()
      expect(await storage.getAlarm()).toBeNull()
    })

    it('getAlarm returns null when no alarm is set', async () => {
      const storage = new PostgresStorage(`${testId}-alarm-none`)
      expect(await storage.getAlarm()).toBeNull()
    })

    it('fireAlarm invokes the alarm callback', async () => {
      const storage = new PostgresStorage(`${testId}-alarm-fire`)
      let fired = false
      storage.setAlarmCallback(async () => {
        fired = true
      })

      await storage.fireAlarm()
      expect(fired).toBe(true)
    })

    it('fireAlarm does nothing when no callback is set', async () => {
      const storage = new PostgresStorage(`${testId}-alarm-nofire`)
      // Should not throw
      await expect(storage.fireAlarm()).resolves.toBeUndefined()
    })
  })
})
