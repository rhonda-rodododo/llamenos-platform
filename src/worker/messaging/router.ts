import { Hono } from 'hono'
import type { AppEnv } from '../types'
import type { MessagingChannelType, MessagingConfig, WhatsAppConfig } from '../../shared/types'
import type { MessagingAdapter, IncomingMessage } from './adapter'
import { getDOs, getScopedDOs } from '../lib/do-access'
import { getMessagingAdapter } from '../lib/do-access'
import { audit } from '../services/audit'

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
  const validChannels: MessagingChannelType[] = ['sms', 'whatsapp', 'signal']
  if (!validChannels.includes(channel)) {
    return c.json({ error: 'Unknown channel' }, 404)
  }

  // Hub-scoped routing: read hubId from query param, fall back to global
  const url = new URL(c.req.url)
  const hubId = url.searchParams.get('hub') || undefined
  const dos = getScopedDOs(c.env, hubId)

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

  // Forward to hub-scoped ConversationDO for processing
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
