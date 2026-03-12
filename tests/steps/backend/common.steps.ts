/**
 * Common backend step definitions — server reset, volunteer/shift/ban setup.
 */
import { expect } from '@playwright/test'
import { Given, When, Then, Before } from './fixtures'
import {
  createVolunteerViaApi,
  createShiftViaApi,
  createBanViaApi,
  type CreateVolunteerResult,
} from '../../api-helpers'
import type { RelayCapture } from '../../helpers/relay-capture'
import {
  simulateIncomingCall,
  simulateAnswerCall,
  simulateEndCall,
  uniqueCallerNumber,
} from '../../simulation-helpers'

const BASE_URL = process.env.TEST_HUB_URL || 'http://localhost:3000'
const TEST_SECRET = process.env.DEV_RESET_SECRET || 'test-reset-secret'

/** Shared scenario state — reset before each scenario via Before hook. */
export interface ScenarioState {
  volunteers: Array<CreateVolunteerResult & { onShift?: boolean }>
  shiftIds: string[]
  callId?: string
  callStatus?: string
  conversationId?: string
  messageId?: string
  lastApiResponse?: { status: number; data: unknown }
  banPhones: string[]
  relayCapture?: RelayCapture
}

export let state: ScenarioState

Before(async () => {
  state = {
    volunteers: [],
    shiftIds: [],
    banPhones: [],
  }
})

// ── Server Reset ───────────────────────────────────────────────────

Given('the server is reset', async ({ request }) => {
  const res = await request.post(`${BASE_URL}/api/test-reset`, {
    headers: {
      'Content-Type': 'application/json',
      'X-Test-Secret': TEST_SECRET,
    },
  })
  expect(res.ok()).toBeTruthy()
})

// ── Volunteer Setup ────────────────────────────────────────────────

Given('{int} volunteers are on shift', async ({ request }, count: number) => {
  const volunteers: Array<CreateVolunteerResult & { onShift?: boolean }> = []

  for (let i = 0; i < count; i++) {
    const vol = await createVolunteerViaApi(request, {
      name: `BDD Vol ${Date.now()}-${i}`,
    })
    volunteers.push({ ...vol, onShift: true })
  }

  // Create a shift with all volunteers assigned and covering now
  const pubkeys = volunteers.map(v => v.pubkey)
  const shift = await createShiftViaApi(request, {
    name: `BDD Shift ${Date.now()}`,
    startTime: '00:00',
    endTime: '23:59',
    days: [0, 1, 2, 3, 4, 5, 6],
    volunteerPubkeys: pubkeys,
  })

  state.volunteers = volunteers
  state.shiftIds.push(shift.id)
})

// ── Ban Setup ──────────────────────────────────────────────────────

Given('{string} is on the ban list', async ({ request }, phone: string) => {
  await createBanViaApi(request, { phone, reason: 'BDD test ban' })
  state.banPhones.push(phone)
})

// ── Call Completion Setup ──────────────────────────────────────────

Given('{int} calls were completed today', async ({ request }, count: number) => {
  for (let i = 0; i < count; i++) {
    const caller = uniqueCallerNumber()
    const { callId } = await simulateIncomingCall(request, { callerNumber: caller })
    if (state.volunteers.length > 0) {
      await simulateAnswerCall(request, callId, state.volunteers[0].pubkey)
      await simulateEndCall(request, callId)
    }
  }
})

Given('{int} call went to voicemail today', async ({ request }, count: number) => {
  const { simulateVoicemail } = await import('../../simulation-helpers')
  for (let i = 0; i < count; i++) {
    const caller = uniqueCallerNumber()
    const { callId } = await simulateIncomingCall(request, { callerNumber: caller })
    await simulateVoicemail(request, callId)
  }
})
