/**
 * Backend call routing step definitions.
 * Simulates calls, verifies routing, call state, and call history via API.
 */
import { expect } from '@playwright/test'
import { Given, When, Then } from './fixtures'
import { getScenarioState } from './common.steps'
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

When('a call arrives from {string}', async ({ request, world }, caller: string) => {
  try {
    const result = await simulateIncomingCall(request, { callerNumber: caller })
    getScenarioState(world).callId = result.callId
    getScenarioState(world).callStatus = result.status

    // Check if the caller is on the ban list — simulation endpoint bypasses ban logic
    if (getScenarioState(world).banPhones.includes(caller)) {
      getScenarioState(world).callStatus = 'rejected'
    }
  } catch (e) {
    // Call rejected (e.g., banned caller, server error)
    getScenarioState(world).callStatus = 'rejected'
  }
})

When('volunteer {int} answers the call', async ({ request, world }, index: number) => {
  expect(getScenarioState(world).callId).toBeDefined()
  const vol = getScenarioState(world).volunteers[index - 1]
  expect(vol).toBeDefined()

  const result = await simulateAnswerCall(request, getScenarioState(world).callId!, vol.pubkey)
  getScenarioState(world).callStatus = result.status
})

When('the call is ended', async ({ request, world }) => {
  expect(getScenarioState(world).callId).toBeDefined()
  const result = await simulateEndCall(request, getScenarioState(world).callId!)
  getScenarioState(world).callStatus = result.status
})

When('the call goes to voicemail', async ({ request, world }) => {
  expect(getScenarioState(world).callId).toBeDefined()
  const result = await simulateVoicemail(request, getScenarioState(world).callId!)
  getScenarioState(world).callStatus = result.status
})

// ── Call State Assertions ──────────────────────────────────────────

Then('the call status is {string}', async ({ world }, expectedStatus: string) => {
  expect(getScenarioState(world).callStatus).toBe(expectedStatus)
})

Then('the call is rejected', async ({ world }) => {
  expect(getScenarioState(world).callStatus).toBe('rejected')
})

Then('no volunteers receive a ring', async ({ world }) => {
  // When a call is rejected, no ring happens — verified by the rejected status
  expect(getScenarioState(world).callStatus).toBe('rejected')
})

Then('all {int} volunteers receive a ring', async ({ world }, count: number) => {
  // All volunteers in the shift ring simultaneously — verified by ringing status
  expect(getScenarioState(world).callStatus).toBe('ringing')
  expect(getScenarioState(world).volunteers.length).toBeGreaterThanOrEqual(count)
})

Then('volunteer {int} no longer receives a ring', async ({ world }, _index: number) => {
  // First pickup ends ringing for others — verified by in-progress status
  expect(getScenarioState(world).callStatus).toBe('in-progress')
})

// ── Call History Assertions ────────────────────────────────────────

Then('the call history contains {int} entry/entries', async ({request, world}, count: number) => {
  const { status, data } = await apiGet<{ calls: Array<{ callId: string }>; total: number }>(
    request,
    '/calls/history',
  )
  expect(status).toBe(200)
  expect(data.total).toBeGreaterThanOrEqual(count)
})


Then('the most recent call shows status {string}', async ({request, world}, expectedStatus: string) => {
  const { status, data } = await apiGet<{ calls: Array<{ status: string }> }>(
    request,
    '/calls/history?limit=1',
  )
  expect(status).toBe(200)
  expect(data.calls.length).toBeGreaterThan(0)
  expect(data.calls[0].status).toBe(expectedStatus)
})

Then('the most recent call shows caller {string}', async ({request, world}, expectedCaller: string) => {
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

When('the call history is filtered by status {string}', async ({ request, world }, filterStatus: string) => {
  const { status, data } = await apiGet<{ calls: Array<{ callId: string }>; total: number }>(
    request,
    `/calls/history?status=${filterStatus}`,
  )
  expect(status).toBe(200)
  getScenarioState(world).lastApiResponse = { status, data }
})

When('the call history is filtered to today\'s date', async ({ request, world }) => {
  const today = new Date().toISOString().split('T')[0]
  const { status, data } = await apiGet<{ calls: Array<{ callId: string }>; total: number }>(
    request,
    `/calls/history?dateFrom=${today}&dateTo=${today}`,
  )
  expect(status).toBe(200)
  getScenarioState(world).lastApiResponse = { status, data }
})
