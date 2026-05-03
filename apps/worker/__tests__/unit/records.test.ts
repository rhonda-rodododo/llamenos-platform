import { describe, it, expect, jest } from 'bun:test'
import { RecordsService } from '@worker/services/records'
import { ServiceError } from '@worker/services/settings'
import { createMockDb } from './mock-db'

describe('RecordsService', () => {
  function setup() {
    const { db } = createMockDb(['notes', 'noteReplies', 'bans', 'contactMetadata'])
    const audit = { log: jest.fn().mockResolvedValue(undefined) } as any
    const service = new RecordsService(db as any, audit)
    return { db, service, audit }
  }

  describe('createNote', () => {
    it('creates a note with required fields', async () => {
      const { db, service } = setup()
      const note = {
        id: 'note-1',
        hubId: 'hub-1',
        authorPubkey: 'pk1',
        encryptedContent: 'encrypted',
        authorEnvelope: {},
        replyCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      db.$setInsertResult([note])

      const result = await service.createNote({
        hubId: 'hub-1',
        authorPubkey: 'pk1',
        encryptedContent: 'encrypted',
        authorEnvelope: {},
      })

      expect(result.authorPubkey).toBe('pk1')
      expect(result.hubId).toBe('hub-1')
    })

    it('upserts contact metadata when contactHash provided', async () => {
      const { db, service } = setup()
      const note = {
        id: 'note-1',
        hubId: 'hub-1',
        authorPubkey: 'pk1',
        encryptedContent: 'encrypted',
        authorEnvelope: {},
        contactHash: 'hash123',
        replyCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      db.$setInsertResult([note])

      await service.createNote({
        hubId: 'hub-1',
        authorPubkey: 'pk1',
        encryptedContent: 'encrypted',
        authorEnvelope: {},
        contactHash: 'hash123',
      })
    })
  })

  describe('getNote', () => {
    it('returns note when found', async () => {
      const { db, service } = setup()
      const note = { id: 'note-1', authorPubkey: 'pk1', encryptedContent: 'enc' }
      db.$setSelectResult([note])

      const result = await service.getNote('note-1')
      expect(result.id).toBe('note-1')
    })

    it('throws 404 when not found', async () => {
      const { db, service } = setup()
      db.$setSelectResult([])

      await expect(service.getNote('note-1')).rejects.toThrow('Note not found')
    })
  })

  describe('listNotes', () => {
    it('filters by hubId', async () => {
      const { db, service } = setup()
      db.$setSelectResults([
        [{ id: 'n1' }, { id: 'n2' }],
        [{ total: 2 }],
      ])

      const result = await service.listNotes({ hubId: 'hub-1' })
      expect(result.notes).toHaveLength(2)
      expect(result.total).toBe(2)
    })

    it('returns empty when no notes', async () => {
      const { db, service } = setup()
      db.$setSelectResults([[], [{ total: 0 }]])

      const result = await service.listNotes()
      expect(result.notes).toEqual([])
      expect(result.total).toBe(0)
    })
  })

  describe('updateNote', () => {
    it('updates note when author matches', async () => {
      const { db, service } = setup()
      db.$setSelectResult([{ id: 'note-1', authorPubkey: 'pk1', encryptedContent: 'old' }])
      db.$setUpdateResult([{ id: 'note-1', authorPubkey: 'pk1', encryptedContent: 'new' }])

      const result = await service.updateNote('note-1', {
        encryptedContent: 'new',
        authorPubkey: 'pk1',
      })

      expect(result.encryptedContent).toBe('new')
    })

    it('throws 403 when author does not match', async () => {
      const { db, service } = setup()
      db.$setSelectResult([{ id: 'note-1', authorPubkey: 'pk1', encryptedContent: 'old' }])

      await expect(service.updateNote('note-1', {
        encryptedContent: 'new',
        authorPubkey: 'pk2',
      })).rejects.toThrow('Only the note author can update this note')
    })
  })

  describe('deleteNote', () => {
    it('deletes existing note', async () => {
      const { db, service } = setup()
      db.$setDeleteResult([{ id: 'note-1' }])

      await expect(service.deleteNote('note-1')).resolves.toBeUndefined()
    })

    it('throws 404 when note not found', async () => {
      const { db, service } = setup()
      db.$setDeleteResult([])

      await expect(service.deleteNote('note-1')).rejects.toThrow('Note not found')
    })
  })

  describe('createReply', () => {
    it('creates reply and increments parent count', async () => {
      const { db, service } = setup()
      db.$setSelectResult([{ id: 'note-1', replyCount: 0 }])
      db.$setInsertResult([{ id: 'reply-1', noteId: 'note-1' }])
      db.$setUpdateResult([{ id: 'note-1', replyCount: 1 }])

      const result = await service.createReply('note-1', {
        authorPubkey: 'pk2',
        encryptedContent: 'reply',
        readerEnvelopes: [],
      })

      expect(result.noteId).toBe('note-1')
    })

    it('throws when parent note not found', async () => {
      const { db, service } = setup()
      db.$setSelectResult([])

      await expect(service.createReply('note-1', {
        authorPubkey: 'pk2',
        encryptedContent: 'reply',
        readerEnvelopes: [],
      })).rejects.toThrow('Note not found')
    })
  })

  describe('listReplies', () => {
    it('returns replies for note', async () => {
      const { db, service } = setup()
      db.$setSelectResults([
        [{ id: 'note-1' }],
        [{ id: 'r1' }, { id: 'r2' }],
      ])

      const result = await service.listReplies('note-1')
      expect(result).toHaveLength(2)
    })

    it('throws when parent note not found', async () => {
      const { db, service } = setup()
      db.$setSelectResult([])

      await expect(service.listReplies('note-1')).rejects.toThrow('Note not found')
    })
  })

  describe('addBan', () => {
    it('creates new ban when not existing', async () => {
      const { db, service } = setup()
      const ban = { id: 'ban-1', phone: '+15551234567', reason: 'spam' }
      db.$setSelectResult([])
      db.$setInsertResult([ban])

      const result = await service.addBan({ phone: '+15551234567', reason: 'spam', bannedBy: 'pk1' })
      expect(result.phone).toBe('+15551234567')
    })

    it('returns existing ban when already banned', async () => {
      const { db, service } = setup()
      const existing = { id: 'ban-1', phone: '+15551234567', reason: 'spam' }
      db.$setSelectResult([existing])

      const result = await service.addBan({ phone: '+15551234567', reason: 'spam', bannedBy: 'pk1' })
      expect(result.id).toBe('ban-1')
    })

    it('scopes ban to hubId when provided', async () => {
      const { db, service } = setup()
      db.$setSelectResult([])
      db.$setInsertResult([{ id: 'ban-1', hubId: 'hub-1', phone: '+15551234567' }])

      const result = await service.addBan({ hubId: 'hub-1', phone: '+15551234567', reason: 'spam', bannedBy: 'pk1' })
      expect(result.hubId).toBe('hub-1')
    })
  })

  describe('listBans', () => {
    it('lists bans for hub', async () => {
      const { db, service } = setup()
      db.$setSelectResult([{ id: 'ban-1' }, { id: 'ban-2' }])

      const result = await service.listBans('hub-1')
      expect(result.bans).toHaveLength(2)
    })

    it('lists all bans when no hubId', async () => {
      const { db, service } = setup()
      db.$setSelectResult([{ id: 'ban-1' }])

      const result = await service.listBans()
      expect(result.bans).toHaveLength(1)
    })
  })

  describe('bulkAddBans', () => {
    it('adds multiple bans and skips duplicates', async () => {
      const { db, service } = setup()
      db.$setSelectResult([])

      const count = await service.bulkAddBans(
        ['+1111', '+2222', '+1111'],
        'spam',
        'pk1',
        'hub-1'
      )

      expect(count).toBe(2)
    })

    it('skips already-banned phones', async () => {
      const { db, service } = setup()
      db.$setSelectResult([{ phone: '+1111' }])

      const count = await service.bulkAddBans(['+1111', '+2222'], 'spam', 'pk1')
      expect(count).toBe(1)
    })
  })

  describe('removeBan', () => {
    it('removes ban by phone', async () => {
      const { service } = setup()
      await expect(service.removeBan('+15551234567')).resolves.toBeUndefined()
    })
  })

  describe('checkBan', () => {
    it('returns true when banned', async () => {
      const { db, service } = setup()
      db.$setSelectResult([{ id: 'ban-1' }])

      const result = await service.checkBan('+15551234567')
      expect(result).toBe(true)
    })

    it('returns false when not banned', async () => {
      const { db, service } = setup()
      db.$setSelectResult([])

      const result = await service.checkBan('+15551234567')
      expect(result).toBe(false)
    })
  })

  describe('getContactMeta', () => {
    it('returns metadata when found', async () => {
      const { db, service } = setup()
      db.$setSelectResult([{ contactHash: 'hash1', noteCount: 5 }])

      const result = await service.getContactMeta('hash1')
      expect(result?.noteCount).toBe(5)
    })

    it('returns null when not found', async () => {
      const { db, service } = setup()
      db.$setSelectResult([])

      const result = await service.getContactMeta('hash1')
      expect(result).toBeNull()
    })
  })

  describe('reset', () => {
    it('resets all record tables', async () => {
      const { service } = setup()
      await expect(service.reset()).resolves.toBeUndefined()
    })
  })

  describe('getMigrationStatus', () => {
    it('returns counts', async () => {
      const { db, service } = setup()
      db.$setSelectResults([
        [{ noteCount: 10 }],
        [{ banCount: 2 }],
      ])

      const result = await service.getMigrationStatus()
      expect(result.noteCount).toBe(10)
      expect(result.banCount).toBe(2)
    })
  })
})
