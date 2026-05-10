/**
 * Backend BDD step definitions for Signal bridge registration API routes.
 *
 * Steps use a mock bridge URL (a real external domain that the service validates
 * for SSRF but whose HTTP calls we don't actually make in tests — the bridge
 * call will fail gracefully, and we test the state machine and permission layer).
 */
import { expect } from '@playwright/test'
import { Given, When, Then, getState, setState } from './fixtures'
import {
  ADMIN_SEED,
  apiGet,
  apiPost,
  apiDelete,
  createUserViaApi,
  createRoleViaApi,
  uniqueName,
} from '../../api-helpers'

// ── Types ──────────────────────────────────────────────────────────────────

interface SignalRegState {
  volunteerSeed?: string
  lastStatus: number
  lastData: unknown
  registrationId?: string
}

const KEY = 'signalReg'

function getSR(world: Record<string, unknown>): SignalRegState {
  const existing = getState<Partial<SignalRegState>>(world, KEY)
  return { lastStatus: 0, lastData: null, ...existing }
}

// Mock bridge URL — valid external address that passes SSRF check.
// Actual HTTP call to the bridge will get ECONNREFUSED, but the route layer
// stores the record before calling the bridge for the SMS path.
// For tests that don't need the bridge to respond, we use a real external host.
const MOCK_BRIDGE_URL = 'https://signal-bridge.example.com'
const MOCK_PHONE = '+15005550001'

// ── Setup steps ────────────────────────────────────────────────────────────

Given('I am a signal registration admin', async ({ world }) => {
  const state = getSR(world)
  state.volunteerSeed = undefined
  setState(world, KEY, state)
})

Given('I am a signal registration volunteer', async ({ request, world }) => {
  const vol = await createUserViaApi(request, { name: uniqueName('sig-vol') })
  const state = getSR(world)
  state.volunteerSeed = vol.seedHex
  setState(world, KEY, state)
})

Given('a Signal registration is in progress', async ({ request, world, workerHub }) => {
  // Start a registration so tests have a registrationId to work with.
  // The bridge call will fail (bridge isn't real), so we catch the error response
  // and just verify a record was created.
  const { status, data } = await apiPost(
    request,
    '/provider-setup/signal/register',
    {
      bridgeUrl: MOCK_BRIDGE_URL,
      phoneNumber: MOCK_PHONE,
      method: 'sms',
      hubId: workerHub,
    },
    ADMIN_SEED,
  )
  const state = getSR(world)
  // If bridge is unavailable the route returns 502 — record may still exist
  // For test isolation, store whatever ID we got (or 'none' if we got an error)
  if (status === 200 && data && typeof data === 'object' && 'id' in data) {
    state.registrationId = (data as Record<string, string>).id
  }
  setState(world, KEY, state)
})

// ── When steps ─────────────────────────────────────────────────────────────

When('I POST to start Signal registration with SMS method', async ({ request, world, workerHub }) => {
  const seed = getSR(world).volunteerSeed ?? ADMIN_SEED
  const { status, data } = await apiPost(
    request,
    '/provider-setup/signal/register',
    {
      bridgeUrl: MOCK_BRIDGE_URL,
      phoneNumber: MOCK_PHONE,
      method: 'sms',
      hubId: workerHub,
    },
    seed,
  )
  const state = getSR(world)
  state.lastStatus = status
  state.lastData = data
  if (status === 200 && data && typeof data === 'object' && 'id' in data) {
    state.registrationId = (data as Record<string, string>).id
  }
  setState(world, KEY, state)
})

When('I POST to start Signal registration with voice method', async ({ request, world, workerHub }) => {
  const seed = getSR(world).volunteerSeed ?? ADMIN_SEED
  const { status, data } = await apiPost(
    request,
    '/provider-setup/signal/register',
    {
      bridgeUrl: MOCK_BRIDGE_URL,
      phoneNumber: MOCK_PHONE,
      method: 'voice',
      hubId: workerHub,
    },
    seed,
  )
  const state = getSR(world)
  state.lastStatus = status
  state.lastData = data
  if (status === 200 && data && typeof data === 'object' && 'id' in data) {
    state.registrationId = (data as Record<string, string>).id
  }
  setState(world, KEY, state)
})

When('I POST to start Signal registration with a loopback bridge URL', async ({ request, world, workerHub }) => {
  const seed = getSR(world).volunteerSeed ?? ADMIN_SEED
  const { status, data } = await apiPost(
    request,
    '/provider-setup/signal/register',
    {
      bridgeUrl: 'http://127.0.0.1:8080',
      phoneNumber: MOCK_PHONE,
      method: 'sms',
      hubId: workerHub,
    },
    seed,
  )
  const state = getSR(world)
  state.lastStatus = status
  state.lastData = data
  setState(world, KEY, state)
})

When('I POST to verify Signal registration with a valid code', async ({ request, world }) => {
  const sr = getSR(world)
  if (!sr.registrationId) {
    // No registration to verify — mark as failed step
    sr.lastStatus = 404
    setState(world, KEY, sr)
    return
  }
  const seed = sr.volunteerSeed ?? ADMIN_SEED
  const { status, data } = await apiPost(
    request,
    '/provider-setup/signal/verify',
    { registrationId: sr.registrationId, code: '123456' },
    seed,
  )
  sr.lastStatus = status
  sr.lastData = data
  setState(world, KEY, sr)
})

When('I POST to verify Signal registration with a wrong code', async ({ request, world }) => {
  const sr = getSR(world)
  if (!sr.registrationId) {
    sr.lastStatus = 404
    setState(world, KEY, sr)
    return
  }
  const seed = sr.volunteerSeed ?? ADMIN_SEED
  const { status, data } = await apiPost(
    request,
    '/provider-setup/signal/verify',
    { registrationId: sr.registrationId, code: '000000' },
    seed,
  )
  sr.lastStatus = status
  sr.lastData = data
  setState(world, KEY, sr)
})

When('I GET the Signal registration status by id', async ({ request, world }) => {
  const sr = getSR(world)
  const seed = sr.volunteerSeed ?? ADMIN_SEED
  const id = sr.registrationId ?? 'unknown'
  const { status, data } = await apiGet(
    request,
    `/provider-setup/signal/status?registrationId=${id}`,
    seed,
  )
  sr.lastStatus = status
  sr.lastData = data
  setState(world, KEY, sr)
})

When('I DELETE to unregister Signal', async ({ request, world }) => {
  const sr = getSR(world)
  const seed = sr.volunteerSeed ?? ADMIN_SEED
  if (!sr.registrationId) {
    sr.lastStatus = 404
    setState(world, KEY, sr)
    return
  }
  const { status, data } = await apiDelete(
    request,
    `/provider-setup/signal/unregister?registrationId=${sr.registrationId}`,
    seed,
  )
  sr.lastStatus = status
  sr.lastData = data
  setState(world, KEY, sr)
})

// ── Then steps ─────────────────────────────────────────────────────────────

Then('the signal registration response is {int}', ({ world }, expected: number) => {
  expect(getSR(world).lastStatus).toBe(expected)
})

Then('the registration status is {string}', ({ world }, expectedStatus: string) => {
  const data = getSR(world).lastData as Record<string, unknown>
  expect(data.status).toBe(expectedStatus)
})

Then('the registration has a masked phone number', ({ world }) => {
  const data = getSR(world).lastData as Record<string, unknown>
  expect(data).toHaveProperty('phoneNumberMasked')
  const masked = data.phoneNumberMasked as string
  // Masked format: ****XXXX (only last 4 digits visible)
  expect(masked).toMatch(/^\*{4}\d{4}$/)
  // Raw phone number must NOT appear
  expect(masked).not.toContain('+15005550001')
})
