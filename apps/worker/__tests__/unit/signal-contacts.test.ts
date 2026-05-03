import { describe, it, expect } from 'bun:test'
import {
  hashSignalIdentifier,
  derivePerUserHmacKey,
  SignalContactsService,
} from '@worker/services/signal-contacts'
import { createMockDb } from './mock-db'

const TEST_SERVER_SECRET = 'aabbccdd'.repeat(8)
const TEST_PUBKEY = '0'.repeat(64)
const TEST_IDENTIFIER = '+15551234567'

describe('hashSignalIdentifier', () => {
  it('produces deterministic output for same input', () => {
    const key = derivePerUserHmacKey(TEST_SERVER_SECRET, TEST_PUBKEY)
    const hash1 = hashSignalIdentifier(TEST_IDENTIFIER, key)
    const hash2 = hashSignalIdentifier(TEST_IDENTIFIER, key)
    expect(hash1).toBe(hash2)
  })

  it('produces different output for different identifiers', () => {
    const key = derivePerUserHmacKey(TEST_SERVER_SECRET, TEST_PUBKEY)
    const hash1 = hashSignalIdentifier('+15551234567', key)
    const hash2 = hashSignalIdentifier('+15559876543', key)
    expect(hash1).not.toBe(hash2)
  })

  it('produces different output for different pubkeys', () => {
    const key1 = derivePerUserHmacKey(TEST_SERVER_SECRET, '0'.repeat(64))
    const key2 = derivePerUserHmacKey(TEST_SERVER_SECRET, '1'.repeat(64))
    const hash1 = hashSignalIdentifier(TEST_IDENTIFIER, key1)
    const hash2 = hashSignalIdentifier(TEST_IDENTIFIER, key2)
    expect(hash1).not.toBe(hash2)
  })

  it('outputs 64-char hex string', () => {
    const key = derivePerUserHmacKey(TEST_SERVER_SECRET, TEST_PUBKEY)
    const hash = hashSignalIdentifier(TEST_IDENTIFIER, key)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('derivePerUserHmacKey', () => {
  it('outputs 64-char hex string', () => {
    const key = derivePerUserHmacKey(TEST_SERVER_SECRET, TEST_PUBKEY)
    expect(key).toMatch(/^[0-9a-f]{64}$/)
  })

  it('produces different keys for different pubkeys', () => {
    const key1 = derivePerUserHmacKey(TEST_SERVER_SECRET, 'aa'.repeat(32))
    const key2 = derivePerUserHmacKey(TEST_SERVER_SECRET, 'bb'.repeat(32))
    expect(key1).not.toBe(key2)
  })
})

describe('SignalContactsService', () => {
  function setup() {
    const { db } = createMockDb(['userSignalContacts'])
    const service = new SignalContactsService(db as any, TEST_SERVER_SECRET)
    return { db, service }
  }

  describe('upsert', () => {
    it('inserts new contact and returns row', async () => {
      const { db, service } = setup()
      const row = {
        userPubkey: TEST_PUBKEY,
        identifierHash: 'hash123',
        identifierCiphertext: 'cipher123',
        identifierEnvelope: [{ recipientPubkey: TEST_PUBKEY, encryptedKey: 'key123' }],
        identifierType: 'phone' as const,
        verifiedAt: expect.any(Date),
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      }
      db.$setInsertResult([row])

      const result = await service.upsert({
        userPubkey: TEST_PUBKEY,
        identifierHash: 'hash123',
        identifierCiphertext: 'cipher123',
        identifierEnvelope: [{ recipientPubkey: TEST_PUBKEY, encryptedKey: 'key123' }],
        identifierType: 'phone',
      })

      expect(result.userPubkey).toBe(TEST_PUBKEY)
    })

    it('throws if upsert returns no row', async () => {
      const { db, service } = setup()
      db.$setInsertResult([])

      await expect(service.upsert({
        userPubkey: TEST_PUBKEY,
        identifierHash: 'hash123',
        identifierCiphertext: 'cipher123',
        identifierEnvelope: [],
        identifierType: 'phone',
      })).rejects.toThrow('Failed to upsert signal contact')
    })
  })

  describe('findByUser', () => {
    it('returns contact when found', async () => {
      const { db, service } = setup()
      const row = { userPubkey: TEST_PUBKEY, identifierHash: 'hash123' }
      db.$setSelectResult([row])

      const result = await service.findByUser(TEST_PUBKEY)
      expect(result as unknown).toEqual(row)
    })

    it('returns null when not found', async () => {
      const { db, service } = setup()
      db.$setSelectResult([])

      const result = await service.findByUser(TEST_PUBKEY)
      expect(result).toBeNull()
    })
  })

  describe('deleteByUser', () => {
    it('deletes without error', async () => {
      const { service } = setup()
      await expect(service.deleteByUser(TEST_PUBKEY)).resolves.toBeUndefined()
    })
  })

  describe('getPerUserHmacKey', () => {
    it('returns deterministic key for pubkey', () => {
      const { service } = setup()
      const key1 = service.getPerUserHmacKey(TEST_PUBKEY)
      const key2 = service.getPerUserHmacKey(TEST_PUBKEY)
      expect(key1).toBe(key2)
      expect(key1).toMatch(/^[0-9a-f]{64}$/)
    })
  })

  describe('hashIdentifierForUser', () => {
    it('returns hash for identifier', () => {
      const { service } = setup()
      const hash = service.hashIdentifierForUser('+15551234567', TEST_PUBKEY)
      expect(hash).toMatch(/^[0-9a-f]{64}$/)
    })

    it('produces same hash for same input', () => {
      const { service } = setup()
      const hash1 = service.hashIdentifierForUser('+15551234567', TEST_PUBKEY)
      const hash2 = service.hashIdentifierForUser('+15551234567', TEST_PUBKEY)
      expect(hash1).toBe(hash2)
    })
  })
})
