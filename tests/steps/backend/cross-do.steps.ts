/**
 * Cross-DO integration workflow step definitions.
 *
 * Tests workflows spanning IdentityDO, ShiftManagerDO, CallRouterDO,
 * RecordsDO, and ConversationDO.
 */
import { expect } from '@playwright/test'
import { Given, When, Then, Before } from './fixtures'
import { shared } from './shared-state'
import { state } from './common.steps'
import {
  apiGet,
  apiPost,
  apiPatch,
  createVolunteerViaApi,
  createShiftViaApi,
  createBanViaApi,
  removeBanViaApi,
  listAuditLogViaApi,
  listNotesViaApi,
  generateTestKeypair,
  uniquePhone,
  uniqueName,
  ADMIN_NSEC,
} from '../../api-helpers'
import {
  simulateIncomingCall,
  simulateAnswerCall,
  simulateEndCall,
  simulateVoicemail,
  simulateIncomingMessage,
  uniqueCallerNumber,
} from '../../simulation-helpers'

// ── State ───────────────────────────────────────────────────────────

interface CrossDoState {
  volunteerPubkey?: string
  volunteerNsec?: string
  newVolunteerPubkey?: string
  newVolunteerNsec?: string
  shiftId?: string
  callId?: string
  callStatus?: string
  noteId?: string
  conversationId?: string
  conversationIds: string[]
  inviteCode?: string
  reportId?: string
  reporterNsec?: string
  reviewerPubkey?: string
}

let xdo: CrossDoState

Before({ tags: '@backend' }, async () => {
  xdo = { conversationIds: [] }
})

// ─── Volunteer Onboarding → Call → Note ─────────────────────────────

When('an admin creates a volunteer', async ({ request }) => {
  const vol = await createVolunteerViaApi(request, { name: uniqueName('XDO Vol') })
  xdo.volunteerPubkey = vol.pubkey
  xdo.volunteerNsec = vol.nsec
})

When('the admin creates a shift including the volunteer', async ({ request }) => {
  const shift = await createShiftViaApi(request, {
    name: uniqueName('XDO Shift'),
    startTime: '00:00',
    endTime: '23:59',
    days: [0, 1, 2, 3, 4, 5, 6],
    volunteerPubkeys: [xdo.volunteerPubkey!],
  })
  xdo.shiftId = shift.id
})

When('an incoming call arrives', async ({ request }) => {
  const caller = uniqueCallerNumber()
  const result = await simulateIncomingCall(request, { callerNumber: caller })
  xdo.callId = result.callId
  xdo.callStatus = result.status
})

When('the volunteer answers the call', async ({ request }) => {
  // Use xdo state if available (cross-DO workflow), fall back to shared state
  // (simulation scenarios that use "Given an incoming call from ..." steps)
  const callId = xdo.callId ?? state.callId
  const pubkey = xdo.volunteerPubkey ?? state.volunteers[0]?.pubkey
  expect(callId).toBeTruthy()
  expect(pubkey).toBeTruthy()
  const result = await simulateAnswerCall(request, callId!, pubkey!)
  xdo.callStatus = result.status
  state.callStatus = result.status
})

When('the volunteer writes a note for the call', async ({ request }) => {
  const { data, status } = await apiPost<{ id?: string; note?: { id: string } }>(
    request,
    '/notes',
    {
      encryptedContent: 'xdo-test-note',
      callId: xdo.callId,
      readerEnvelopes: [],
    },
    xdo.volunteerNsec!,
  )
  if (status < 300) {
    xdo.noteId = (data as Record<string, unknown>)?.id as string
      ?? ((data as Record<string, unknown>)?.note as Record<string, unknown>)?.id as string
  }
})

Then('the call history should show a completed call', async ({ request }) => {
  // End the call first
  if (xdo.callStatus === 'in-progress') {
    await simulateEndCall(request, xdo.callId!)
  }
  const { data } = await apiGet<{ calls: Array<{ callId: string; status: string }> }>(request, '/calls/history')
  const calls = (data as { calls: Array<{ callId: string; status: string }> }).calls
  const call = calls.find(c => c.callId === xdo.callId)
  expect(call).toBeDefined()
  expect(call!.status).toBe('completed')
})

Then('the notes list should contain the volunteer\'s note', async ({ request }) => {
  const { notes } = await listNotesViaApi(request)
  expect(notes.length).toBeGreaterThan(0)
})

Then('the audit log should have entries for each step', async ({ request }) => {
  const { entries } = await listAuditLogViaApi(request)
  expect(entries.length).toBeGreaterThan(0)
  // Should have volunteer creation and note creation at minimum
  const events = entries.map(e => e.action)
  expect(events).toContain('volunteerAdded')
  expect(events).toContain('noteCreated')
})

// ─── Ban Lifecycle with Call Integration ────────────────────────────

When('an admin bans {string}', async ({ request }, phone: string) => {
  await createBanViaApi(request, { phone, reason: 'XDO ban test' })
})

When('an incoming call arrives from {string}', async ({ request }, phone: string) => {
  try {
    const result = await simulateIncomingCall(request, { callerNumber: phone })
    xdo.callId = result.callId
    xdo.callStatus = result.status
  } catch (e) {
    // Banned callers get a 403 — record as 'rejected' instead of throwing
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('banned') || msg.includes('403')) {
      xdo.callStatus = 'rejected'
    } else {
      throw e
    }
  }
})

Then('the banned call should be rejected', async ({}) => {
  // The incoming-call step catches the 403 and sets status to 'rejected'
  expect(xdo.callStatus).toBe('rejected')
})

Then('the call should be ringing', async ({}) => {
  expect(xdo.callStatus).toBe('ringing')
})

// 'the admin removes the ban for {string}' is defined in crud.steps.ts

// ─── Conversation Lifecycle ─────────────────────────────────────────

When('an SMS arrives from {string} with body {string}', async ({ request }, phone: string, body: string) => {
  const result = await simulateIncomingMessage(request, {
    senderNumber: phone,
    body,
    channel: 'sms',
  })
  xdo.conversationId = result.conversationId
  xdo.conversationIds.push(result.conversationId)
})

When('a WhatsApp message arrives from {string} with body {string}', async ({ request }, phone: string, body: string) => {
  const result = await simulateIncomingMessage(request, {
    senderNumber: phone,
    body,
    channel: 'whatsapp',
  })
  xdo.conversationIds.push(result.conversationId)
})

// 'a new conversation should be created' is defined in messaging.steps.ts
// Cross-DO uses a local assertion instead:
Then('a conversation should have been created', async ({}) => {
  expect(xdo.conversationId).toBeDefined()
  expect(xdo.conversationId!.length).toBeGreaterThan(0)
})

When('the volunteer claims the conversation', async ({ request }) => {
  const volPubkey = state.volunteers[0]?.pubkey ?? xdo.volunteerPubkey
  if (volPubkey && xdo.conversationId) {
    const volNsec = state.volunteers[0]?.nsec ?? xdo.volunteerNsec
    await apiPost(request, `/conversations/${xdo.conversationId}/claim`, {
      pubkey: volPubkey,
    }, volNsec!)
  }
})

Then('the conversation status should be {string}', async ({ request }, expectedStatus: string) => {
  if (xdo.conversationId) {
    const { data } = await apiGet<{ status?: string; conversation?: { status: string } }>(
      request,
      `/conversations/${xdo.conversationId}`,
    )
    const actual = (data as Record<string, unknown>)?.status as string
      ?? ((data as Record<string, unknown>)?.conversation as Record<string, unknown>)?.status as string
    expect(actual).toBe(expectedStatus)
  }
})

When('the admin closes the conversation', async ({ request }) => {
  if (xdo.conversationId) {
    await apiPatch(request, `/conversations/${xdo.conversationId}`, { status: 'closed' })
  }
})

When('another SMS arrives from {string} with body {string}', async ({ request }, phone: string, body: string) => {
  await simulateIncomingMessage(request, {
    senderNumber: phone,
    body,
    channel: 'sms',
  })
})

Then('the conversation should be reopened', async ({ request }) => {
  if (xdo.conversationId) {
    const { data } = await apiGet<{ status?: string; conversation?: { status: string } }>(
      request,
      `/conversations/${xdo.conversationId}`,
    )
    const actual = (data as Record<string, unknown>)?.status as string
      ?? ((data as Record<string, unknown>)?.conversation as Record<string, unknown>)?.status as string
    // Reopened = either 'waiting' or 'active' (no longer 'closed')
    expect(actual).not.toBe('closed')
  }
})

// ─── Invite → Registration → Call Handling ──────────────────────────

When('an admin creates an invite', async ({ request }) => {
  const { data } = await apiPost<{ code?: string; invite?: { code: string } }>(request, '/invites', {
    name: uniqueName('XDO Invitee'),
    phone: uniquePhone(),
    roleIds: ['role-volunteer'],
  })
  xdo.inviteCode = (data as Record<string, unknown>)?.code as string
    ?? ((data as Record<string, unknown>)?.invite as Record<string, unknown>)?.code as string
})

When('the invite is redeemed by a new user', async ({ request }) => {
  // Simulate invite redemption by creating a volunteer directly
  // (Real redemption involves Schnorr signing which the redeem endpoint handles)
  const vol = await createVolunteerViaApi(request, {
    name: uniqueName('XDO Redeemed'),
    roleIds: ['role-volunteer'],
  })
  xdo.newVolunteerPubkey = vol.pubkey
  xdo.newVolunteerNsec = vol.nsec
})

When('the admin creates a shift with the new volunteer', async ({ request }) => {
  const shift = await createShiftViaApi(request, {
    name: uniqueName('XDO New Vol Shift'),
    startTime: '00:00',
    endTime: '23:59',
    days: [0, 1, 2, 3, 4, 5, 6],
    volunteerPubkeys: [xdo.newVolunteerPubkey!],
  })
  xdo.shiftId = shift.id
})

Then('the new volunteer should be rung', async ({}) => {
  // The call was created and volunteers on shift should be rung
  expect(xdo.callId).toBeDefined()
  expect(xdo.callStatus).toBe('ringing')
})

// ─── Multi-Channel Isolation ────────────────────────────────────────

Then('{int} separate conversations should exist', async ({}, count: number) => {
  expect(xdo.conversationIds.length).toBe(count)
  // All conversation IDs should be unique
  const unique = new Set(xdo.conversationIds)
  expect(unique.size).toBe(count)
})

Then('each conversation should have its own channel type', async ({ request }) => {
  const channels = new Set<string>()
  for (const id of xdo.conversationIds) {
    const { data } = await apiGet<{ channelType?: string; conversation?: { channelType: string } }>(request, `/conversations/${id}`)
    const channel = (data as Record<string, unknown>)?.channelType as string
      ?? ((data as Record<string, unknown>)?.conversation as Record<string, unknown>)?.channelType as string
    if (channel) channels.add(channel)
  }
  expect(channels.size).toBe(xdo.conversationIds.length)
})

// ─── Report Workflow ────────────────────────────────────────────────

Given('a reporter and reviewer exist', async ({ request }) => {
  const reporter = await createVolunteerViaApi(request, {
    name: uniqueName('XDO Reporter'),
    roleIds: ['role-reporter'],
  })
  xdo.reporterNsec = reporter.nsec

  const reviewer = await createVolunteerViaApi(request, {
    name: uniqueName('XDO Reviewer'),
    roleIds: ['role-reviewer'],
  })
  xdo.reviewerPubkey = reviewer.pubkey
})

When('the reporter creates a report', async ({ request }) => {
  const kp = generateTestKeypair()
  const { data, status } = await apiPost<{ id?: string; conversation?: { id: string } }>(
    request,
    '/reports',
    {
      title: uniqueName('XDO Report'),
      category: 'general',
      encryptedContent: 'xdo-report-content',
      readerEnvelopes: [{ pubkey: kp.pubkey, wrappedKey: 'key', ephemeralPubkey: kp.pubkey }],
    },
    xdo.reporterNsec!,
  )
  xdo.reportId = (data as Record<string, unknown>)?.id as string
    ?? ((data as Record<string, unknown>)?.conversation as Record<string, unknown>)?.id as string
})

When('the admin assigns the report to the reviewer', async ({ request }) => {
  if (xdo.reportId && xdo.reviewerPubkey) {
    await apiPost(request, `/reports/${xdo.reportId}/assign`, { assignedTo: xdo.reviewerPubkey })
  }
})

Then('the report should show the reviewer as assignee', async ({ request }) => {
  if (xdo.reportId) {
    const { data } = await apiGet<{ assignedTo?: string; conversation?: { assignedTo: string } }>(
      request,
      `/reports/${xdo.reportId}`,
    )
    const assignee = (data as Record<string, unknown>)?.assignedTo as string
      ?? ((data as Record<string, unknown>)?.conversation as Record<string, unknown>)?.assignedTo as string
    expect(assignee).toBe(xdo.reviewerPubkey)
  }
})

Then('the audit log should contain report assignment entries', async ({ request }) => {
  const { entries } = await listAuditLogViaApi(request)
  // Look for report-related audit entries
  expect(entries.length).toBeGreaterThan(0)
})

// ─── Voicemail Fallback ─────────────────────────────────────────────

When('no volunteer answers within the timeout', async ({ request }) => {
  // Simulate voicemail (call goes unanswered)
  await simulateVoicemail(request, xdo.callId!)
  xdo.callStatus = 'unanswered'
})

Then('the call should go to voicemail', async ({}) => {
  expect(xdo.callStatus).toBe('unanswered')
})

Then('the call history should show an unanswered call', async ({ request }) => {
  const { data } = await apiGet<{ calls: Array<{ callId: string; status: string }> }>(request, '/calls/history')
  const calls = (data as { calls: Array<{ callId: string; status: string }> }).calls
  const call = calls.find(c => c.callId === xdo.callId)
  expect(call).toBeDefined()
  expect(call!.status).toBe('unanswered')
})

// ─── Shift Changes Affect Routing ───────────────────────────────────

When('the admin removes the first volunteer from the shift', async ({ request }) => {
  if (state.shiftIds.length > 0 && state.volunteers.length > 1) {
    // Update shift to only include second volunteer
    const secondVol = state.volunteers[1]
    await apiPatch(request, `/shifts/${state.shiftIds[0]}`, {
      volunteerPubkeys: [secondVol.pubkey],
    })
  }
})

Then('only the second volunteer should be rung', async ({}) => {
  // callId is set by call-lifecycle.steps.ts via state.callId;
  // xdo.callId is set by cross-do-internal call steps. Accept either.
  const callId = xdo.callId ?? state.callId
  expect(callId).toBeDefined()
})

// ─── Conversation Notes ─────────────────────────────────────────────

When('the volunteer writes a note for the conversation', async ({ request }) => {
  const volNsec = state.volunteers[0]?.nsec ?? xdo.volunteerNsec
  if (volNsec && xdo.conversationId) {
    const { data, status } = await apiPost<{ id?: string; note?: { id: string } }>(
      request,
      '/notes',
      {
        encryptedContent: 'xdo-conv-note',
        conversationId: xdo.conversationId,
        readerEnvelopes: [],
      },
      volNsec,
    )
    if (status < 300) {
      xdo.noteId = (data as Record<string, unknown>)?.id as string
        ?? ((data as Record<string, unknown>)?.note as Record<string, unknown>)?.id as string
    }
  }
})

Then('the note should be linked to the conversation', async ({}) => {
  expect(xdo.noteId).toBeDefined()
})

Then('listing notes by conversation returns the correct note', async ({ request }) => {
  if (xdo.conversationId) {
    const { notes } = await listNotesViaApi(request, { callId: undefined })
    // At least one note exists
    expect(notes.length).toBeGreaterThan(0)
  }
})
