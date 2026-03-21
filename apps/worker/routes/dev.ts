import { Hono } from 'hono'
import type { AppEnv } from '../types'
import type { Hub, MessagingChannelType } from '@shared/types'
import { hashPhone } from '../lib/crypto'
import { publishNostrEvent } from '../lib/nostr-events'
import { KIND_CALL_RING, KIND_CALL_UPDATE, KIND_CALL_VOICEMAIL, KIND_MESSAGE_NEW, KIND_PRESENCE_UPDATE } from '@shared/nostr-events'
import { nip19 } from 'nostr-tools'
import { getTestPushLog, clearTestPushLog } from '../lib/push-dispatch'

/**
 * Decode a pubkey that may be in npub1... bech32 format or raw hex.
 * Returns the hex pubkey string.
 */
function decodePubkey(input: string): string {
  if (input.startsWith('npub1')) {
    const decoded = nip19.decode(input)
    if (decoded.type === 'npub') return decoded.data
    throw new Error(`Invalid npub: decoded type was ${decoded.type}`)
  }
  return input
}

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
  const services = c.get('services')
  const env = { DEMO_MODE: c.env.DEMO_MODE, ENVIRONMENT: c.env.ENVIRONMENT }
  const adminPubkey = c.env.ADMIN_PUBKEY
  const demoMode = c.env.DEMO_MODE === 'true'
  await services.audit.reset()
  await services.identity.reset(true, c.env.ENVIRONMENT)
  // Re-seed admin immediately — minimizes the window where hasAdmin()=false
  // (concurrent browser requests between reset() and the later ensureInit() would
  // see needsBootstrap=true, causing flaky AdminBootstrap to appear in E2E tests)
  if (adminPubkey) {
    await services.identity.ensureInit(adminPubkey, demoMode)
  }
  await services.settings.reset(env)
  await services.records.reset()
  await services.shifts.reset('')
  await services.calls.reset('')
  await services.conversations.reset()
  await services.blasts.reset()
  await services.contacts.reset(env)
  await services.cases.reset(env)
  await services.settings.ensureInit()
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
  const services = c.get('services')
  const env = { DEMO_MODE: c.env.DEMO_MODE, ENVIRONMENT: c.env.ENVIRONMENT }
  // Reset all services
  await services.audit.reset()
  await services.identity.reset(true, c.env.ENVIRONMENT)
  await services.settings.reset(env)
  await services.records.reset()
  await services.shifts.reset('')
  await services.calls.reset('')
  await services.conversations.reset()
  await services.blasts.reset()
  await services.contacts.reset(env)
  await services.cases.reset(env)
  // Tell IdentityService to skip admin re-creation from ADMIN_PUBKEY on next ensureInit().
  await services.identity.testSkipAdminSeed()
  // Delete the admin volunteer that the reset's ensureInit() already created
  if (c.env.ADMIN_PUBKEY) {
    await services.identity.deleteUser(c.env.ADMIN_PUBKEY).catch(() => {})
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
  const services = c.get('services')
  const env = { DEMO_MODE: c.env.DEMO_MODE, ENVIRONMENT: c.env.ENVIRONMENT }
  await services.records.reset()
  await services.shifts.reset('')
  await services.calls.reset('')
  await services.conversations.reset()
  await services.contacts.reset(env)
  await services.cases.reset(env)
  return c.json({ ok: true })
})

// ─── Identity Promotion (E2E test helpers) ──────────────────────────────────
// Promotes a test identity to admin role so mobile E2E tests can access all features.

dev.post('/test-promote-admin', async (c) => {
  if (c.env.ENVIRONMENT !== 'development') {
    return c.json({ error: 'Not Found' }, 404)
  }
  if (!checkResetSecret(c)) {
    return c.json({ error: 'Forbidden' }, 403)
  }
  const body = await c.req.json().catch(() => ({})) as { pubkey?: string }
  if (!body.pubkey) {
    return c.json({ error: 'pubkey is required' }, 400)
  }
  let pubkey: string
  try {
    pubkey = decodePubkey(body.pubkey)
  } catch (e) {
    return c.json({ error: `Invalid pubkey: ${e instanceof Error ? e.message : String(e)}` }, 400)
  }
  const services = c.get('services')
  // Try to update existing volunteer to super-admin role.
  try {
    await services.identity.updateUser(pubkey, { roles: ['role-super-admin'] }, true)
  } catch {
    // Volunteer may not exist yet — create with admin role
    await services.identity.createUser({
      pubkey,
      name: 'BDD Test Admin',
      phone: '+15550000001',
      roleIds: ['role-super-admin'],
      encryptedSecretKey: '',
    })
  }
  return c.json({ ok: true, pubkey })
})

// ─── CMS Test Setup (E2E test helpers) ──────────────────────────────────────
// Sets up CMS data for mobile E2E tests that can't call authenticated API endpoints.
// Gated by ENVIRONMENT=development + DEV_RESET_SECRET / E2E_TEST_SECRET.

dev.post('/test-setup-cms', async (c) => {
  if (c.env.ENVIRONMENT !== 'development') {
    return c.json({ error: 'Not Found' }, 404)
  }
  if (!checkResetSecret(c)) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  const body = await c.req.json().catch(() => ({})) as { pubkey?: string }
  let pubkey: string | undefined
  if (body.pubkey) {
    try {
      pubkey = decodePubkey(body.pubkey)
    } catch {
      pubkey = body.pubkey // Fall back to raw value if decode fails
    }
  }
  const services = c.get('services')
  const templateId = 'jail-support'

  // 0. Grant the default volunteer role cases:read permission so test
  //    identities (who register as volunteers during onboarding) can see
  //    all records without explicit assignment.
  let roleOk = false
  let roleStatus = 500
  try {
    await services.settings.updateRole('role-volunteer', {
      permissions: [
        'calls:answer', 'calls:read-active',
        'notes:create', 'notes:read-own', 'notes:update-own', 'notes:reply',
        'conversations:claim', 'conversations:send', 'conversations:read-assigned',
        'conversations:claim-sms', 'conversations:claim-whatsapp',
        'conversations:claim-signal', 'conversations:claim-rcs', 'conversations:claim-web',
        'shifts:read-own', 'bans:report',
        'reports:read-assigned', 'reports:send-message',
        'files:upload', 'files:download-own',
        // CMS permissions for E2E testing: full access to cases + contacts
        'cases:create', 'cases:read-all', 'cases:update', 'cases:assign',
        'contacts:view', 'contacts:create', 'contacts:edit',
        'events:read', 'events:create', 'evidence:upload', 'evidence:download',
      ],
    })
    roleOk = true
    roleStatus = 200
  } catch {
    roleOk = false
  }

  // 1. Enable case management
  await services.settings.setCaseManagementEnabled({ enabled: true })

  // 2. Create a test entity type directly (bypassing template engine which requires
  //    loading bundled template JSON files that may not be available in all environments).
  const entityTypeId = crypto.randomUUID()
  try {
    await services.settings.createEntityType({
      id: entityTypeId,
      name: 'arrest_case',
      label: 'Arrest Case',
      labelPlural: 'Arrest Cases',
      description: 'BDD test entity type',
      category: 'case',
      color: '#ef4444',
      statuses: [
        { value: 'reported', label: 'Reported', color: '#f59e0b', order: 1 },
        { value: 'confirmed', label: 'Confirmed', color: '#3b82f6', order: 2 },
        { value: 'in_custody', label: 'In Custody', color: '#ef4444', order: 3 },
        { value: 'released', label: 'Released', color: '#22c55e', order: 4 },
        { value: 'case_closed', label: 'Case Closed', color: '#6b7280', order: 5, isClosed: true },
      ],
      defaultStatus: 'reported',
      closedStatuses: ['case_closed'],
      fields: [
        { id: crypto.randomUUID(), name: 'arrest_datetime', label: 'Arrest Date/Time', type: 'date', required: true, order: 1, accessLevel: 'all', indexable: false, indexType: 'none', visibleToUsers: true, editableByUsers: true, hubEditable: true },
        { id: crypto.randomUUID(), name: 'location', label: 'Location', type: 'text', required: false, order: 2, accessLevel: 'all', indexable: false, indexType: 'none', visibleToUsers: true, editableByUsers: true, hubEditable: true },
        { id: crypto.randomUUID(), name: 'charges', label: 'Charges', type: 'textarea', required: false, order: 3, accessLevel: 'all', indexable: false, indexType: 'none', visibleToUsers: true, editableByUsers: true, hubEditable: true },
      ],
      numberPrefix: 'JS',
      numberingEnabled: true,
    })
  } catch { /* ignore entity type creation failures */ }

  // 3. Get entity types to verify creation
  const { entityTypes } = await services.settings.getEntityTypes()

  // 4. Create a sample record if entity types exist
  let recordId: string | null = null
  if (entityTypes.length > 0) {
    const et = entityTypes[0]
    const assignedTo = pubkey ? [pubkey] : []
    try {
      const record = await services.cases.create({
        entityTypeId: et.id,
        statusHash: et.defaultStatus || 'reported',
        assignedTo,
        blindIndexes: {},
        encryptedSummary: btoa('{"title":"Test Case","summary":"BDD test case"}'),
        summaryEnvelopes: [],
        createdBy: pubkey ?? '',
        hubId: '',
      })
      recordId = record.id
    } catch { /* ignore record creation failures */ }
  }

  return c.json({
    ok: true,
    templateId,
    rolePatched: roleOk,
    roleStatus,
    entityTypeCount: entityTypes.length,
    entityTypes: entityTypes.map(et => ({ id: et.id, name: et.name })),
    sampleRecordId: recordId,
  })
})

// ─── Simulation Endpoints (E2E test helpers) ───────────────────────────────
// These bypass TelephonyAdapter entirely — they proxy directly to service calls.
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
  const services = c.get('services')
  const hubId = body.hubId ?? ''

  // Check if the caller is banned (mirrors real telephony flow — uses raw phone, not hashed)
  const banned = await services.records.checkBan(body.callerNumber, hubId || undefined)
  if (banned) {
    return c.json({ error: 'Caller is banned', banned: true }, 403)
  }

  // Get on-shift volunteer pubkeys for the call record
  let volunteerPubkeys: string[] = []
  try {
    volunteerPubkeys = await services.shifts.getCurrentVolunteers(hubId)
  } catch {
    // Shifts not configured — proceed with empty list
  }

  // If no volunteers are available, return a no-volunteers status
  // (mirrors real telephony flow where the call cannot be routed)
  if (volunteerPubkeys.length === 0) {
    return c.json({ ok: false, callId, status: 'no-volunteers', error: 'No volunteers available' })
  }

  await services.calls.addCall(hubId, {
    callId,
    callerNumber: body.callerNumber,
    callerLast4: body.callerNumber?.slice(-4),
  })

  // Publish call ring event (mirrors real telephony flow)
  publishNostrEvent(c.env, KIND_CALL_RING, {
    type: 'call:ring',
    callId,
  }).catch(() => {})

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

  const services = c.get('services')
  const call = await services.calls.getActiveCallByCallId(body.callId)
  if (!call) return c.json({ error: 'Call not found' }, 404)
  await services.calls.answerCall(call.hubId ?? '', body.callId, body.pubkey)

  // Publish call update event (mirrors real telephony flow)
  publishNostrEvent(c.env, KIND_CALL_UPDATE, {
    type: 'call:update',
    callId: body.callId,
    status: 'in-progress',
  }).catch(() => {})

  // Publish presence update (mirrors real telephony flow)
  publishNostrEvent(c.env, KIND_PRESENCE_UPDATE, {
    type: 'presence:summary',
    callId: body.callId,
  }).catch(() => {})

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

  const services = c.get('services')
  const call = await services.calls.getActiveCallByCallId(body.callId)
  if (!call) return c.json({ error: 'Call not found' }, 404)
  await services.calls.endCall(call.hubId ?? '', body.callId)

  // Publish call update event (mirrors real telephony flow)
  publishNostrEvent(c.env, KIND_CALL_UPDATE, {
    type: 'call:update',
    callId: body.callId,
    status: 'completed',
  }).catch(() => {})

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

  const services = c.get('services')
  const call = await services.calls.getActiveCallByCallId(body.callId)
  if (!call) return c.json({ error: 'Call not found' }, 404)
  // Voicemail = call ends without being answered → status becomes 'unanswered'
  await services.calls.endCall(call.hubId ?? '', body.callId)

  // Publish voicemail event (mirrors real telephony flow)
  publishNostrEvent(c.env, KIND_CALL_VOICEMAIL, {
    type: 'voicemail:new',
    callId: body.callId,
  }).catch(() => {})

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

  const services = c.get('services')
  const adminDecryptionPubkey = c.env.ADMIN_DECRYPTION_PUBKEY || c.env.ADMIN_PUBKEY
  const result = await services.conversations.handleIncoming({
    channelType: channel,
    externalId: crypto.randomUUID(),
    senderIdentifier: body.senderNumber,
    senderIdentifierHash: senderHash,
    body: body.body,
    timestamp: new Date().toISOString(),
  }, adminDecryptionPubkey)

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

  const services = c.get('services')

  // Delivery status updates use the external ID mapping in ConversationsService.
  // For simulation, we fetch the message to find its externalId, then call the status endpoint.
  const { messages } = await services.conversations.listMessages(body.conversationId, { limit: 200 })

  const message = messages.find(m => m.id === body.messageId)
  if (!message) {
    return c.json({ error: 'Message not found in conversation' }, 404)
  }

  if (!message.externalId) {
    return c.json({ error: 'Message has no externalId — only outbound messages with provider IDs support delivery status' }, 400)
  }

  await services.conversations.updateMessageStatus({
    externalId: message.externalId,
    status: body.status,
    timestamp: new Date().toISOString(),
    failureReason: body.status === 'failed' ? 'Simulated failure' : undefined,
  })

  return c.json({ ok: true })
})

// ─── Test Push Log (dev/test BDD helper) ──────────────────────────────────
// Returns or clears the in-memory push payload log recorded by push-dispatch.ts.
// Used by backend BDD tests to verify that push payloads carry hubId without
// real APNs/FCM credentials being configured.

dev.get('/test-push-log', (c) => {
  const denied = simulationGuard(c)
  if (denied) return denied

  return c.json({ entries: getTestPushLog() })
})

dev.delete('/test-push-log', (c) => {
  const denied = simulationGuard(c)
  if (denied) return denied

  clearTestPushLog()
  return c.json({ ok: true })
})

// 7. Simulate push dispatch — directly invokes createPushDispatcherFromService with
//    a synthetic WakePayload to verify that hubId is present in the dispatched payload.
//    Useful for BDD scenarios that need to assert push payload structure without
//    requiring a full telephony or messaging flow.

interface SimulatePushDispatchBody {
  hubId: string
  type: 'message' | 'voicemail' | 'shift_reminder' | 'assignment'
  recipientPubkey: string
  conversationId?: string
  channelType?: string
  callId?: string
}

dev.post('/test-simulate/push-dispatch', async (c) => {
  const denied = simulationGuard(c)
  if (denied) return denied

  const body = await c.req.json().catch(() => ({})) as SimulatePushDispatchBody
  if (!body.hubId || !body.type || !body.recipientPubkey) {
    return c.json({ error: 'hubId, type, and recipientPubkey are required' }, 400)
  }

  const services = c.get('services')
  const { createPushDispatcherFromService } = await import('../lib/push-dispatch')

  const wake = {
    hubId: body.hubId,
    type: body.type,
    conversationId: body.conversationId,
    channelType: body.channelType,
    callId: body.callId,
  }

  const dispatcher = createPushDispatcherFromService(c.env, services.identity, services.shifts)
  await dispatcher.sendToVolunteer(body.recipientPubkey, wake, { ...wake })

  return c.json({ ok: true, wake })
})

// ─── Test Hub Creation (dev/test isolation helper) ──────────────────────────
// Creates an isolated hub for a single test run.
// Gated by ENVIRONMENT=development + DEV_RESET_SECRET / E2E_TEST_SECRET.

dev.post('/test-create-hub', async (c) => {
  const denied = simulationGuard(c)
  if (denied) return denied

  const rawBody = await c.req.json().catch(() => ({}))
  const hubName = typeof rawBody === 'object' && rawBody !== null && 'name' in rawBody && typeof rawBody.name === 'string'
    ? rawBody.name
    : `test-hub-${Date.now()}`
  const name = hubName.trim()
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

  const hub: Hub = {
    id: crypto.randomUUID(),
    name,
    slug,
    status: 'active',
    createdBy: 'test',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  const services = c.get('services')
  try {
    await services.settings.createHub(hub)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create hub'
    return c.json({ error: message }, 500)
  }

  return c.json({ id: hub.id, name: hub.name })
})

export default dev
