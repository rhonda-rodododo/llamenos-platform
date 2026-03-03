/**
 * Integration tests for RecordsDO — tests real DO logic with in-memory storage.
 *
 * Tests cover:
 * - Encrypted note CRUD operations
 * - Audit log entry creation and chain verification
 * - Ban list management
 * - Note thread replies
 * - Pagination for notes and audit logs
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { RecordsDO } from '@worker/durable-objects/records-do'
import { createDOTestHarness } from './helpers'

describe('RecordsDO integration', () => {
  let doFetch: ReturnType<typeof createDOTestHarness>['doFetch']
  let doJSON: ReturnType<typeof createDOTestHarness>['doJSON']
  let postJSON: ReturnType<typeof createDOTestHarness>['postJSON']
  let patchJSON: ReturnType<typeof createDOTestHarness>['patchJSON']

  beforeEach(() => {
    const harness = createDOTestHarness(RecordsDO)
    doFetch = harness.doFetch
    doJSON = harness.doJSON
    postJSON = harness.postJSON
    patchJSON = harness.patchJSON
  })

  it('creates an encrypted note', async () => {
    const res = await postJSON('/notes', {
      callId: 'call-001',
      authorPubkey: 'author-pub-1',
      encryptedContent: 'hex-encrypted-note-content',
      authorEnvelope: {
        pubkey: 'author-pub-1',
        wrappedKey: 'wrapped-key-hex',
        ephemeralPubkey: 'ephemeral-hex',
      },
    })

    expect(res.status).toBe(200)
    const data = await res.json() as {
      note: {
        id: string
        callId: string
        authorPubkey: string
        encryptedContent: string
        replyCount: number
      }
    }
    expect(data.note.id).toBeDefined()
    expect(data.note.callId).toBe('call-001')
    expect(data.note.authorPubkey).toBe('author-pub-1')
    expect(data.note.encryptedContent).toBe('hex-encrypted-note-content')
    expect(data.note.replyCount).toBe(0)
  })

  it('retrieves notes by call ID', async () => {
    await postJSON('/notes', {
      callId: 'call-A',
      authorPubkey: 'author-1',
      encryptedContent: 'note-for-call-A',
    })
    await postJSON('/notes', {
      callId: 'call-B',
      authorPubkey: 'author-1',
      encryptedContent: 'note-for-call-B',
    })
    await postJSON('/notes', {
      callId: 'call-A',
      authorPubkey: 'author-2',
      encryptedContent: 'another-note-for-call-A',
    })

    const data = await doJSON<{ notes: Array<{ callId: string }>; total: number }>('/notes?callId=call-A')
    expect(data.notes).toHaveLength(2)
    expect(data.notes.every((n) => n.callId === 'call-A')).toBe(true)
    expect(data.total).toBe(2)
  })

  it('retrieves notes by author pubkey', async () => {
    await postJSON('/notes', {
      callId: 'call-1',
      authorPubkey: 'specific-author',
      encryptedContent: 'content-1',
    })
    await postJSON('/notes', {
      callId: 'call-2',
      authorPubkey: 'other-author',
      encryptedContent: 'content-2',
    })
    await postJSON('/notes', {
      callId: 'call-3',
      authorPubkey: 'specific-author',
      encryptedContent: 'content-3',
    })

    const data = await doJSON<{ notes: Array<{ authorPubkey: string }>; total: number }>(
      '/notes?author=specific-author'
    )
    expect(data.notes).toHaveLength(2)
    expect(data.notes.every((n) => n.authorPubkey === 'specific-author')).toBe(true)
  })

  it('updates an existing note', async () => {
    const createRes = await postJSON('/notes', {
      callId: 'call-upd',
      authorPubkey: 'update-author',
      encryptedContent: 'original-content',
    })
    const { note } = await createRes.json() as { note: { id: string } }

    // Update the note
    const updateRes = await patchJSON(`/notes/${note.id}`, {
      encryptedContent: 'updated-content',
      authorPubkey: 'update-author',
    })
    expect(updateRes.status).toBe(200)
    const updated = await updateRes.json() as { note: { encryptedContent: string } }
    expect(updated.note.encryptedContent).toBe('updated-content')

    // Verify a different author cannot update
    const forbiddenRes = await patchJSON(`/notes/${note.id}`, {
      encryptedContent: 'tampered-content',
      authorPubkey: 'different-author',
    })
    expect(forbiddenRes.status).toBe(403)
  })

  it('creates audit log entries with hash chain', async () => {
    // Create first entry
    const first = await postJSON('/audit', {
      event: 'volunteerAdded',
      actorPubkey: 'admin-pub',
      details: { name: 'New Vol', pubkey: 'vol-pub' },
    })
    expect(first.status).toBe(200)
    const firstEntry = (await first.json() as {
      entry: { id: string; entryHash: string; previousEntryHash: string }
    }).entry
    expect(firstEntry.entryHash).toBeDefined()
    expect(firstEntry.previousEntryHash).toBe('')

    // Create second entry — should chain to first
    const second = await postJSON('/audit', {
      event: 'callAnswered',
      actorPubkey: 'vol-pub',
      details: { callId: 'call-999' },
    })
    const secondEntry = (await second.json() as {
      entry: { previousEntryHash: string; entryHash: string }
    }).entry
    expect(secondEntry.previousEntryHash).toBe(firstEntry.entryHash)
    expect(secondEntry.entryHash).toBeDefined()
    expect(secondEntry.entryHash).not.toBe(firstEntry.entryHash)

    // Create third entry — should chain to second
    const third = await postJSON('/audit', {
      event: 'noteCreated',
      actorPubkey: 'vol-pub',
      details: { noteId: 'note-123' },
    })
    const thirdEntry = (await third.json() as { entry: { previousEntryHash: string } }).entry
    expect(thirdEntry.previousEntryHash).toBe(secondEntry.entryHash)
  })

  it('paginates audit log entries', async () => {
    for (let i = 0; i < 5; i++) {
      await postJSON('/audit', {
        event: `event-${i}`,
        actorPubkey: 'admin-pub',
        details: { index: i },
      })
    }

    const page1 = await doJSON<{ entries: Array<{ event: string }>; total: number }>(
      '/audit?page=1&limit=2'
    )
    expect(page1.entries).toHaveLength(2)
    expect(page1.total).toBe(5)

    const page2 = await doJSON<{ entries: unknown[] }>('/audit?page=2&limit=2')
    expect(page2.entries).toHaveLength(2)

    const page3 = await doJSON<{ entries: unknown[] }>('/audit?page=3&limit=2')
    expect(page3.entries).toHaveLength(1)
  })

  it('stores and manages ban list', async () => {
    // Add a ban
    const banRes = await postJSON('/bans', {
      phone: '+15551234567',
      reason: 'Spam caller',
      bannedBy: 'admin-pub',
    })
    expect(banRes.status).toBe(200)
    const ban = (await banRes.json() as { ban: { phone: string; reason: string } }).ban
    expect(ban.phone).toBe('+15551234567')
    expect(ban.reason).toBe('Spam caller')

    // Check ban
    const checkBanned = await doJSON<{ banned: boolean }>('/bans/check/%2B15551234567')
    expect(checkBanned.banned).toBe(true)

    // Check non-banned number
    const checkClean = await doJSON<{ banned: boolean }>('/bans/check/%2B15559999999')
    expect(checkClean.banned).toBe(false)

    // List bans
    const list = await doJSON<{ bans: Array<{ phone: string }> }>('/bans')
    expect(list.bans).toHaveLength(1)

    // Remove ban
    const removeRes = await doFetch('/bans/%2B15551234567', { method: 'DELETE' })
    expect(removeRes.status).toBe(200)

    // Verify removed
    const afterRemove = await doJSON<{ banned: boolean }>('/bans/check/%2B15551234567')
    expect(afterRemove.banned).toBe(false)
  })

  it('retrieves call history with pagination', async () => {
    for (let i = 0; i < 5; i++) {
      await postJSON('/notes', {
        callId: `call-page-${i}`,
        authorPubkey: 'page-author',
        encryptedContent: `encrypted-${i}`,
      })
    }

    const page1 = await doJSON<{ notes: unknown[]; total: number }>('/notes?page=1&limit=2')
    expect(page1.notes).toHaveLength(2)
    expect(page1.total).toBe(5)

    const page2 = await doJSON<{ notes: unknown[] }>('/notes?page=2&limit=2')
    expect(page2.notes).toHaveLength(2)

    const page3 = await doJSON<{ notes: unknown[] }>('/notes?page=3&limit=2')
    expect(page3.notes).toHaveLength(1)
  })

  it('thread replies link to parent note', async () => {
    // Create a parent note
    const createRes = await postJSON('/notes', {
      callId: 'call-thread',
      authorPubkey: 'thread-author',
      encryptedContent: 'parent-note-content',
    })
    const { note: parent } = await createRes.json() as { note: { id: string; replyCount: number } }
    expect(parent.replyCount).toBe(0)

    // Add a reply
    const replyRes = await postJSON(`/notes/${parent.id}/replies`, {
      authorPubkey: 'replier-pub',
      encryptedContent: 'reply-content',
      readerEnvelopes: [
        {
          pubkey: 'thread-author',
          wrappedKey: 'wrapped-key-1',
          ephemeralPubkey: 'ephemeral-1',
        },
      ],
    })
    expect(replyRes.status).toBe(200)
    const reply = (await replyRes.json() as {
      reply: { id: string; conversationId: string; authorPubkey: string }
    }).reply
    expect(reply.id).toBeDefined()
    expect(reply.conversationId).toBe(parent.id)
    expect(reply.authorPubkey).toBe('replier-pub')

    // Add a second reply
    await postJSON(`/notes/${parent.id}/replies`, {
      authorPubkey: 'thread-author',
      encryptedContent: 'second-reply',
      readerEnvelopes: [
        {
          pubkey: 'replier-pub',
          wrappedKey: 'wrapped-key-2',
          ephemeralPubkey: 'ephemeral-2',
        },
      ],
    })

    // Get replies
    const repliesData = await doJSON<{ replies: Array<{ authorPubkey: string }> }>(
      `/notes/${parent.id}/replies`
    )
    expect(repliesData.replies).toHaveLength(2)

    // Verify parent note's replyCount was updated
    const updatedNotes = await doJSON<{ notes: Array<{ id: string; replyCount: number }> }>(
      '/notes?callId=call-thread'
    )
    const updatedParent = updatedNotes.notes.find((n) => n.id === parent.id)
    expect(updatedParent?.replyCount).toBe(2)
  })
})
