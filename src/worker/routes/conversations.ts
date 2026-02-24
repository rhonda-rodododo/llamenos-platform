import { Hono } from 'hono'
import type { AppEnv, EncryptedMessage } from '../types'
import type { MessagingChannelType } from '../../shared/types'
import { getScopedDOs, getMessagingAdapter } from '../lib/do-access'
import { checkPermission } from '../middleware/permission-guard'
import { audit } from '../services/audit'
import { canClaimChannel, getClaimableChannels } from '../../shared/permissions'

const conversations = new Hono<AppEnv>()

/**
 * GET /conversations — list conversations
 * Users with conversations:read-all see everything.
 * Others see only their assigned + waiting conversations (filtered by claimable channels).
 */
conversations.get('/', async (c) => {
  const dos = getScopedDOs(c.env, c.get('hubId'))
  const pubkey = c.get('pubkey')
  const permissions = c.get('permissions')
  const volunteer = c.get('volunteer')
  const canReadAll = checkPermission(permissions, 'conversations:read-all')
  const status = c.req.query('status')
  const channel = c.req.query('channel')
  const page = c.req.query('page') || '1'
  const limit = c.req.query('limit') || '50'

  const params = new URLSearchParams()
  if (status) params.set('status', status)
  if (channel) params.set('channel', channel)
  params.set('page', page)
  params.set('limit', limit)

  // Users without read-all only see their assigned conversations + waiting queue
  if (!canReadAll) {
    // Fetch assigned conversations
    params.set('assignedTo', pubkey)
    const assignedRes = await dos.conversations.fetch(
      new Request(`http://do/conversations?${params}`)
    )
    const assigned = await assignedRes.json() as { conversations: Array<{ channelType: string }>; total: number }

    // Also fetch waiting conversations (available to claim)
    const waitingParams = new URLSearchParams(params)
    waitingParams.delete('assignedTo')
    waitingParams.set('status', 'waiting')
    const waitingRes = await dos.conversations.fetch(
      new Request(`http://do/conversations?${waitingParams}`)
    )
    const waiting = await waitingRes.json() as { conversations: Array<{ channelType: string }>; total: number }

    // Filter waiting conversations by channels the volunteer can claim
    const claimableChannels = getClaimableChannels(permissions)
    const volunteerChannels = volunteer.supportedMessagingChannels

    let filteredWaiting = waiting.conversations
    // Filter by permission-based claimable channels
    if (claimableChannels.length > 0) {
      filteredWaiting = filteredWaiting.filter(conv =>
        claimableChannels.includes(conv.channelType)
      )
    }
    // Also filter by volunteer's configured supported channels (if set)
    if (volunteerChannels && volunteerChannels.length > 0) {
      filteredWaiting = filteredWaiting.filter(conv =>
        volunteerChannels.includes(conv.channelType as MessagingChannelType)
      )
    }
    // Hide all waiting if messaging is disabled for this volunteer
    if (volunteer.messagingEnabled === false) {
      filteredWaiting = []
    }

    return c.json({
      conversations: [...assigned.conversations, ...filteredWaiting],
      assignedCount: assigned.total,
      waitingCount: filteredWaiting.length,
      claimableChannels,
    })
  }

  const res = await dos.conversations.fetch(new Request(`http://do/conversations?${params}`))
  return c.json(await res.json())
})

/**
 * GET /conversations/stats — conversation metrics
 */
conversations.get('/stats', async (c) => {
  const dos = getScopedDOs(c.env, c.get('hubId'))
  const res = await dos.conversations.fetch(new Request('http://do/conversations/stats'))
  return c.json(await res.json())
})

/**
 * GET /conversations/load — get volunteer load counts (active conversations per volunteer)
 * Admin only — used for reassignment UI
 */
conversations.get('/load', async (c) => {
  const permissions = c.get('permissions')
  const canReadAll = checkPermission(permissions, 'conversations:read-all')
  if (!canReadAll) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  const dos = getScopedDOs(c.env, c.get('hubId'))
  const res = await dos.conversations.fetch(new Request('http://do/load'))
  return c.json(await res.json())
})

/**
 * GET /conversations/:id — get single conversation
 */
conversations.get('/:id', async (c) => {
  const dos = getScopedDOs(c.env, c.get('hubId'))
  const id = c.req.param('id')
  const pubkey = c.get('pubkey')
  const permissions = c.get('permissions')
  const canReadAll = checkPermission(permissions, 'conversations:read-all')

  const res = await dos.conversations.fetch(new Request(`http://do/conversations/${id}`))
  if (!res.ok) return c.json({ error: 'Not found' }, 404)

  const conv = await res.json() as { assignedTo?: string; status: string }
  // Non-admins can only view their assigned or waiting conversations
  if (!canReadAll && conv.assignedTo !== pubkey && conv.status !== 'waiting') {
    return c.json({ error: 'Forbidden' }, 403)
  }

  return c.json(conv)
})

/**
 * GET /conversations/:id/messages — paginated messages
 */
conversations.get('/:id/messages', async (c) => {
  const dos = getScopedDOs(c.env, c.get('hubId'))
  const id = c.req.param('id')
  const pubkey = c.get('pubkey')
  const permissions = c.get('permissions')
  const canReadAll = checkPermission(permissions, 'conversations:read-all')
  const page = c.req.query('page') || '1'
  const limit = c.req.query('limit') || '50'

  // Verify access
  const convRes = await dos.conversations.fetch(new Request(`http://do/conversations/${id}`))
  if (!convRes.ok) return c.json({ error: 'Not found' }, 404)
  const conv = await convRes.json() as { assignedTo?: string; status: string }
  if (!canReadAll && conv.assignedTo !== pubkey && conv.status !== 'waiting') {
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
  const dos = getScopedDOs(c.env, c.get('hubId'))
  const id = c.req.param('id')
  const pubkey = c.get('pubkey')
  const permissions = c.get('permissions')
  const canSendAny = checkPermission(permissions, 'conversations:send-any')

  // Verify access
  const convRes = await dos.conversations.fetch(new Request(`http://do/conversations/${id}`))
  if (!convRes.ok) return c.json({ error: 'Not found' }, 404)
  const conv = await convRes.json() as {
    assignedTo?: string
    channelType: string
    contactIdentifierHash: string
    status: string
  }
  if (!canSendAny && conv.assignedTo !== pubkey) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  const body = await c.req.json() as {
    encryptedContent: string
    ephemeralPubkey: string
    encryptedContentAdmin: string
    ephemeralPubkeyAdmin: string
    plaintextForSending?: string
  }

  // Build the message with initial pending status
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
    status: 'pending',
  }

  // Send via messaging adapter first to get external ID (for external channels)
  let sendFailed = false
  if (body.plaintextForSending && conv.channelType !== 'web') {
    try {
      const adapter = await getMessagingAdapter(conv.channelType as 'sms' | 'whatsapp' | 'signal', dos, c.env.HMAC_SECRET)
      // Fetch the actual contact identifier from ConversationDO (server-side only)
      const contactRes = await dos.conversations.fetch(new Request(`http://do/conversations/${id}/contact`))
      if (!contactRes.ok) throw new Error('Contact identifier not available for outbound')
      const { identifier } = await contactRes.json() as { identifier: string }
      const result = await adapter.sendMessage({
        recipientIdentifier: identifier,
        body: body.plaintextForSending,
        conversationId: id,
      })

      if (result.success && result.externalId) {
        message.externalId = result.externalId
        message.status = 'sent'
      } else if (!result.success) {
        message.status = 'failed'
        message.failureReason = result.error
        sendFailed = true
      }
    } catch (err) {
      console.error(`[conversations] Failed to send outbound message via ${conv.channelType}:`, err)
      message.status = 'failed'
      message.failureReason = err instanceof Error ? err.message : 'Unknown error'
      sendFailed = true
    }
  } else if (conv.channelType === 'web') {
    // Web channel doesn't need external sending
    message.status = 'delivered'
  }

  // Store the message (with external ID and status)
  const storeRes = await dos.conversations.fetch(new Request(`http://do/conversations/${id}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message),
  }))

  if (!storeRes.ok) {
    return c.json({ error: 'Failed to store message' }, 500)
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
  const dos = getScopedDOs(c.env, c.get('hubId'))
  const id = c.req.param('id')
  const pubkey = c.get('pubkey')
  const permissions = c.get('permissions')
  const canUpdate = checkPermission(permissions, 'conversations:update')
  const body = await c.req.json() as { status?: string; assignedTo?: string }

  // Only users with update permission or assigned volunteer can update
  const convRes = await dos.conversations.fetch(new Request(`http://do/conversations/${id}`))
  if (!convRes.ok) return c.json({ error: 'Not found' }, 404)
  const conv = await convRes.json() as { assignedTo?: string }
  if (!canUpdate && conv.assignedTo !== pubkey) {
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
 * Channel-specific permission check: volunteer must have claim permission for the conversation's channel
 */
conversations.post('/:id/claim', async (c) => {
  const dos = getScopedDOs(c.env, c.get('hubId'))
  const id = c.req.param('id')
  const pubkey = c.get('pubkey')
  const permissions = c.get('permissions')
  const volunteer = c.get('volunteer')

  // Fetch conversation to check channel type
  const convRes = await dos.conversations.fetch(new Request(`http://do/conversations/${id}`))
  if (!convRes.ok) return c.json({ error: 'Not found' }, 404)
  const conv = await convRes.json() as { channelType: string; status: string }

  // Check channel-specific claim permission
  if (!canClaimChannel(permissions, conv.channelType)) {
    return c.json({
      error: 'No permission to claim this channel type',
      channelType: conv.channelType,
      allowedChannels: getClaimableChannels(permissions),
    }, 403)
  }

  // Check volunteer's supported messaging channels (if defined)
  if (volunteer.supportedMessagingChannels && volunteer.supportedMessagingChannels.length > 0) {
    if (!volunteer.supportedMessagingChannels.includes(conv.channelType as MessagingChannelType)) {
      return c.json({
        error: 'Volunteer not configured for this channel',
        channelType: conv.channelType,
        supportedChannels: volunteer.supportedMessagingChannels,
      }, 403)
    }
  }

  // Check if volunteer has messaging enabled (defaults to true for backwards compatibility)
  if (volunteer.messagingEnabled === false) {
    return c.json({ error: 'Messaging not enabled for this volunteer' }, 403)
  }

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
    audit(dos.records, 'conversationClaimed', pubkey, {
      conversationId: id,
      channelType: conv.channelType,
    })
  )

  return c.json(await res.json())
})

export default conversations
