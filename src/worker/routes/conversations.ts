import { Hono } from 'hono'
import type { AppEnv, EncryptedMessage } from '../types'
import { getDOs, getMessagingAdapter } from '../lib/do-access'
import { adminGuard } from '../middleware/admin-guard'
import { audit } from '../services/audit'

const conversations = new Hono<AppEnv>()

/**
 * GET /conversations — list conversations
 * Volunteers see only their assigned + waiting conversations.
 * Admins see all.
 */
conversations.get('/', async (c) => {
  const dos = getDOs(c.env)
  const pubkey = c.get('pubkey')
  const isAdmin = c.get('isAdmin')
  const status = c.req.query('status')
  const channel = c.req.query('channel')
  const page = c.req.query('page') || '1'
  const limit = c.req.query('limit') || '50'

  const params = new URLSearchParams()
  if (status) params.set('status', status)
  if (channel) params.set('channel', channel)
  params.set('page', page)
  params.set('limit', limit)

  // Volunteers only see their assigned conversations + waiting queue
  if (!isAdmin) {
    // Fetch assigned conversations
    params.set('assignedTo', pubkey)
    const assignedRes = await dos.conversations.fetch(
      new Request(`http://do/conversations?${params}`)
    )
    const assigned = await assignedRes.json() as { conversations: unknown[]; total: number }

    // Also fetch waiting conversations (available to claim)
    const waitingParams = new URLSearchParams(params)
    waitingParams.delete('assignedTo')
    waitingParams.set('status', 'waiting')
    const waitingRes = await dos.conversations.fetch(
      new Request(`http://do/conversations?${waitingParams}`)
    )
    const waiting = await waitingRes.json() as { conversations: unknown[]; total: number }

    return c.json({
      conversations: [...assigned.conversations, ...waiting.conversations],
      assignedCount: assigned.total,
      waitingCount: waiting.total,
    })
  }

  const res = await dos.conversations.fetch(new Request(`http://do/conversations?${params}`))
  return c.json(await res.json())
})

/**
 * GET /conversations/stats — conversation metrics
 */
conversations.get('/stats', async (c) => {
  const dos = getDOs(c.env)
  const res = await dos.conversations.fetch(new Request('http://do/conversations/stats'))
  return c.json(await res.json())
})

/**
 * GET /conversations/:id — get single conversation
 */
conversations.get('/:id', async (c) => {
  const dos = getDOs(c.env)
  const id = c.req.param('id')
  const pubkey = c.get('pubkey')
  const isAdmin = c.get('isAdmin')

  const res = await dos.conversations.fetch(new Request(`http://do/conversations/${id}`))
  if (!res.ok) return c.json({ error: 'Not found' }, 404)

  const conv = await res.json() as { assignedTo?: string; status: string }
  // Non-admins can only view their assigned or waiting conversations
  if (!isAdmin && conv.assignedTo !== pubkey && conv.status !== 'waiting') {
    return c.json({ error: 'Forbidden' }, 403)
  }

  return c.json(conv)
})

/**
 * GET /conversations/:id/messages — paginated messages
 */
conversations.get('/:id/messages', async (c) => {
  const dos = getDOs(c.env)
  const id = c.req.param('id')
  const pubkey = c.get('pubkey')
  const isAdmin = c.get('isAdmin')
  const page = c.req.query('page') || '1'
  const limit = c.req.query('limit') || '50'

  // Verify access
  const convRes = await dos.conversations.fetch(new Request(`http://do/conversations/${id}`))
  if (!convRes.ok) return c.json({ error: 'Not found' }, 404)
  const conv = await convRes.json() as { assignedTo?: string; status: string }
  if (!isAdmin && conv.assignedTo !== pubkey && conv.status !== 'waiting') {
    return c.json({ error: 'Forbidden' }, 403)
  }

  const res = await dos.conversations.fetch(
    new Request(`http://do/conversations/${id}/messages?page=${page}&limit=${limit}`)
  )
  return c.json(await res.json())
})

/**
 * POST /conversations/:id/messages — send outbound message
 * Body: { encryptedContent, ephemeralPubkey, encryptedContentAdmin, ephemeralPubkeyAdmin, plaintext? }
 * If plaintext is provided, it's sent via the messaging adapter then discarded.
 */
conversations.post('/:id/messages', async (c) => {
  const dos = getDOs(c.env)
  const id = c.req.param('id')
  const pubkey = c.get('pubkey')
  const isAdmin = c.get('isAdmin')

  // Verify access
  const convRes = await dos.conversations.fetch(new Request(`http://do/conversations/${id}`))
  if (!convRes.ok) return c.json({ error: 'Not found' }, 404)
  const conv = await convRes.json() as {
    assignedTo?: string
    channelType: string
    contactIdentifierHash: string
    status: string
  }
  if (!isAdmin && conv.assignedTo !== pubkey) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  const body = await c.req.json() as {
    encryptedContent: string
    ephemeralPubkey: string
    encryptedContentAdmin: string
    ephemeralPubkeyAdmin: string
    plaintextForSending?: string
  }

  // Store encrypted message
  const message: EncryptedMessage = {
    id: crypto.randomUUID(),
    conversationId: id,
    direction: 'outbound',
    authorPubkey: pubkey,
    encryptedContent: body.encryptedContent,
    ephemeralPubkey: body.ephemeralPubkey,
    encryptedContentAdmin: body.encryptedContentAdmin,
    ephemeralPubkeyAdmin: body.ephemeralPubkeyAdmin,
    hasAttachments: false,
    createdAt: new Date().toISOString(),
  }

  const storeRes = await dos.conversations.fetch(new Request(`http://do/conversations/${id}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message),
  }))

  if (!storeRes.ok) {
    return c.json({ error: 'Failed to store message' }, 500)
  }

  // Send via messaging adapter if plaintext provided (for external channels)
  if (body.plaintextForSending && conv.channelType !== 'web') {
    try {
      const adapter = await getMessagingAdapter(conv.channelType as 'sms' | 'whatsapp' | 'signal', dos)
      // We need the actual recipient identifier — for now this is a placeholder
      // The adapter sends the message externally
      await adapter.sendMessage({
        recipientIdentifier: conv.contactIdentifierHash, // TODO: store encrypted recipient for outbound
        body: body.plaintextForSending,
        conversationId: id,
      })
    } catch (err) {
      console.error(`[conversations] Failed to send outbound message via ${conv.channelType}:`, err)
      // Message is still stored even if external send fails
    }
  }

  // Broadcast new message via WebSocket hub
  await dos.calls.fetch(new Request('http://do/broadcast', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'message:new',
      conversationId: id,
      messageId: message.id,
      direction: 'outbound',
      authorPubkey: pubkey,
    }),
  }))

  c.executionCtx.waitUntil(
    audit(dos.records, 'messageSent', pubkey, {
      conversationId: id,
      channel: conv.channelType,
    })
  )

  return c.json(await storeRes.json())
})

/**
 * PATCH /conversations/:id — update conversation (assign, close, reopen)
 */
conversations.patch('/:id', async (c) => {
  const dos = getDOs(c.env)
  const id = c.req.param('id')
  const pubkey = c.get('pubkey')
  const isAdmin = c.get('isAdmin')
  const body = await c.req.json() as { status?: string; assignedTo?: string }

  // Only admin or assigned volunteer can update
  const convRes = await dos.conversations.fetch(new Request(`http://do/conversations/${id}`))
  if (!convRes.ok) return c.json({ error: 'Not found' }, 404)
  const conv = await convRes.json() as { assignedTo?: string }
  if (!isAdmin && conv.assignedTo !== pubkey) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  const res = await dos.conversations.fetch(new Request(`http://do/conversations/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }))

  // Broadcast status change
  const updated = await res.json()
  await dos.calls.fetch(new Request('http://do/broadcast', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: body.status === 'closed' ? 'conversation:closed' : 'conversation:assigned',
      conversationId: id,
      ...body,
    }),
  }))

  c.executionCtx.waitUntil(
    audit(dos.records, body.status === 'closed' ? 'conversationClosed' : 'conversationUpdated', pubkey, {
      conversationId: id,
    })
  )

  return c.json(updated)
})

/**
 * POST /conversations/:id/claim — volunteer claims a waiting conversation
 */
conversations.post('/:id/claim', async (c) => {
  const dos = getDOs(c.env)
  const id = c.req.param('id')
  const pubkey = c.get('pubkey')

  const res = await dos.conversations.fetch(new Request(`http://do/conversations/${id}/claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pubkey }),
  }))

  if (!res.ok) {
    const err = await res.text()
    return c.json({ error: err }, res.status as 400)
  }

  // Broadcast assignment
  await dos.calls.fetch(new Request('http://do/broadcast', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'conversation:assigned',
      conversationId: id,
      assignedTo: pubkey,
    }),
  }))

  c.executionCtx.waitUntil(
    audit(dos.records, 'conversationClaimed', pubkey, { conversationId: id })
  )

  return c.json(await res.json())
})

export default conversations
