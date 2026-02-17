import { Hono } from 'hono'
import type { AppEnv } from '../types'
import type { MessagingChannelType } from '../../shared/types'
import type { MessagingAdapter, IncomingMessage } from './adapter'
import { getDOs } from '../lib/do-access'
import { getMessagingAdapter } from '../lib/do-access'
import { encryptForPublicKey } from '../lib/crypto'
import { audit } from '../services/audit'

const messaging = new Hono<AppEnv>()

/**
 * Messaging webhook handler.
 * Each channel has its own webhook URL:
 *   /api/messaging/sms/webhook
 *   /api/messaging/whatsapp/webhook
 *   /api/messaging/signal/webhook
 *
 * No auth middleware — each adapter validates its own webhook signature.
 */
messaging.post('/:channel/webhook', async (c) => {
  const channel = c.req.param('channel') as MessagingChannelType
  const validChannels: MessagingChannelType[] = ['sms', 'whatsapp', 'signal']
  if (!validChannels.includes(channel)) {
    return c.json({ error: 'Unknown channel' }, 404)
  }

  const dos = getDOs(c.env)
  let adapter: MessagingAdapter
  try {
    adapter = await getMessagingAdapter(channel, dos)
  } catch {
    return c.json({ error: `${channel} channel is not configured` }, 404)
  }

  // Validate webhook signature
  const isValid = await adapter.validateWebhook(c.req.raw)
  if (!isValid) {
    console.error(`[messaging] Webhook signature FAILED for ${channel}`)
    return new Response('Forbidden', { status: 403 })
  }

  // Parse the incoming message
  let incoming: IncomingMessage
  try {
    incoming = await adapter.parseIncomingMessage(c.req.raw)
  } catch (err) {
    console.error(`[messaging] Failed to parse ${channel} webhook:`, err)
    return c.json({ error: 'Failed to parse message' }, 400)
  }

  // Forward to ConversationDO for processing
  const convRes = await dos.conversations.fetch(new Request('http://do/conversations/incoming', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(incoming),
  }))

  if (!convRes.ok) {
    console.error(`[messaging] ConversationDO rejected incoming message: ${convRes.status}`)
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

export default messaging
