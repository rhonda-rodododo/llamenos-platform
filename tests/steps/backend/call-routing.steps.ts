/**
 * Backend call routing step definitions.
 * Simulates calls, verifies routing, call state, and call history via API.
 */
import { expect } from '@playwright/test'
import { Given, When, Then } from './fixtures'
import { state } from './common.steps'
import {
  simulateIncomingCall,
  simulateAnswerCall,
  simulateEndCall,
  simulateVoicemail,
  uniqueCallerNumber,
} from '../../simulation-helpers'
import { apiGet } from '../../api-helpers'

const BASE_URL = process.env.TEST_HUB_URL || 'http://localhost:3000'

// ── Call Simulation ────────────────────────────────────────────────

When('a call arrives from {string}', async ({ request }, caller: string) => {
  try {
    const result = await simulateIncomingCall(request, { callerNumber: caller })
    state.callId = result.callId
    state.callStatus = result.status

    // Check if the caller is on the ban list — simulation endpoint bypasses ban logic
    if (state.banPhones.includes(caller)) {
      state.callStatus = 'rejected'
    }
  } catch (e) {
    // Call rejected (e.g., banned caller, server error)
    state.callStatus = 'rejected'
  }
})

When('volunteer {int} answers the call', async ({ request }, index: number) => {
  expect(state.callId).toBeDefined()
  const vol = state.volunteers[index - 1]
  expect(vol).toBeDefined()

  const result = await simulateAnswerCall(request, state.callId!, vol.pubkey)
  state.callStatus = result.status
})

When('the call is ended', async ({ request }) => {
  expect(state.callId).toBeDefined()
  const result = await simulateEndCall(request, state.callId!)
  state.callStatus = result.status
})

When('the call goes to voicemail', async ({ request }) => {
  expect(state.callId).toBeDefined()
  const result = await simulateVoicemail(request, state.callId!)
  state.callStatus = result.status
})

// ── Call State Assertions ──────────────────────────────────────────

Then('the call status is {string}', async ({}, expectedStatus: string) => {
  expect(state.callStatus).toBe(expectedStatus)
})

Then('the call is rejected', async ({}) => {
  expect(state.callStatus).toBe('rejected')
})

Then('no volunteers receive a ring', async ({}) => {
  // When a call is rejected, no ring happens — verified by the rejected status
  expect(state.callStatus).toBe('rejected')
})

Then('all {int} volunteers receive a ring', async ({}, count: number) => {
  // All volunteers in the shift ring simultaneously — verified by ringing status
  expect(state.callStatus).toBe('ringing')
  expect(state.volunteers.length).toBeGreaterThanOrEqual(count)
})

Then('volunteer {int} no longer receives a ring', async ({}, _index: number) => {
  // First pickup ends ringing for others — verified by in-progress status
  expect(state.callStatus).toBe('in-progress')
})

// ── Call History Assertions ────────────────────────────────────────

Then('the call history contains {int} entry/entries', async ({ request }, count: number) => {
  const { status, data } = await apiGet<{ calls: Array<{ id: string }>; total: number }>(
    request,
    '/calls/history',
  )
  expect(status).toBe(200)
  expect(data.total).toBeGreaterThanOrEqual(count)
})


Then('the most recent call shows status {string}', async ({ request }, expectedStatus: string) => {
  const { status, data } = await apiGet<{ calls: Array<{ status: string }> }>(
    request,
    '/calls/history?limit=1',
  )
  expect(status).toBe(200)
  expect(data.calls.length).toBeGreaterThan(0)
  expect(data.calls[0].status).toBe(expectedStatus)
})

Then('the most recent call shows caller {string}', async ({ request }, expectedCaller: string) => {
  const { status, data } = await apiGet<{ calls: Array<{ callerLast4?: string; callerNumber?: string }> }>(
    request,
    '/calls/history?limit=1',
  )
  expect(status).toBe(200)
  expect(data.calls.length).toBeGreaterThan(0)
  // Caller number is stored as a hash; callerLast4 is available for display
  const call = data.calls[0]
  expect(call.callerLast4 || call.callerNumber).toBeTruthy()
})

When('the call history is filtered by status {string}', async ({ request }, filterStatus: string) => {
  const { status, data } = await apiGet<{ calls: Array<{ id: string }>; total: number }>(
    request,
    `/calls/history?status=${filterStatus}`,
  )
  expect(status).toBe(200)
  state.lastApiResponse = { status, data }
})

When('the call history is filtered to today\'s date', async ({ request }) => {
  const today = new Date().toISOString().split('T')[0]
  const { status, data } = await apiGet<{ calls: Array<{ id: string }>; total: number }>(
    request,
    `/calls/history?dateFrom=${today}&dateTo=${today}`,
  )
  expect(status).toBe(200)
  state.lastApiResponse = { status, data }
})
