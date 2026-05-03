import { describe, it, expect, jest } from 'bun:test'
import { CryptoKeysService, CryptoKeyError } from '../../services/crypto-keys'

// ---------------------------------------------------------------------------
// DB mock helpers
// ---------------------------------------------------------------------------

interface MockLink {
  id: string
  userPubkey: string
  seqNo: number
  linkType: string
  payload: unknown
  signature: string
  prevHash: string
  hash: string
  createdAt: Date
}

interface MockPukEnvelope {
  id: string
  userPubkey: string
  deviceId: string
  generation: number
  envelope: string
  createdAt: Date
}

interface MockMlsMessage {
  id: string
  hubId: string
  recipientDeviceId: string
  messageType: string
  payload: unknown
  createdAt: Date
}

function makeLink(overrides: Partial<MockLink> & { seqNo: number; hash: string }): MockLink {
  return {
    id: `link-${overrides.seqNo}`,
    userPubkey: 'user-pk1',
    linkType: 'add_device',
    payload: { devicePubkey: 'dev-pk' },
    signature: 'sig-hex',
    prevHash: '',
    createdAt: new Date('2026-01-01'),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Sigchain tests
// ---------------------------------------------------------------------------

describe('CryptoKeysService — Sigchain', () => {
  describe('getSigchain', () => {
    it('returns empty array for user with no sigchain', async () => {
      const db = {
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              orderBy: jest.fn().mockResolvedValue([]),
            }),
          }),
        }),
      }
      const svc = new CryptoKeysService(db as never)
      const result = await svc.getSigchain('user-pk1')
      expect(result).toEqual([])
    })

    it('returns links ordered by seqNo ascending', async () => {
      const links = [
        makeLink({ seqNo: 0, hash: 'h0', prevHash: '' }),
        makeLink({ seqNo: 1, hash: 'h1', prevHash: 'h0' }),
        makeLink({ seqNo: 2, hash: 'h2', prevHash: 'h1' }),
      ]

      const db = {
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              orderBy: jest.fn().mockResolvedValue(links),
            }),
          }),
        }),
      }

      const svc = new CryptoKeysService(db as never)
      const result = await svc.getSigchain('user-pk1')

      expect(result).toHaveLength(3)
      expect(result[0].seqNo).toBe(0)
      expect(result[1].seqNo).toBe(1)
      expect(result[2].seqNo).toBe(2)
      // createdAt should be ISO string
      expect(typeof result[0].createdAt).toBe('string')
    })
  })

  describe('appendSigchainLink', () => {
    it('appends genesis link (seqNo=0, prevHash="")', async () => {
      const insertedRow = makeLink({
        seqNo: 0,
        hash: 'genesis-hash',
        prevHash: '',
      })

      const db = {
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              orderBy: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue([]),
              }), // empty chain
            }),
          }),
        }),
        insert: jest.fn().mockReturnValue({
          values: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([insertedRow]),
          }),
        }),
      }

      const svc = new CryptoKeysService(db as never)
      const result = await svc.appendSigchainLink('user-pk1', {
        seqNo: 0,
        linkType: 'add_device',
        payload: { devicePubkey: 'dev-pk' },
        signature: 'sig',
        prevHash: '',
        hash: 'genesis-hash',
      })

      expect(result.seqNo).toBe(0)
      expect(result.hash).toBe('genesis-hash')
      expect(result.prevHash).toBe('')
      expect(db.insert).toHaveBeenCalled()
    })

    it('appends link with correct seqNo and prevHash', async () => {
      // DESC LIMIT 1 returns only the chain tail (highest seqNo)
      const chainTail = [
        makeLink({ seqNo: 1, hash: 'h1', prevHash: 'h0' }),
      ]

      const insertedRow = makeLink({
        seqNo: 2,
        hash: 'h2',
        prevHash: 'h1',
      })

      const db = {
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              orderBy: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue(chainTail),
              }),
            }),
          }),
        }),
        insert: jest.fn().mockReturnValue({
          values: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([insertedRow]),
          }),
        }),
      }

      const svc = new CryptoKeysService(db as never)
      const result = await svc.appendSigchainLink('user-pk1', {
        seqNo: 2,
        linkType: 'add_device',
        payload: {},
        signature: 'sig',
        prevHash: 'h1',
        hash: 'h2',
      })

      expect(result.seqNo).toBe(2)
      expect(result.prevHash).toBe('h1')
    })

    it('rejects seqNo mismatch with 409', async () => {
      const existingLinks = [
        makeLink({ seqNo: 0, hash: 'h0', prevHash: '' }),
      ]

      const db = {
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              orderBy: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue(existingLinks),
              }),
            }),
          }),
        }),
      }

      const svc = new CryptoKeysService(db as never)
      try {
        await svc.appendSigchainLink('user-pk1', {
          seqNo: 5, // should be 1
          linkType: 'add_device',
          payload: {},
          signature: 'sig',
          prevHash: 'h0',
          hash: 'h5',
        })
        expect.unreachable('should have thrown')
      } catch (err) {
        expect(err).toBeInstanceOf(CryptoKeyError)
        expect((err as CryptoKeyError).status).toBe(409)
        expect((err as CryptoKeyError).message).toContain('expected 1, got 5')
      }
    })

    it('rejects prevHash mismatch with 409', async () => {
      const existingLinks = [
        makeLink({ seqNo: 0, hash: 'h0', prevHash: '' }),
      ]

      const db = {
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              orderBy: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue(existingLinks),
              }),
            }),
          }),
        }),
      }

      const svc = new CryptoKeysService(db as never)
      try {
        await svc.appendSigchainLink('user-pk1', {
          seqNo: 1,
          linkType: 'add_device',
          payload: {},
          signature: 'sig',
          prevHash: 'wrong-hash', // should be 'h0'
          hash: 'h1',
        })
        expect.unreachable('should have thrown')
      } catch (err) {
        expect(err).toBeInstanceOf(CryptoKeyError)
        expect((err as CryptoKeyError).status).toBe(409)
        expect((err as CryptoKeyError).message).toContain('prevHash mismatch')
      }
    })

    it('rejects seqNo=0 when chain already has genesis', async () => {
      const existingLinks = [
        makeLink({ seqNo: 0, hash: 'h0', prevHash: '' }),
      ]

      const db = {
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              orderBy: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue(existingLinks),
              }),
            }),
          }),
        }),
      }

      const svc = new CryptoKeysService(db as never)
      try {
        await svc.appendSigchainLink('user-pk1', {
          seqNo: 0, // should be 1
          linkType: 'add_device',
          payload: {},
          signature: 'sig',
          prevHash: '',
          hash: 'duplicate-genesis',
        })
        expect.unreachable('should have thrown')
      } catch (err) {
        expect(err).toBeInstanceOf(CryptoKeyError)
        expect((err as CryptoKeyError).status).toBe(409)
      }
    })
  })

  describe('FIX: appendSigchainLink uses single optimized query', () => {
    it('makes exactly 1 select query (DESC LIMIT 1) for chain head', async () => {
      // Previously, the service made 2 queries:
      //   1. orderBy(asc).limit(1000) — result was UNUSED
      //   2. orderBy(asc) — then used .at(-1)
      //
      // Fixed to: orderBy(desc).limit(1) — single efficient query
      const selectSpy = jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            orderBy: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([]),
            }),
          }),
        }),
      })

      const db = {
        select: selectSpy,
        insert: jest.fn().mockReturnValue({
          values: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([
              makeLink({ seqNo: 0, hash: 'h0', prevHash: '' }),
            ]),
          }),
        }),
      }

      const svc = new CryptoKeysService(db as never)
      await svc.appendSigchainLink('user-pk1', {
        seqNo: 0,
        linkType: 'add_device',
        payload: {},
        signature: 'sig',
        prevHash: '',
        hash: 'h0',
      })

      // Fixed: now only 1 select query
      expect(selectSpy).toHaveBeenCalledTimes(1)
    })
  })
})

// ---------------------------------------------------------------------------
// PUK Envelopes
// ---------------------------------------------------------------------------

describe('CryptoKeysService — PUK Envelopes', () => {
  describe('distributePukEnvelopes', () => {
    it('returns empty array when no envelopes provided', async () => {
      const db = {
        insert: jest.fn(),
      }
      const svc = new CryptoKeysService(db as never)
      const result = await svc.distributePukEnvelopes('user-pk1', [])
      expect(result).toEqual([])
      expect(db.insert).not.toHaveBeenCalled()
    })

    it('inserts and returns envelope records', async () => {
      const now = new Date()
      const insertedRows = [
        {
          id: 'env-1',
          userPubkey: 'user-pk1',
          deviceId: 'dev-1',
          generation: 1,
          envelope: 'hpke-blob-1',
          createdAt: now,
        },
        {
          id: 'env-2',
          userPubkey: 'user-pk1',
          deviceId: 'dev-2',
          generation: 1,
          envelope: 'hpke-blob-2',
          createdAt: now,
        },
      ]

      const db = {
        insert: jest.fn().mockReturnValue({
          values: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue(insertedRows),
          }),
        }),
      }

      const svc = new CryptoKeysService(db as never)
      const result = await svc.distributePukEnvelopes('user-pk1', [
        { deviceId: 'dev-1', generation: 1, envelope: 'hpke-blob-1' },
        { deviceId: 'dev-2', generation: 1, envelope: 'hpke-blob-2' },
      ])

      expect(result).toHaveLength(2)
      expect(result[0].deviceId).toBe('dev-1')
      expect(result[1].deviceId).toBe('dev-2')
      expect(typeof result[0].createdAt).toBe('string') // ISO string
    })
  })

  describe('getPukEnvelopeForDevice', () => {
    it('returns null when no envelope exists', async () => {
      const db = {
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue([{ maxGen: null }]),
          }),
        }),
      }

      const svc = new CryptoKeysService(db as never)
      const result = await svc.getPukEnvelopeForDevice('user-pk1', 'dev-1')
      expect(result).toBeNull()
    })

    it('returns the latest generation envelope', async () => {
      const envRow = {
        id: 'env-latest',
        userPubkey: 'user-pk1',
        deviceId: 'dev-1',
        generation: 3,
        envelope: 'latest-hpke-blob',
        createdAt: new Date(),
      }

      const db = {
        select: jest.fn()
          .mockReturnValueOnce({
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockResolvedValue([{ maxGen: 3 }]),
            }),
          })
          .mockReturnValueOnce({
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue([envRow]),
              }),
            }),
          }),
      }

      const svc = new CryptoKeysService(db as never)
      const result = await svc.getPukEnvelopeForDevice('user-pk1', 'dev-1')

      expect(result).toBeTruthy()
      expect(result!.generation).toBe(3)
      expect(result!.envelope).toBe('latest-hpke-blob')
    })
  })
})

// ---------------------------------------------------------------------------
// MLS Messages
// ---------------------------------------------------------------------------

describe('CryptoKeysService — MLS Messages', () => {
  describe('enqueueMlsMessages', () => {
    it('does nothing for empty message array', async () => {
      const db = { insert: jest.fn() }
      const svc = new CryptoKeysService(db as never)
      await svc.enqueueMlsMessages('hub-1', [])
      expect(db.insert).not.toHaveBeenCalled()
    })

    it('inserts messages for multiple recipients', async () => {
      const insertValues = jest.fn().mockReturnValue({})
      const db = {
        insert: jest.fn().mockReturnValue({
          values: insertValues,
        }),
      }

      const svc = new CryptoKeysService(db as never)
      await svc.enqueueMlsMessages('hub-1', [
        { recipientDeviceId: 'dev-1', messageType: 'welcome', payload: { data: 1 } },
        { recipientDeviceId: 'dev-2', messageType: 'commit', payload: { data: 2 } },
      ])

      expect(insertValues).toHaveBeenCalledWith([
        { hubId: 'hub-1', recipientDeviceId: 'dev-1', messageType: 'welcome', payload: { data: 1 } },
        { hubId: 'hub-1', recipientDeviceId: 'dev-2', messageType: 'commit', payload: { data: 2 } },
      ])
    })
  })

  describe('fetchAndClearMlsMessages', () => {
    it('returns empty array when no messages pending', async () => {
      const db = {
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue([]),
          }),
        }),
      }

      const svc = new CryptoKeysService(db as never)
      const result = await svc.fetchAndClearMlsMessages('hub-1', 'dev-1')
      expect(result).toEqual([])
    })

    it('returns and deletes pending messages', async () => {
      const messages = [
        {
          id: 'msg-1',
          hubId: 'hub-1',
          recipientDeviceId: 'dev-1',
          messageType: 'welcome',
          payload: { data: 1 },
          createdAt: new Date(),
        },
      ]

      const deleteMock = jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue(undefined),
      })

      const db = {
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue(messages),
          }),
        }),
        delete: deleteMock,
      }

      const svc = new CryptoKeysService(db as never)
      const result = await svc.fetchAndClearMlsMessages('hub-1', 'dev-1')

      expect(result).toHaveLength(1)
      expect(result[0].messageType).toBe('welcome')
      expect(typeof result[0].createdAt).toBe('string') // ISO string
      // Verify delete was called
      expect(deleteMock).toHaveBeenCalled()
    })
  })

  describe('uploadKeyPackage', () => {
    it('stores key package as a pending message', async () => {
      const insertValues = jest.fn().mockReturnValue({})
      const db = {
        insert: jest.fn().mockReturnValue({ values: insertValues }),
      }

      const svc = new CryptoKeysService(db as never)
      await svc.uploadKeyPackage('hub-1', 'dev-1', { keyPackageData: 'binary' })

      expect(insertValues).toHaveBeenCalledWith({
        hubId: 'hub-1',
        recipientDeviceId: 'dev-1',
        messageType: 'key_package',
        payload: { keyPackageData: 'binary' },
      })
    })
  })
})

// ---------------------------------------------------------------------------
// CryptoKeyError
// ---------------------------------------------------------------------------

describe('CryptoKeyError', () => {
  it('has correct name and status defaults', () => {
    const err = new CryptoKeyError('test error')
    expect(err.name).toBe('CryptoKeyError')
    expect(err.message).toBe('test error')
    expect(err.status).toBe(500) // default
  })

  it('accepts custom status codes', () => {
    const err = new CryptoKeyError('conflict', 409)
    expect(err.status).toBe(409)
  })

  it('extends Error', () => {
    const err = new CryptoKeyError('test')
    expect(err).toBeInstanceOf(Error)
  })
})
