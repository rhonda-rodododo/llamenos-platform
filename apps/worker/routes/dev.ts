import { Hono } from 'hono'
import type { AppEnv } from '../types'
import type { MessagingChannelType } from '@shared/types'
import { getDOs } from '../lib/do-access'
import { hashPhone } from '../lib/crypto'
import { publishNostrEvent } from '../lib/nostr-events'
import { KIND_MESSAGE_NEW } from '@shared/nostr-events'

const dev = new Hono<AppEnv>()

/**
 * Secondary gate: if DEV_RESET_SECRET is set, require X-Test-Secret header.
 * Protects against accidental ENVIRONMENT=development in production.
 */
function checkResetSecret(c: { env: { DEV_RESET_SECRET?: string; E2E_TEST_SECRET?: string }; req: { header(name: string): string | undefined } }): boolean {
  const secret = c.env.DEV_RESET_SECRET || c.env.E2E_TEST_SECRET
  if (!secret) return false // No secret configured — deny by default
  return c.req.header('X-Test-Secret') === secret
}

dev.post('/test-reset', async (c) => {
  // Full reset: development only — too destructive for staging
  if (c.env.ENVIRONMENT !== 'development') {
    return c.json({ error: 'Not Found' }, 404)
  }
  if (!checkResetSecret(c)) {
    return c.json({ error: 'Forbidden' }, 403)
  }
  const dos = getDOs(c.env)
  await dos.identity.fetch(new Request('http://do/reset', { method: 'POST' }))
  await dos.settings.fetch(new Request('http://do/reset', { method: 'POST' }))
  await dos.records.fetch(new Request('http://do/reset', { method: 'POST' }))
  await dos.shifts.fetch(new Request('http://do/reset', { method: 'POST' }))
  await dos.calls.fetch(new Request('http://do/reset', { method: 'POST' }))
  await dos.conversations.fetch(new Request('http://do/reset', { method: 'POST' }))
  await dos.contactDirectory.fetch(new Request('http://do/reset', { method: 'POST' }))
  await dos.caseManager.fetch(new Request('http://do/reset', { method: 'POST' }))
  return c.json({ ok: true })
})

// Reset to a truly fresh state — no admin, no ADMIN_PUBKEY effect
// Used for testing in-browser admin bootstrap
dev.post('/test-reset-no-admin', async (c) => {
  // Full reset without admin: development only
  if (c.env.ENVIRONMENT !== 'development') {
    return c.json({ error: 'Not Found' }, 404)
  }
  if (!checkResetSecret(c)) {
    return c.json({ error: 'Forbidden' }, 403)
  }
  const dos = getDOs(c.env)
  // Reset all DOs
  await dos.identity.fetch(new Request('http://do/reset', { method: 'POST' }))
  await dos.settings.fetch(new Request('http://do/reset', { method: 'POST' }))
  await dos.records.fetch(new Request('http://do/reset', { method: 'POST' }))
  await dos.shifts.fetch(new Request('http://do/reset', { method: 'POST' }))
  await dos.calls.fetch(new Request('http://do/reset', { method: 'POST' }))
  await dos.conversations.fetch(new Request('http://do/reset', { method: 'POST' }))
  await dos.contactDirectory.fetch(new Request('http://do/reset', { method: 'POST' }))
  await dos.caseManager.fetch(new Request('http://do/reset', { method: 'POST' }))
  // Tell IdentityDO to skip admin re-creation from ADMIN_PUBKEY on next ensureInit().
  // Without this, the next fetch to IdentityDO calls ensureInit() which re-seeds
  // the admin from the ADMIN_PUBKEY env var, defeating the "no admin" state.
  await dos.identity.fetch(new Request('http://do/test-skip-admin-seed', { method: 'POST' }))
  // Delete the admin volunteer that the reset's ensureInit() already created
  if (c.env.ADMIN_PUBKEY) {
    await dos.identity.fetch(new Request(`http://do/volunteers/${c.env.ADMIN_PUBKEY}`, { method: 'DELETE' }))
  }
  return c.json({ ok: true })
})

// Light reset: only clears records, calls, conversations, and shifts
// Preserves identity (admin account) and settings (setup state)
// Used by live telephony E2E tests against staging
dev.post('/test-reset-records', async (c) => {
  const isDev = c.env.ENVIRONMENT === 'development'
  const isStaging = c.env.ENVIRONMENT === 'staging'
    && c.env.E2E_TEST_SECRET
    && c.req.header('X-Test-Secret') === c.env.E2E_TEST_SECRET
  if (!isDev && !isStaging) {
    return c.json({ error: 'Not Found' }, 404)
  }
  if (isDev && !checkResetSecret(c)) {
    return c.json({ error: 'Forbidden' }, 403)
  }
  const dos = getDOs(c.env)
  await dos.records.fetch(new Request('http://do/reset', { method: 'POST' }))
  await dos.shifts.fetch(new Request('http://do/reset', { method: 'POST' }))
  await dos.calls.fetch(new Request('http://do/reset', { method: 'POST' }))
  await dos.conversations.fetch(new Request('http://do/reset', { method: 'POST' }))
  await dos.contactDirectory.fetch(new Request('http://do/reset', { method: 'POST' }))
  await dos.caseManager.fetch(new Request('http://do/reset', { method: 'POST' }))
  return c.json({ ok: true })
})

// ─── Simulation Endpoints (E2E test helpers) ───────────────────────────────
// These bypass TelephonyAdapter entirely — they proxy directly to DO internal routes.
// Gated by ENVIRONMENT=development + DEV_RESET_SECRET / E2E_TEST_SECRET.

/** Request/response types for simulation endpoints */
interface SimulateIncomingCallBody {
  callerNumber: string
  language?: string
  hubId?: string
}

interface SimulateAnswerCallBody {
  callId: string
  pubkey: string
}

interface SimulateEndCallBody {
  callId: string
}

interface SimulateVoicemailBody {
  callId: string
}

interface SimulateIncomingMessageBody {
  senderNumber: string
  body: string
  channel?: MessagingChannelType
}

interface SimulateDeliveryStatusBody {
  conversationId: string
  messageId: string
  status: 'delivered' | 'read' | 'failed'
}

/**
 * Guard: require ENVIRONMENT=development + valid test secret.
 * Returns an error Response if denied, or null if allowed.
 */
function simulationGuard(c: {
  env: { ENVIRONMENT: string; DEV_RESET_SECRET?: string; E2E_TEST_SECRET?: string }
  req: { header(name: string): string | undefined }
}): Response | null {
  if (c.env.ENVIRONMENT !== 'development') {
    return Response.json({ error: 'Not Found' }, { status: 404 })
  }
  if (!checkResetSecret(c)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }
  return null
}

// 1. Simulate incoming call
dev.post('/test-simulate/incoming-call', async (c) => {
  const denied = simulationGuard(c)
  if (denied) return denied

  const body = await c.req.json() as SimulateIncomingCallBody
  if (!body.callerNumber) {
    return c.json({ error: 'callerNumber is required' }, 400)
  }

  const callId = crypto.randomUUID()
  const dos = getDOs(c.env)

  // Check if the caller is banned (mirrors real telephony flow)
  const hashedPhone = hashPhone(body.callerNumber, c.env.HMAC_SECRET)
  const banCheckRes = await dos.records.fetch(new Request(`http://do/bans/check/${encodeURIComponent(hashedPhone)}`))
  if (banCheckRes.ok) {
    const { banned } = await banCheckRes.json() as { banned: boolean }
    if (banned) {
      return c.json({ error: 'Caller is banned', banned: true }, 403)
    }
  }

  // Get on-shift volunteer pubkeys for the call record
  let volunteerPubkeys: string[] = []
  try {
    const shiftRes = await dos.shifts.fetch(new Request('http://do/current-volunteers'))
    if (shiftRes.ok) {
      const data = await shiftRes.json() as { volunteers?: string[] }
      volunteerPubkeys = Array.isArray(data.volunteers) ? data.volunteers : []
    }
  } catch {
    // Shifts not configured — proceed with empty list
  }

  const res = await dos.calls.fetch(new Request('http://do/calls/incoming', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      callSid: callId,
      callerNumber: body.callerNumber,
      volunteerPubkeys,
    }),
  }))

  if (!res.ok) {
    const text = await res.text()
    return c.json({ error: 'CallRouterDO rejected incoming call', detail: text }, 500)
  }

  return c.json({ ok: true, callId, status: 'ringing' })
})

// 2. Simulate answering a call
dev.post('/test-simulate/answer-call', async (c) => {
  const denied = simulationGuard(c)
  if (denied) return denied

  const body = await c.req.json() as SimulateAnswerCallBody
  if (!body.callId || !body.pubkey) {
    return c.json({ error: 'callId and pubkey are required' }, 400)
  }

  const dos = getDOs(c.env)
  const res = await dos.calls.fetch(new Request(`http://do/calls/${body.callId}/answer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pubkey: body.pubkey }),
  }))

  if (!res.ok) {
    const text = await res.text()
    return c.json({ error: 'CallRouterDO rejected answer', detail: text }, res.status as 400 | 404 | 500)
  }

  return c.json({ ok: true, callId: body.callId, status: 'in-progress' })
})

// 3. Simulate ending a call
dev.post('/test-simulate/end-call', async (c) => {
  const denied = simulationGuard(c)
  if (denied) return denied

  const body = await c.req.json() as SimulateEndCallBody
  if (!body.callId) {
    return c.json({ error: 'callId is required' }, 400)
  }

  const dos = getDOs(c.env)
  const res = await dos.calls.fetch(new Request(`http://do/calls/${body.callId}/end`, {
    method: 'POST',
  }))

  if (!res.ok) {
    const text = await res.text()
    return c.json({ error: 'CallRouterDO rejected end', detail: text }, res.status as 400 | 404 | 500)
  }

  return c.json({ ok: true, callId: body.callId, status: 'completed' })
})

// 4. Simulate voicemail
dev.post('/test-simulate/voicemail', async (c) => {
  const denied = simulationGuard(c)
  if (denied) return denied

  const body = await c.req.json() as SimulateVoicemailBody
  if (!body.callId) {
    return c.json({ error: 'callId is required' }, 400)
  }

  const dos = getDOs(c.env)
  const res = await dos.calls.fetch(new Request(`http://do/calls/${body.callId}/voicemail`, {
    method: 'POST',
  }))

  if (!res.ok) {
    const text = await res.text()
    return c.json({ error: 'CallRouterDO rejected voicemail', detail: text }, res.status as 400 | 404 | 500)
  }

  return c.json({ ok: true, callId: body.callId, status: 'unanswered' })
})

// 5. Simulate incoming message
dev.post('/test-simulate/incoming-message', async (c) => {
  const denied = simulationGuard(c)
  if (denied) return denied

  const body = await c.req.json() as SimulateIncomingMessageBody
  if (!body.senderNumber || !body.body) {
    return c.json({ error: 'senderNumber and body are required' }, 400)
  }

  const channel: MessagingChannelType = body.channel || 'sms'
  const senderHash = hashPhone(body.senderNumber, c.env.HMAC_SECRET)

  const dos = getDOs(c.env)
  const res = await dos.conversations.fetch(new Request('http://do/conversations/incoming', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channelType: channel,
      externalId: crypto.randomUUID(),
      senderIdentifier: body.senderNumber,
      senderIdentifierHash: senderHash,
      body: body.body,
      timestamp: new Date().toISOString(),
    }),
  }))

  if (!res.ok) {
    const text = await res.text()
    return c.json({ error: 'ConversationDO rejected incoming message', detail: text }, 500)
  }

  const result = await res.json() as { conversationId: string; messageId: string }

  // Publish Nostr event (mirrors real messaging webhook flow)
  publishNostrEvent(c.env, KIND_MESSAGE_NEW, {
    type: 'message:new',
    conversationId: result.conversationId,
    messageId: result.messageId,
    channelType: channel,
  }).catch(() => {})

  return c.json({ ok: true, conversationId: result.conversationId, messageId: result.messageId })
})

// 6. Simulate delivery status update
dev.post('/test-simulate/delivery-status', async (c) => {
  const denied = simulationGuard(c)
  if (denied) return denied

  const body = await c.req.json() as SimulateDeliveryStatusBody
  if (!body.conversationId || !body.messageId || !body.status) {
    return c.json({ error: 'conversationId, messageId, and status are required' }, 400)
  }

  const dos = getDOs(c.env)

  // Delivery status updates use the external ID mapping in ConversationDO.
  // For simulation, we fetch the message to find its externalId, then call the status endpoint.
  const messagesRes = await dos.conversations.fetch(
    new Request(`http://do/conversations/${body.conversationId}/messages?limit=200`)
  )

  if (!messagesRes.ok) {
    return c.json({ error: 'Failed to fetch conversation messages' }, 500)
  }

  const { messages } = await messagesRes.json() as {
    messages: Array<{ id: string; externalId?: string }>
  }
  const message = messages.find(m => m.id === body.messageId)
  if (!message) {
    return c.json({ error: 'Message not found in conversation' }, 404)
  }

  if (!message.externalId) {
    return c.json({ error: 'Message has no externalId — only outbound messages with provider IDs support delivery status' }, 400)
  }

  const statusRes = await dos.conversations.fetch(new Request('http://do/messages/status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      externalId: message.externalId,
      status: body.status,
      timestamp: new Date().toISOString(),
      failureReason: body.status === 'failed' ? 'Simulated failure' : undefined,
    }),
  }))

  if (!statusRes.ok) {
    const text = await statusRes.text()
    return c.json({ error: 'ConversationDO rejected status update', detail: text }, 500)
  }

  return c.json({ ok: true })
})

export default dev
