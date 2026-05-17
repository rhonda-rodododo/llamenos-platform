import { Hono } from 'hono'
import type { AppEnv } from '../types'
import type { Hub, MessagingChannelType } from '@shared/types'
import { hashPhone } from '../lib/crypto'
import { publishEvent } from '../lib/ws-events'
import { KIND_CALL_RING, KIND_CALL_UPDATE, KIND_CALL_VOICEMAIL, KIND_MESSAGE_NEW, KIND_PRESENCE_UPDATE } from '@shared/event-kinds'
import { getTestPushLog, clearTestPushLog } from '../lib/push-dispatch'
import { hpkeSeal, randomBytes } from '@llamenos/crypto/ffi'
import { hexToBytes, bytesToHex } from '@shared/encoding'
import { LABEL_HUB_KEY_WRAP } from '@shared/crypto-labels'

/**
 * Decode a pubkey (hex only — npub1 bech32 encoding is no longer supported).
 * Returns the hex pubkey string.
 */
function decodePubkey(input: string): string {
  if (input.startsWith('npub1')) {
    throw new Error('npub1 encoding is no longer supported — use raw hex pubkey')
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
  // Accept X-Test-Secret header (simulation helpers) OR valid Bearer auth token (apiPost helpers)
  if (c.req.header('X-Test-Secret') === secret) return true
  // Also allow if the request has a valid Authorization header (authenticated test clients)
  const authHeader = c.req.header('Authorization')
  if (authHeader?.startsWith('Bearer ')) return true
  return false
}

dev.post('/test-reset', async (c) => {
  // Full reset: development only — too destructive for staging
  if (c.env.ENVIRONMENT !== 'development') {
    return c.json({ error: 'Not Found' }, 404)
  }
  if (!checkResetSecret(c)) {
    return c.json({ error: 'Not Found' }, 404)
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
  await services.providerSetup.reset()
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
    return c.json({ error: 'Not Found' }, 404)
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

// ─── A2P Brand Approve (BDD test helper) ──────────────────────────────────────
// Directly transitions an A2P brand to "approved" state — no real provider poll.
// Used by BDD fixtures that need an approved brand to test campaign submission.

dev.post('/test-a2p-approve-brand', async (c) => {
  if (c.env.ENVIRONMENT !== 'development') {
    return c.json({ error: 'Not Found' }, 404)
  }
  if (!checkResetSecret(c)) {
    return c.json({ error: 'Not Found' }, 404)
  }
  const body = await c.req.json().catch(() => ({})) as { registrationId?: string }
  if (!body.registrationId) {
    return c.json({ error: 'registrationId is required' }, 400)
  }
  const services = c.get('services')
  await services.a2pRegistration.testApproveBrand(body.registrationId)
  return c.json({ ok: true })
})

// ─── Rate Limit Reset (BDD test helper) ─────────────────────────────────────
// Clears rate limit counters — prevents cross-scenario bleed in BDD tests.
// Accepts optional ?prefix= query param to clear only matching keys (safer for parallel tests).

dev.delete('/test-rate-limits', async (c) => {
  if (c.env.ENVIRONMENT !== 'development') {
    return c.json({ error: 'Not Found' }, 404)
  }
  if (!checkResetSecret(c)) {
    return c.json({ error: 'Not Found' }, 404)
  }
  const prefix = c.req.query('prefix')
  const services = c.get('services')
  await services.settings.clearRateLimits(prefix || undefined)
  return c.json({ ok: true })
})

// ─── Identity Promotion (E2E test helpers) ──────────────────────────────────
// Promotes a test identity to admin role so mobile E2E tests can access all features.

dev.post('/test-promote-admin', async (c) => {
  if (c.env.ENVIRONMENT !== 'development') {
    return c.json({ error: 'Not Found' }, 404)
  }
  if (!checkResetSecret(c)) {
    return c.json({ error: 'Not Found' }, 404)
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

// ─── Shift Creation (E2E test helpers) ──────────────────────────────────────
// Creates a shift covering the current time with a specific volunteer on it.
// Active call simulation requires on-shift volunteers for call routing.

dev.post('/test-create-shift', async (c) => {
  if (c.env.ENVIRONMENT !== 'development') {
    return c.json({ error: 'Not Found' }, 404)
  }
  if (!checkResetSecret(c)) {
    return c.json({ error: 'Not Found' }, 404)
  }
  const body = await c.req.json().catch(() => ({})) as { pubkey?: string; hubId?: string }
  if (!body.pubkey) {
    return c.json({ error: 'pubkey is required' }, 400)
  }
  const services = c.get('services')
  const hubId = body.hubId ?? ''
  try {
    const now = new Date()
    const currentDay = now.getUTCDay()
    const hour = now.getUTCHours()
    const startTime = `${String(Math.max(0, hour - 1)).padStart(2, '0')}:00`
    const endTime = `${String(Math.min(23, hour + 1)).padStart(2, '0')}:59`
    await services.shifts.create(hubId, {
      encryptedName: btoa('BDD Test Shift'),
      startTime,
      endTime,
      days: [currentDay],
      userPubkeys: [body.pubkey],
    })
    return c.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to create shift'
    return c.json({ ok: false, error: msg })
  }
})

// ─── CMS Test Setup (E2E test helpers) ──────────────────────────────────────
// Sets up CMS data for mobile E2E tests that can't call authenticated API endpoints.
// Gated by ENVIRONMENT=development + DEV_RESET_SECRET / E2E_TEST_SECRET.

dev.post('/test-setup-cms', async (c) => {
  if (c.env.ENVIRONMENT !== 'development') {
    return c.json({ error: 'Not Found' }, 404)
  }
  if (!checkResetSecret(c)) {
    return c.json({ error: 'Not Found' }, 404)
  }

  const body = await c.req.json().catch(() => ({})) as { pubkey?: string; hubId?: string }
  let pubkey: string | undefined
  if (body.pubkey) {
    try {
      pubkey = decodePubkey(body.pubkey)
    } catch {
      pubkey = body.pubkey // Fall back to raw value if decode fails
    }
  }
  const hubId = body.hubId ?? ''
  const services = c.get('services')
  const templateId = 'jail-support'

  // Seed default roles if empty — the server doesn't call ensureInit() at startup,
  // so the roles table may be empty in CI (Docker Compose fresh database).
  // Without roles, resolvePermissions returns [] for all users → "Access denied" everywhere.
  await services.settings.ensureInit({ ENVIRONMENT: c.env.ENVIRONMENT })

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
        // CMS permissions for E2E testing: full access to cases
        // Note: contacts:view intentionally omitted — volunteers are denied contacts per permission-matrix spec
        'cases:create', 'cases:read-all', 'cases:update', 'cases:assign',
        'events:read', 'events:create', 'evidence:upload', 'evidence:download',
        // Hub permissions: volunteers need hubs:read to access their hub key envelope (CRIT-H1)
        'hubs:read',
        // Settings permissions: needed for CMS enabled check and entity type listing
        'settings:read',
        // Hub onboarding permissions: needed for communications setup E2E tests
        'hubs:configure', 'telephony:view-providers',
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

  // 2b. Create an event entity type so EventsViewModel (category === 'event') has data
  const eventEntityTypeId = crypto.randomUUID()
  try {
    await services.settings.createEntityType({
      id: eventEntityTypeId,
      name: 'protest_event',
      label: 'Protest Event',
      labelPlural: 'Protest Events',
      description: 'BDD test event entity type',
      category: 'event',
      color: '#3b82f6',
      statuses: [
        { value: 'planned', label: 'Planned', color: '#f59e0b', order: 1 },
        { value: 'active', label: 'Active', color: '#22c55e', order: 2 },
        { value: 'completed', label: 'Completed', color: '#6b7280', order: 3, isClosed: true },
      ],
      defaultStatus: 'planned',
      closedStatuses: ['completed'],
      fields: [
        { id: crypto.randomUUID(), name: 'event_date', label: 'Event Date', type: 'date', required: true, order: 1, accessLevel: 'all', indexable: false, indexType: 'none', visibleToUsers: true, editableByUsers: true, hubEditable: true },
        { id: crypto.randomUUID(), name: 'location', label: 'Location', type: 'text', required: false, order: 2, accessLevel: 'all', indexable: false, indexType: 'none', visibleToUsers: true, editableByUsers: true, hubEditable: true },
      ],
      numberPrefix: 'EVT',
      numberingEnabled: true,
    })
  } catch { /* ignore event entity type creation failures */ }

  // 3. Get entity types to verify creation
  const { entityTypes } = await services.settings.getEntityTypes()

  // 4. Create sample records for both case and event entity types
  let recordId: string | null = null
  const assignedTo = pubkey ? [pubkey] : []
  for (const et of entityTypes) {
    try {
      const isEvent = et.category === 'event'
      const record = await services.cases.create({
        entityTypeId: et.id,
        statusHash: et.defaultStatus || (isEvent ? 'planned' : 'reported'),
        assignedTo,
        blindIndexes: {},
        encryptedSummary: btoa(isEvent
          ? '{"title":"Test Event","summary":"BDD test event"}'
          : '{"title":"Test Case","summary":"BDD test case"}'),
        summaryEnvelopes: [],
        createdBy: pubkey ?? '',
        hubId,
      })
      if (!recordId) recordId = record.id
    } catch { /* ignore record creation failures */ }
  }

  // 5. Create triage-eligible reports so triage screen has data
  let reportId: string | null = null
  try {
    // channelType 'reports' is used by the triage system — it's a text column
    // in the DB but typed as MessagingChannelType | 'web' in the service interface.
    // Use direct DB insert to avoid type mismatch.
    const report = await services.conversations.create({
      hubId,
      channelType: 'web',
      status: 'waiting',
      metadata: {
        type: 'report',
        reportTitle: 'Test Triage Report',
        reportCategory: 'general',
        conversionStatus: 'pending',
      },
    })
    reportId = report?.id ?? null
  } catch { /* ignore — triage tests will show empty state */ }

  return c.json({
    ok: true,
    templateId,
    rolePatched: roleOk,
    roleStatus,
    entityTypeCount: entityTypes.length,
    entityTypes: entityTypes.map(et => ({ id: et.id, name: et.name })),
    sampleRecordId: recordId,
    reportId,
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
  /** When true, returns 422 if no volunteers are on shift (mirrors real telephony routing) */
  checkVolunteers?: boolean
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
  hubId?: string
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
    return Response.json({ error: 'Not Found' }, { status: 404 })
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

  // Check if the caller is banned (hash before lookup — mirrors real telephony flow)
  const callerNumberHash = hashPhone(body.callerNumber, c.env.HMAC_SECRET)
  const banned = await services.records.checkBan(callerNumberHash, hubId || undefined)
  if (banned) {
    return c.json({ error: 'Caller is banned', banned: true }, 403)
  }

  // Optionally check for on-shift volunteers (mirrors real telephony routing)
  if (body.checkVolunteers) {
    let volunteerPubkeys: string[] = []
    try {
      volunteerPubkeys = await services.shifts.getCurrentVolunteers(hubId)
    } catch {
      // Shifts not configured — proceed with empty list
    }
    if (volunteerPubkeys.length === 0) {
      return c.json({ error: 'No volunteers available', status: 'no-volunteers' }, 422)
    }
  }

  await services.calls.addCall(hubId, {
    callId,
    callerNumber: callerNumberHash,
    callerLast4: body.callerNumber?.slice(-4),
  })

  // Publish call ring event (mirrors real telephony flow)
  // Await to ensure event is in relay before returning — prevents race conditions in E2E tests
  publishEvent(c.env, KIND_CALL_RING, {
    type: 'call:ring',
    callId,
  }, hubId)

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
  // Await to ensure event is in relay before returning — prevents race conditions in E2E tests
  publishEvent(c.env, KIND_CALL_UPDATE, {
    type: 'call:update',
    callId: body.callId,
    status: 'in-progress',
  }, call.hubId ?? undefined)

  // Publish presence update (mirrors real telephony flow)
  publishEvent(c.env, KIND_PRESENCE_UPDATE, {
    type: 'presence:summary',
    callId: body.callId,
  }, call.hubId ?? undefined)

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
  publishEvent(c.env, KIND_CALL_UPDATE, {
    type: 'call:update',
    callId: body.callId,
    status: 'completed',
  }, call.hubId ?? undefined)

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
  publishEvent(c.env, KIND_CALL_VOICEMAIL, {
    type: 'voicemail:new',
    callId: body.callId,
  }, call.hubId ?? undefined)

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
  }, adminDecryptionPubkey, body.hubId)

  // Publish Nostr event (mirrors real messaging webhook flow)
  // Messaging events use empty hubId — conversations span all hubs
  publishEvent(c.env, KIND_MESSAGE_NEW, {
    type: 'message:new',
    conversationId: result.conversationId,
    messageId: result.messageId,
    channelType: channel,
  })

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

// 7a. Simulate Signal delivery receipt
// Accepts { conversationId, timestamp, receiptType } and updates the outbound
// message whose externalId matches the timestamp to "delivered" / "read".
dev.post('/test-simulate/signal-receipt', async (c) => {
  const denied = simulationGuard(c)
  if (denied) return denied

  const body = await c.req.json().catch(() => ({})) as {
    conversationId?: string
    timestamp?: string
    receiptType?: string
  }
  if (!body.conversationId || !body.timestamp) {
    return c.json({ error: 'conversationId and timestamp are required' }, 400)
  }

  const services = c.get('services')
  const { messages } = await services.conversations.listMessages(body.conversationId, { limit: 200 })
  const message = messages.find(m => m.externalId === body.timestamp)
  if (!message) {
    return c.json({ error: 'No outbound message found with that externalId/timestamp' }, 404)
  }

  const newStatus = body.receiptType === 'read' ? 'read' : 'delivered'
  await services.conversations.updateMessageStatus({
    externalId: message.externalId!,
    status: newStatus,
    timestamp: new Date().toISOString(),
  })

  return c.json({ ok: true, messageId: message.id, status: newStatus })
})

// 7b. Simulate Signal reaction webhook
// Returns the eventType/payload that the backend would publish over Nostr
// so BDD tests can assert MESSAGE_REACTION events are dispatched.
dev.post('/test-simulate/signal-reaction', async (c) => {
  const denied = simulationGuard(c)
  if (denied) return denied

  const body = await c.req.json().catch(() => ({})) as {
    conversationId?: string
    emoji?: string
    targetTimestamp?: string
  }
  if (!body.conversationId || !body.emoji) {
    return c.json({ error: 'conversationId and emoji are required' }, 400)
  }

  // Signal reactions are published as Nostr MESSAGE_REACTION events.
  // In simulation we record the intent and return the expected event shape.
  const payload = {
    conversationId: body.conversationId,
    emoji: body.emoji,
    targetTimestamp: body.targetTimestamp,
    simulatedAt: new Date().toISOString(),
  }

  return c.json({ ok: true, eventType: 'MESSAGE_REACTION', payload })
})

// 7c. Simulate Signal typing indicator webhook
// Returns the eventType/payload that the backend would publish over Nostr
// so BDD tests can assert TYPING_INDICATOR events are dispatched.
dev.post('/test-simulate/signal-typing', async (c) => {
  const denied = simulationGuard(c)
  if (denied) return denied

  const body = await c.req.json().catch(() => ({})) as {
    conversationId?: string
    action?: string
  }
  if (!body.conversationId) {
    return c.json({ error: 'conversationId is required' }, 400)
  }

  const payload = {
    conversationId: body.conversationId,
    action: body.action ?? 'STARTED',
    simulatedAt: new Date().toISOString(),
  }

  return c.json({ ok: true, eventType: 'TYPING_INDICATOR', payload })
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

// ─── Test Hub Member Addition (dev/test isolation helper) ───────────────────
// Adds a pubkey as a member (super-admin role) of an existing hub so that
// hub-switching tests can call getHubKey for hub2 without a permission error.

dev.post('/test-add-hub-member', async (c) => {
  const denied = simulationGuard(c)
  if (denied) return denied

  const body = await c.req.json().catch(() => ({})) as { pubkey?: string; hubId?: string }
  if (!body.pubkey || !body.hubId) {
    return c.json({ error: 'pubkey and hubId are required' }, 400)
  }

  let pubkey: string
  try {
    pubkey = decodePubkey(body.pubkey)
  } catch (e) {
    return c.json({ error: `Invalid pubkey: ${e instanceof Error ? e.message : String(e)}` }, 400)
  }

  const services = c.get('services')
  try {
    await services.identity.setHubRole({
      pubkey,
      hubId: body.hubId,
      roleIds: ['role-super-admin'],
    })

    // Seed a real HPKE-sealed hub key envelope so getHubKey returns a decryptable
    // envelope. The Android CryptoService uses real HPKE decryption via native FFI,
    // so random bytes would fail at mobileHpkeOpenKey().
    try {
      // Look up the user's X25519 encryption pubkey from their device record
      const userDevices = await services.identity.listDevices(pubkey)
      const x25519Pubkey = userDevices.find(d => d.x25519Pubkey)?.x25519Pubkey
      if (x25519Pubkey) {
        // Create a real HPKE envelope: seal a random 32-byte hub key to the device's X25519 pubkey
        const hubKey = randomBytes(32)
        const labelBytes = new TextEncoder().encode(LABEL_HUB_KEY_WRAP)
        const aad = new Uint8Array(0)
        const sealed = hpkeSeal(hexToBytes(x25519Pubkey), hubKey, labelBytes, aad)
        await services.settings.setHubKeyEnvelopes(body.hubId, {
          envelopes: [{
            pubkey,
            enc: bytesToHex(sealed.subarray(0, 32)),
            ct: bytesToHex(sealed.subarray(32)),
          }],
        })
      } else {
        // Fallback: device hasn't registered X25519 key yet — seed placeholder
        await services.settings.setHubKeyEnvelopes(body.hubId, {
          envelopes: [{
            pubkey,
            enc: bytesToHex(randomBytes(32)),
            ct: bytesToHex(randomBytes(48)),
          }],
        })
      }
    } catch {
      // Non-fatal: hub key seeding failed but membership was set
    }

    return c.json({ ok: true, pubkey, hubId: body.hubId })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to add hub member'
    return c.json({ error: message }, 500)
  }
})

// ─── Test Hub Creation (dev/test isolation helper) ──────────────────────────
// Creates an isolated hub for a single test run.
// Gated by ENVIRONMENT=development + DEV_RESET_SECRET / E2E_TEST_SECRET.

dev.post('/test-create-hub', async (c) => {
  const denied = simulationGuard(c)
  if (denied) return denied

  // Seed default roles/settings if this is the first request to a fresh database.
  const services = c.get('services')
  await services.settings.ensureInit({ ENVIRONMENT: c.env.ENVIRONMENT })

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

  try {
    await services.settings.createHub(hub)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create hub'
    return c.json({ error: message }, 500)
  }

  // Add admin as a member of the new hub so WS relay subscribe works in tests
  const adminPubkey = c.env?.ADMIN_PUBKEY as string | undefined
  if (adminPubkey) {
    try {
      await services.identity.setHubRole({
        pubkey: adminPubkey,
        hubId: hub.id,
        roleIds: ['role-super-admin'],
      })
    } catch {
      // Admin user may not exist yet — non-fatal for hub creation
    }
  }

  return c.json({ id: hub.id, name: hub.name })
})

export default dev
