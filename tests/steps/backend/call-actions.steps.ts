/**
 * Backend step definitions for in-call quick actions (ban+hangup, notes).
 *
 * Tests the POST /api/calls/:callId/ban endpoint and note creation
 * during active calls. Uses simulation helpers to set up call state.
 *
 * Note: Phone numbers are HMAC-hashed by CallRouterDO before storage,
 * so ban list verification uses count-based assertions rather than raw phone matching.
 */
import { expect } from '@playwright/test'
import { Given, When, Then } from './fixtures'
import { state } from './common.steps'
import { shared } from './shared-state'
import { apiPost, apiGet, listBansViaApi, listNotesViaApi } from '../../api-helpers'
import {
  simulateIncomingCall,
  simulateAnswerCall,
  uniqueCallerNumber,
} from '../../simulation-helpers'

/** Raw caller number — needed for the "same caller tries again" scenario. */
let lastCallerNumber: string | undefined

/** Ban count before the ban action — used for count-based verification. */
let banCountBefore = 0

// ── Setup ────────────────────────────────────────────────────────

Given(
  'volunteer {int} is on an active call with a unique caller',
  async ({ request }, volIndex: number) => {
    const caller = uniqueCallerNumber()
    lastCallerNumber = caller
    const { callId } = await simulateIncomingCall(request, { callerNumber: caller })
    state.callId = callId
    // Capture ban count before any ban action for delta verification
    const bans = await listBansViaApi(request)
    banCountBefore = bans.length
    await simulateAnswerCall(request, callId, state.volunteers[volIndex].pubkey)
  },
)

// ── Ban + Hangup Actions ─────────────────────────────────────────

When(
  'volunteer {int} bans and hangs up the call',
  async ({ request }, volIndex: number) => {
    expect(state.callId).toBeTruthy()
    const res = await apiPost(
      request,
      `/calls/${state.callId}/ban`,
      {},
      state.volunteers[volIndex].nsec,
    )
    state.lastApiResponse = res
    shared.lastResponse = res
  },
)

When(
  'volunteer {int} bans and hangs up with reason {string}',
  async ({ request }, volIndex: number, reason: string) => {
    expect(state.callId).toBeTruthy()
    const res = await apiPost(
      request,
      `/calls/${state.callId}/ban`,
      { reason },
      state.volunteers[volIndex].nsec,
    )
    state.lastApiResponse = res
    shared.lastResponse = res
  },
)

When(
  'volunteer {int} tries to ban and hang up that call',
  async ({ request }, volIndex: number) => {
    expect(state.callId).toBeTruthy()
    const res = await apiPost(
      request,
      `/calls/${state.callId}/ban`,
      {},
      state.volunteers[volIndex].nsec,
    )
    state.lastApiResponse = res
    shared.lastResponse = res
  },
)

// ── Note Actions ─────────────────────────────────────────────────

When(
  'volunteer {int} creates a note for the active call',
  async ({ request }, volIndex: number) => {
    expect(state.callId).toBeTruthy()
    const res = await apiPost(
      request,
      '/notes',
      {
        callId: state.callId,
        encryptedContent: 'YmRkIHRlc3Qgbm90ZSBmb3IgYWN0aXZlIGNhbGw=', // base64 mock ciphertext
      },
      state.volunteers[volIndex].nsec,
    )
    state.lastApiResponse = res
    shared.lastResponse = res
  },
)

// ── Ban Callback ─────────────────────────────────────────────────

When('the same caller tries to call again', async ({ request }) => {
  expect(lastCallerNumber).toBeTruthy()
  try {
    const result = await simulateIncomingCall(request, {
      callerNumber: lastCallerNumber!,
    })
    // Call was unexpectedly accepted — store for assertion
    state.callId = result.callId
    state.callStatus = result.status
    state.lastApiResponse = { status: 200, data: result }
    shared.lastResponse = { status: 200, data: result }
  } catch {
    // Call was rejected at the telephony layer — expected for banned callers
    state.lastApiResponse = { status: 403, data: { error: 'banned' } }
    shared.lastResponse = { status: 403, data: { error: 'banned' } }
  }
})

// ── Assertions ───────────────────────────────────────────────────

Then('the response should indicate the caller was banned', async () => {
  expect(state.lastApiResponse).toBeTruthy()
  const data = state.lastApiResponse!.data as { banned?: boolean; hungUp?: boolean }
  expect(data.banned).toBe(true)
  expect(data.hungUp).toBe(true)
})

Then('the call status should be {string}', async ({ request }, expectedStatus: string) => {
  expect(state.callId).toBeTruthy()
  const res = await apiGet<{ calls: Array<{ id: string; status: string }> }>(
    request,
    '/calls/history',
  )
  expect(res.status).toBe(200)
  const call = res.data.calls.find(c => c.id === state.callId)
  expect(call).toBeTruthy()
  expect(call!.status).toBe(expectedStatus)
})

Then('the caller should be in the ban list', async ({ request }) => {
  // Phone numbers are HMAC-hashed by CallRouterDO before storage,
  // so we verify by checking the ban count increased after the action
  const bans = await listBansViaApi(request)
  expect(bans.length).toBeGreaterThan(banCountBefore)
})

Then('the ban reason should be {string}', async ({ request }, expectedReason: string) => {
  // Find the most recently added ban and verify its reason
  const bans = await listBansViaApi(request)
  expect(bans.length).toBeGreaterThan(banCountBefore)
  const newestBan = bans[bans.length - 1]
  expect(newestBan.reason).toBe(expectedReason)
})

Then('a note should exist linked to that call ID', async ({ request }) => {
  expect(state.callId).toBeTruthy()
  const { notes } = await listNotesViaApi(request, { callId: state.callId })
  expect(notes.length).toBeGreaterThan(0)
  expect(notes[0].callId).toBe(state.callId)
})

Then('the call should be rejected', async () => {
  expect(state.lastApiResponse).toBeTruthy()
  expect(state.lastApiResponse!.status).not.toBe(200)
})
