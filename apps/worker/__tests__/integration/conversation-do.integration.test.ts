/**
 * Integration tests for ConversationDO — tests real DO logic with in-memory storage.
 *
 * Tests cover:
 * - Incoming message creates new conversation
 * - Message threading within conversation
 * - Conversation assignment/claim
 * - Conversation status transitions (waiting -> active -> closed)
 * - Message delivery status updates
 * - Listing by status and assignee
 * - Volunteer load tracking
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { ConversationDO } from '@worker/durable-objects/conversation-do'
import { createDOTestHarness } from './helpers'

describe('ConversationDO integration', () => {
  let doFetch: ReturnType<typeof createDOTestHarness>['doFetch']
  let doJSON: ReturnType<typeof createDOTestHarness>['doJSON']
  let postJSON: ReturnType<typeof createDOTestHarness>['postJSON']
  let patchJSON: ReturnType<typeof createDOTestHarness>['patchJSON']

  beforeEach(() => {
    const harness = createDOTestHarness(ConversationDO)
    doFetch = harness.doFetch
    doJSON = harness.doJSON
    postJSON = harness.postJSON
    patchJSON = harness.patchJSON
  })

  it('creates conversation from incoming message', async () => {
    const res = await postJSON('/conversations/incoming', {
      channelType: 'sms',
      senderIdentifier: '+15551234567',
      senderIdentifierHash: 'hash-of-phone-1',
      body: 'Hello, I need help',
      externalId: 'ext-msg-001',
      timestamp: new Date().toISOString(),
    })

    expect(res.status).toBe(200)
    const data = await res.json() as {
      conversationId: string
      messageId: string
      isNew: boolean
      status: string
    }
    expect(data.conversationId).toBeDefined()
    expect(data.messageId).toBeDefined()
    expect(data.isNew).toBe(true)
    expect(data.status).toBe('waiting')

    // Verify conversation exists
    const convRes = await doFetch(`/conversations/${data.conversationId}`)
    expect(convRes.status).toBe(200)
    const conv = await convRes.json() as {
      channelType: string
      contactIdentifierHash: string
      contactLast4: string
      status: string
      messageCount: number
    }
    expect(conv.channelType).toBe('sms')
    expect(conv.contactIdentifierHash).toBe('hash-of-phone-1')
    expect(conv.contactLast4).toBe('4567')
    expect(conv.status).toBe('waiting')
    expect(conv.messageCount).toBe(1)
  })

  it('adds messages to existing conversation', async () => {
    // Create conversation via incoming
    const incoming = await postJSON('/conversations/incoming', {
      channelType: 'sms',
      senderIdentifier: '+15559999999',
      senderIdentifierHash: 'hash-sender-2',
      body: 'First message',
    })
    const { conversationId } = await incoming.json() as { conversationId: string }

    // Send a second message from same sender
    const second = await postJSON('/conversations/incoming', {
      channelType: 'sms',
      senderIdentifier: '+15559999999',
      senderIdentifierHash: 'hash-sender-2',
      body: 'Second message',
    })
    const secondData = await second.json() as { conversationId: string; isNew: boolean }
    expect(secondData.conversationId).toBe(conversationId)
    expect(secondData.isNew).toBe(false)

    // Verify message count
    const conv = await doJSON<{ messageCount: number }>(`/conversations/${conversationId}`)
    expect(conv.messageCount).toBe(2)

    // Get messages
    const messages = await doJSON<{ messages: Array<{ encryptedContent: string }>; total: number }>(
      `/conversations/${conversationId}/messages`
    )
    expect(messages.total).toBe(2)
  })

  it('assigns conversation to volunteer', async () => {
    // Create conversation
    const incoming = await postJSON('/conversations/incoming', {
      channelType: 'sms',
      senderIdentifier: '+15558888888',
      senderIdentifierHash: 'hash-assign-test',
      body: 'Need help',
    })
    const { conversationId } = await incoming.json() as { conversationId: string }

    // Claim conversation
    const claimRes = await postJSON(`/conversations/${conversationId}/claim`, {
      pubkey: 'volunteer-pub-1',
    })
    expect(claimRes.status).toBe(200)
    const claimed = await claimRes.json() as {
      assignedTo: string
      status: string
    }
    expect(claimed.assignedTo).toBe('volunteer-pub-1')
    expect(claimed.status).toBe('active')
  })

  it('transitions status: waiting -> active on assignment', async () => {
    // Create conversation
    const incoming = await postJSON('/conversations/incoming', {
      channelType: 'signal',
      senderIdentifier: '+15557777777',
      senderIdentifierHash: 'hash-transition-1',
      body: 'Help me',
    })
    const { conversationId } = await incoming.json() as { conversationId: string }

    // Verify initial status
    const before = await doJSON<{ status: string }>(`/conversations/${conversationId}`)
    expect(before.status).toBe('waiting')

    // Claim it
    await postJSON(`/conversations/${conversationId}/claim`, { pubkey: 'vol-pub' })

    // Verify status changed
    const after = await doJSON<{ status: string }>(`/conversations/${conversationId}`)
    expect(after.status).toBe('active')
  })

  it('transitions status: active -> closed on close', async () => {
    // Create and claim conversation
    const incoming = await postJSON('/conversations/incoming', {
      channelType: 'sms',
      senderIdentifier: '+15556666666',
      senderIdentifierHash: 'hash-close-test',
      body: 'Conversation to close',
    })
    const { conversationId } = await incoming.json() as { conversationId: string }
    await postJSON(`/conversations/${conversationId}/claim`, { pubkey: 'vol-pub' })

    // Close the conversation
    const closeRes = await patchJSON(`/conversations/${conversationId}`, {
      status: 'closed',
    })
    expect(closeRes.status).toBe(200)
    const closed = await closeRes.json() as { status: string }
    expect(closed.status).toBe('closed')

    // Verify persistence
    const check = await doJSON<{ status: string }>(`/conversations/${conversationId}`)
    expect(check.status).toBe('closed')
  })

  it('creates new conversation for closed sender (not reopen)', async () => {
    // Create, claim, and close
    const incoming = await postJSON('/conversations/incoming', {
      channelType: 'sms',
      senderIdentifier: '+15555555555',
      senderIdentifierHash: 'hash-reopen-test',
      body: 'First contact',
    })
    const { conversationId } = await incoming.json() as { conversationId: string }
    await postJSON(`/conversations/${conversationId}/claim`, { pubkey: 'vol-pub' })
    await patchJSON(`/conversations/${conversationId}`, { status: 'closed' })

    // New inbound message from same sender should create a NEW conversation
    // (closed conversations are not matched by handleIncoming)
    const reopen = await postJSON('/conversations/incoming', {
      channelType: 'sms',
      senderIdentifier: '+15555555555',
      senderIdentifierHash: 'hash-reopen-test',
      body: 'I need more help',
    })
    const reopenData = await reopen.json() as { conversationId: string; isNew: boolean }
    expect(reopenData.conversationId).not.toBe(conversationId)
    expect(reopenData.isNew).toBe(true)
  })

  it('tracks message delivery status', async () => {
    // Create conversation
    const incoming = await postJSON('/conversations/incoming', {
      channelType: 'sms',
      senderIdentifier: '+15554444444',
      senderIdentifierHash: 'hash-delivery-test',
      body: 'Test message',
    })
    const { conversationId } = await incoming.json() as { conversationId: string }

    // Add an outbound message with external ID
    const msgRes = await postJSON(`/conversations/${conversationId}/messages`, {
      direction: 'outbound',
      authorPubkey: 'vol-pub',
      encryptedContent: 'encrypted-outbound-content',
      readerEnvelopes: [],
      hasAttachments: false,
      externalId: 'ext-out-001',
    })
    const outMsg = await msgRes.json() as { id: string; status: string }
    expect(outMsg.status).toBe('pending')

    // Update delivery status: pending -> sent
    const sentRes = await postJSON('/messages/status', {
      externalId: 'ext-out-001',
      status: 'sent',
      timestamp: new Date().toISOString(),
    })
    const sentData = await sentRes.json() as { status: string }
    expect(sentData.status).toBe('sent')

    // Update delivery status: sent -> delivered
    const deliveredRes = await postJSON('/messages/status', {
      externalId: 'ext-out-001',
      status: 'delivered',
      timestamp: new Date().toISOString(),
    })
    const deliveredData = await deliveredRes.json() as { status: string }
    expect(deliveredData.status).toBe('delivered')

    // Verify the message has updated status
    const messages = await doJSON<{ messages: Array<{ id: string; status: string; deliveredAt: string }> }>(
      `/conversations/${conversationId}/messages`
    )
    const updatedMsg = messages.messages.find((m) => m.id === outMsg.id)
    expect(updatedMsg?.status).toBe('delivered')
    expect(updatedMsg?.deliveredAt).toBeDefined()
  })

  it('lists conversations by status', async () => {
    // Create three conversations
    await postJSON('/conversations/incoming', {
      channelType: 'sms',
      senderIdentifier: '+15551110001',
      senderIdentifierHash: 'hash-list-1',
      body: 'Waiting conv',
    })

    const c2 = await postJSON('/conversations/incoming', {
      channelType: 'sms',
      senderIdentifier: '+15551110002',
      senderIdentifierHash: 'hash-list-2',
      body: 'Active conv',
    })
    const c2Data = await c2.json() as { conversationId: string }
    await postJSON(`/conversations/${c2Data.conversationId}/claim`, { pubkey: 'vol-pub' })

    await postJSON('/conversations/incoming', {
      channelType: 'signal',
      senderIdentifier: '+15551110003',
      senderIdentifierHash: 'hash-list-3',
      body: 'Another waiting',
    })

    // List waiting conversations
    const waiting = await doJSON<{ conversations: Array<{ status: string }>; total: number }>(
      '/conversations?status=waiting'
    )
    expect(waiting.conversations.every((c) => c.status === 'waiting')).toBe(true)
    expect(waiting.total).toBe(2) // c1 and c3

    // List active conversations
    const active = await doJSON<{ conversations: Array<{ status: string }>; total: number }>(
      '/conversations?status=active'
    )
    expect(active.total).toBe(1)
    expect(active.conversations[0].status).toBe('active')
  })

  it('lists conversations assigned to volunteer', async () => {
    // Create two conversations, assign to different volunteers
    const c1 = await postJSON('/conversations/incoming', {
      channelType: 'sms',
      senderIdentifier: '+15552220001',
      senderIdentifierHash: 'hash-assigned-1',
      body: 'Conv for vol-A',
    })
    const c1Data = await c1.json() as { conversationId: string }
    await postJSON(`/conversations/${c1Data.conversationId}/claim`, { pubkey: 'vol-A' })

    const c2 = await postJSON('/conversations/incoming', {
      channelType: 'sms',
      senderIdentifier: '+15552220002',
      senderIdentifierHash: 'hash-assigned-2',
      body: 'Conv for vol-B',
    })
    const c2Data = await c2.json() as { conversationId: string }
    await postJSON(`/conversations/${c2Data.conversationId}/claim`, { pubkey: 'vol-B' })

    // List conversations for vol-A
    const volA = await doJSON<{ conversations: Array<{ assignedTo: string }>; total: number }>(
      '/conversations?assignedTo=vol-A'
    )
    expect(volA.total).toBe(1)
    expect(volA.conversations[0].assignedTo).toBe('vol-A')
  })

  it('manages volunteer load tracking', async () => {
    // Increment load
    const incRes = await postJSON('/load/increment', {
      pubkey: 'vol-pub-1',
      conversationId: 'conv-load-1',
    })
    expect(incRes.status).toBe(200)
    const incData = await incRes.json() as { load: number }
    expect(incData.load).toBe(1)

    // Increment again for different conversation
    await postJSON('/load/increment', {
      pubkey: 'vol-pub-1',
      conversationId: 'conv-load-2',
    })

    // Get load
    const loadData = await doJSON<{ pubkey: string; load: number; conversationIds: string[] }>(
      '/load/vol-pub-1'
    )
    expect(loadData.load).toBe(2)
    expect(loadData.conversationIds).toEqual(['conv-load-1', 'conv-load-2'])

    // Decrement
    await postJSON('/load/decrement', {
      pubkey: 'vol-pub-1',
      conversationId: 'conv-load-1',
    })

    const afterDec = await doJSON<{ load: number }>('/load/vol-pub-1')
    expect(afterDec.load).toBe(1)

    // Get all volunteer loads
    const allLoads = await doJSON<{ loads: Record<string, number> }>('/load')
    expect(allLoads.loads['vol-pub-1']).toBe(1)
  })

  it('returns conversation stats', async () => {
    // Create a few conversations in different states
    const c1 = await postJSON('/conversations/incoming', {
      channelType: 'sms',
      senderIdentifier: '+15553330001',
      senderIdentifierHash: 'hash-stats-1',
      body: 'Stats test 1',
    })
    const c1Data = await c1.json() as { conversationId: string }

    const c2 = await postJSON('/conversations/incoming', {
      channelType: 'sms',
      senderIdentifier: '+15553330002',
      senderIdentifierHash: 'hash-stats-2',
      body: 'Stats test 2',
    })
    const c2Data = await c2.json() as { conversationId: string }
    await postJSON(`/conversations/${c2Data.conversationId}/claim`, { pubkey: 'vol-pub' })

    const stats = await doJSON<{ waiting: number; active: number; total: number }>(
      '/conversations/stats'
    )
    expect(stats.waiting).toBe(1)
    expect(stats.active).toBe(1)
    expect(stats.total).toBe(2)
  })

  it('prevents claiming non-waiting conversation', async () => {
    // Create and claim a conversation
    const incoming = await postJSON('/conversations/incoming', {
      channelType: 'sms',
      senderIdentifier: '+15553340001',
      senderIdentifierHash: 'hash-double-claim',
      body: 'Double claim test',
    })
    const { conversationId } = await incoming.json() as { conversationId: string }
    await postJSON(`/conversations/${conversationId}/claim`, { pubkey: 'vol-1' })

    // Second claim should fail (status is now 'active', not 'waiting')
    const secondClaim = await postJSON(`/conversations/${conversationId}/claim`, {
      pubkey: 'vol-2',
    })
    expect(secondClaim.status).toBe(400)
    const errData = await secondClaim.json() as { error: string }
    expect(errData.error).toContain('not in waiting state')
  })
})
