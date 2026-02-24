import { Hono } from 'hono'
import type { AppEnv, Volunteer } from '../types'
import type { MessagingChannelType, MessagingConfig, WhatsAppConfig } from '../../shared/types'
import type { MessagingAdapter, IncomingMessage, MessageStatusUpdate } from './adapter'
import { getDOs, getScopedDOs } from '../lib/do-access'
import { getMessagingAdapter } from '../lib/do-access'
import { audit } from '../services/audit'
import { canClaimChannel } from '../../shared/permissions'

const messaging = new Hono<AppEnv>()

/**
 * WhatsApp webhook verification (GET).
 * Meta's Cloud API sends a GET request with hub.mode, hub.verify_token, hub.challenge
 * to verify webhook ownership during setup.
 */
messaging.get('/whatsapp/webhook', async (c) => {
  const mode = c.req.query('hub.mode')
  const token = c.req.query('hub.verify_token')
  const challenge = c.req.query('hub.challenge')

  if (mode !== 'subscribe' || !token || !challenge) {
    return c.text('Bad request', 400)
  }

  // Read WhatsApp config to check verify token
  const dos = getDOs(c.env)
  try {
    const res = await dos.settings.fetch(new Request('http://do/settings/messaging'))
    if (res.ok) {
      const config = await res.json() as MessagingConfig | null
      const waConfig = config?.whatsapp as WhatsAppConfig | null
      if (waConfig?.verifyToken && token === waConfig.verifyToken) {
        return c.text(challenge)
      }
    }
  } catch { /* fall through */ }

  return c.text('Forbidden', 403)
})

/**
 * RCS webhook verification (GET).
 * Google RBM sends a GET request to verify webhook ownership during setup.
 */
messaging.get('/rcs/webhook', async (c) => {
  // Google RBM webhook verification — just return 200
  return c.text('OK', 200)
})

/**
 * Messaging webhook handler.
 * Each channel has its own webhook URL:
 *   /api/messaging/sms/webhook?hub={hubId}
 *   /api/messaging/whatsapp/webhook?hub={hubId}
 *   /api/messaging/signal/webhook?hub={hubId}
 *
 * No auth middleware — each adapter validates its own webhook signature.
 */
messaging.post('/:channel/webhook', async (c) => {
  const channel = c.req.param('channel') as MessagingChannelType
  const validChannels: MessagingChannelType[] = ['sms', 'whatsapp', 'signal', 'rcs']
  if (!validChannels.includes(channel)) {
    return c.json({ error: 'Unknown channel' }, 404)
  }

  // Hub-scoped routing: read hubId from query param, fall back to global
  const url = new URL(c.req.url)
  const hubId = url.searchParams.get('hub') || undefined
  const dos = getScopedDOs(c.env, hubId)

  let adapter: MessagingAdapter
  try {
    adapter = await getMessagingAdapter(channel, dos, c.env.HMAC_SECRET)
  } catch {
    return c.json({ error: `${channel} channel is not configured` }, 404)
  }

  // Validate webhook signature
  const isValid = await adapter.validateWebhook(c.req.raw)
  if (!isValid) {
    console.error(`[messaging] Webhook signature FAILED for ${channel}`)
    return new Response('Forbidden', { status: 403 })
  }

  // Try to parse as status update first (if adapter supports it)
  if (adapter.parseStatusWebhook) {
    try {
      const statusUpdate = await adapter.parseStatusWebhook(c.req.raw)
      if (statusUpdate) {
        // This is a status update, not a new message
        const statusRes = await dos.conversations.fetch(new Request('http://do/messages/status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(statusUpdate),
        }))

        if (statusRes.ok) {
          // Broadcast status update via WebSocket
          const result = await statusRes.json() as { conversationId?: string; messageId?: string }
          if (result.conversationId && result.messageId) {
            c.executionCtx.waitUntil(
              dos.calls.fetch(new Request('http://do/broadcast', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  type: 'message:status',
                  conversationId: result.conversationId,
                  messageId: result.messageId,
                  status: statusUpdate.status,
                  timestamp: statusUpdate.timestamp,
                }),
              }))
            )
          }
        }

        return c.json({ ok: true })
      }
    } catch {
      // Not a status update, continue to parse as message
    }
  }

  // Parse the incoming message
  let incoming: IncomingMessage
  try {
    incoming = await adapter.parseIncomingMessage(c.req.raw)
  } catch (err) {
    console.error(`[messaging] Failed to parse ${channel} webhook:`, err)
    return c.json({ error: 'Failed to parse message' }, 400)
  }

  // Keyword interception for blast subscribe/unsubscribe
  if (incoming.body) {
    const normalizedBody = incoming.body.trim().toUpperCase()
    // STOP is always recognized (TCPA compliance)
    if (normalizedBody === 'STOP') {
      await dos.conversations.fetch(new Request('http://do/subscribers/keyword', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: incoming.senderIdentifier,
          identifierHash: incoming.senderIdentifierHash,
          keyword: 'STOP',
          channel: incoming.channelType,
        }),
      }))
      // Still forward to conversation for logging
    } else {
      // Check if it matches the subscribe keyword
      try {
        const settingsRes = await dos.conversations.fetch(new Request('http://do/blast-settings'))
        if (settingsRes.ok) {
          const settings = await settingsRes.json() as { subscribeKeyword: string }
          if (normalizedBody === settings.subscribeKeyword.toUpperCase()) {
            await dos.conversations.fetch(new Request('http://do/subscribers/keyword', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                identifier: incoming.senderIdentifier,
                identifierHash: incoming.senderIdentifierHash,
                keyword: normalizedBody,
                channel: incoming.channelType,
              }),
            }))
          }
        }
      } catch { /* blast settings not configured — ignore */ }
    }
  }

  // Forward to hub-scoped ConversationDO for processing
  const convRes = await dos.conversations.fetch(new Request('http://do/conversations/incoming', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(incoming),
  }))

  if (!convRes.ok) {
    console.error(`[messaging] ConversationDO rejected incoming message: ${convRes.status}`)
  }

  // Check if this is a new conversation that needs auto-assignment
  const convResult = await convRes.json() as {
    conversationId: string
    messageId: string
    isNew: boolean
    status: string
  }

  // Auto-assignment for new conversations
  if (convResult.isNew && convResult.status === 'waiting') {
    c.executionCtx.waitUntil(
      tryAutoAssign(dos, convResult.conversationId, channel, c.env.ADMIN_PUBKEY)
    )
  }

  // Audit the incoming message (no PII — only hashed identifier)
  c.executionCtx.waitUntil(
    audit(dos.records, 'messageReceived', 'system', {
      channel,
      senderHash: incoming.senderIdentifierHash,
    })
  )

  // Return 200 to acknowledge webhook (providers expect fast acknowledgment)
  return c.json({ ok: true })
})

/**
 * Try to auto-assign a new conversation to an available volunteer.
 * This runs in background via executionCtx.waitUntil() to not delay webhook response.
 */
async function tryAutoAssign(
  dos: ReturnType<typeof getScopedDOs>,
  conversationId: string,
  channelType: MessagingChannelType,
  adminPubkey: string
): Promise<void> {
  try {
    // 1. Check if auto-assign is enabled
    const settingsRes = await dos.settings.fetch(new Request('http://do/settings/messaging'))
    if (!settingsRes.ok) return

    const messagingConfig = await settingsRes.json() as MessagingConfig | null
    if (!messagingConfig?.autoAssign) return

    const maxConcurrent = messagingConfig.maxConcurrentPerVolunteer || 3

    // 2. Get current on-shift volunteers
    const shiftRes = await dos.shifts.fetch(new Request('http://do/current-volunteers'))
    if (!shiftRes.ok) return

    const { pubkeys: onShiftPubkeys } = await shiftRes.json() as { pubkeys: string[] }
    if (onShiftPubkeys.length === 0) return

    // 3. Get volunteer details to filter by channel capability
    const volRes = await dos.identity.fetch(new Request('http://do/volunteers'))
    if (!volRes.ok) return

    const { volunteers } = await volRes.json() as { volunteers: Volunteer[] }
    const onShiftVolunteers = volunteers.filter(v =>
      onShiftPubkeys.includes(v.pubkey) &&
      v.active &&
      !v.onBreak &&
      v.messagingEnabled !== false
    )

    // Filter by channel capability
    const eligibleVolunteers = onShiftVolunteers.filter(v => {
      // If no channels specified, volunteer can handle all
      if (!v.supportedMessagingChannels || v.supportedMessagingChannels.length === 0) {
        return true
      }
      return v.supportedMessagingChannels.includes(channelType)
    })

    if (eligibleVolunteers.length === 0) return

    // 4. Get volunteer load counts
    const loadRes = await dos.conversations.fetch(new Request('http://do/load'))
    const { loads } = await loadRes.json() as { loads: Record<string, number> }

    // 5. Find least-loaded volunteer under max capacity
    let bestCandidate: string | null = null
    let lowestLoad = Infinity

    for (const vol of eligibleVolunteers) {
      const currentLoad = loads[vol.pubkey] || 0
      if (currentLoad < maxConcurrent && currentLoad < lowestLoad) {
        lowestLoad = currentLoad
        bestCandidate = vol.pubkey
      }
    }

    if (!bestCandidate) return // All volunteers at capacity

    // 6. Auto-assign the conversation
    const assignRes = await dos.conversations.fetch(
      new Request(`http://do/conversations/${conversationId}/auto-assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pubkey: bestCandidate, adminPubkey }),
      })
    )

    if (assignRes.ok) {
      // Broadcast assignment via WebSocket
      await dos.calls.fetch(new Request('http://do/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'conversation:assigned',
          conversationId,
          assignedTo: bestCandidate,
          autoAssigned: true,
        }),
      }))

      console.log(`[messaging] Auto-assigned conversation ${conversationId} to ${bestCandidate.slice(0, 8)}`)
    }
  } catch (err) {
    console.error('[messaging] Auto-assignment failed:', err)
  }
}

export default messaging
