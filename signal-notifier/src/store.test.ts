import { describe, expect, test, beforeAll, afterAll, beforeEach } from 'vitest'
import { IdentifierStore } from './store'
import { createTestDb } from './test-helpers'

const TEST_SECRET = 'test-encryption-secret-for-signal-notifier-store'

describe('IdentifierStore (PostgreSQL)', () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>
  let store: IdentifierStore

  beforeAll(async () => {
    ctx = await createTestDb('store')
    store = new IdentifierStore(ctx.db, TEST_SECRET)
  })

  beforeEach(async () => {
    await ctx.truncateAll()
  })

  afterAll(async () => {
    await ctx.cleanup()
  })

  test('register + lookup roundtrips with encryption', async () => {
    await store.register('hash1', '+15551234567', 'phone')
    const result = await store.lookup('hash1')
    expect(result?.plaintext).toBe('+15551234567')
    expect(result?.type).toBe('phone')
  })

  test('lookup returns null for unknown hash', async () => {
    expect(await store.lookup('missing')).toBeNull()
  })

  test('register replaces existing entry', async () => {
    await store.register('hash1', '+15551111111', 'phone')
    await store.register('hash1', '+15552222222', 'phone')
    expect((await store.lookup('hash1'))?.plaintext).toBe('+15552222222')
  })

  test('remove deletes entry', async () => {
    await store.register('hash1', '+15551111111', 'phone')
    await store.remove('hash1')
    expect(await store.lookup('hash1')).toBeNull()
  })

  test('count returns registered entry total', async () => {
    expect(await store.count()).toBe(0)
    await store.register('hash1', '+15551111111', 'phone')
    await store.register('hash2', '@signal.user', 'username')
    expect(await store.count()).toBe(2)
    await store.remove('hash1')
    expect(await store.count()).toBe(1)
  })

  test('isRegistered returns true for existing hash', async () => {
    await store.register('hash1', '+15551111111', 'phone')
    expect(await store.isRegistered('hash1')).toBe(true)
    expect(await store.isRegistered('hash2')).toBe(false)
  })

  test('plaintext is encrypted at rest — wrong key cannot decrypt', async () => {
    await store.register('hash1', '+15551234567', 'phone')
    const wrongStore = new IdentifierStore(ctx.db, 'wrong-secret')
    const result = await wrongStore.lookup('hash1')
    expect(result).toBeNull()
  })
})
