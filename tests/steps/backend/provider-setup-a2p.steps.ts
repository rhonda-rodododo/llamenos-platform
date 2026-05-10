/**
 * Backend BDD step definitions for A2P/10DLC compliance registration API routes.
 *
 * Tests verify the state machine (brand -> campaign), PBAC permission enforcement,
 * and provider capability checks. No real provider API calls are made —
 * the service layer uses synthetic SIDs in test mode.
 */
import { expect } from '@playwright/test'
import { Given, When, Then, getState, setState } from './fixtures'
import {
  ADMIN_SEED,
  apiGet,
  apiPost,
  createUserViaApi,
  uniqueName,
} from '../../api-helpers'

// ── Types ──────────────────────────────────────────────────────────────────

interface A2pRegState {
  volunteerSeed?: string
  lastStatus: number
  lastData: unknown
  registrationId?: string
}

const KEY = 'a2pReg'

function getA2P(world: Record<string, unknown>): A2pRegState {
  const existing = getState<Partial<A2pRegState>>(world, KEY)
  return { lastStatus: 0, lastData: null, ...existing }
}

// Minimal valid brand info for tests
const MOCK_BRAND_INFO = {
  entityType: 'NON_PROFIT',
  companyName: 'Test Hotline Org',
  ein: '12-3456789',
  phone: '+15005550001',
  street: '123 Main St',
  city: 'Anytown',
  state: 'CA',
  postalCode: '90210',
  country: 'US',
  email: 'admin@testhotline.example.com',
  vertical: 'EMERGENCY_SERVICES',
}

// Minimal valid campaign info for tests
const MOCK_CAMPAIGN_INFO = {
  useCase: 'LOW_VOLUME',
  description: 'Crisis hotline SMS notifications and alerts',
  helpMessage: 'Reply HELP for support',
  optinMessage: 'You have opted in to receive messages from Test Hotline',
  optoutMessage: 'You have opted out. Reply START to re-subscribe',
  sampleMessages: ['You have an incoming call from the hotline'],
  subscriberOptin: true,
  subscriberOptout: true,
  subscriberHelp: true,
}

// ── Setup steps ────────────────────────────────────────────────────────────

Given('I am an a2p registration admin', async ({ world }) => {
  const state = getA2P(world)
  state.volunteerSeed = undefined
  setState(world, KEY, state)
})

Given('I am an a2p registration volunteer', async ({ request, world }) => {
  const vol = await createUserViaApi(request, { name: uniqueName('a2p-vol') })
  const state = getA2P(world)
  state.volunteerSeed = vol.seedHex
  setState(world, KEY, state)
})

Given('an A2P brand is in pending state', async ({ request, world, workerHub }) => {
  const { status, data } = await apiPost(
    request,
    '/provider-setup/a2p/brand',
    { providerType: 'twilio', brandInfo: MOCK_BRAND_INFO, hubId: workerHub },
    ADMIN_SEED,
  )
  if (status !== 200) throw new Error(`Failed to submit brand: ${status} ${JSON.stringify(data)}`)
  const state = getA2P(world)
  state.registrationId = (data as Record<string, string>).id
  setState(world, KEY, state)
})

Given('an A2P brand is in approved state', async ({ request, world, workerHub }) => {
  // Submit brand (lands in "pending"), then use dev-only endpoint to approve it.
  const { status, data } = await apiPost(
    request,
    '/provider-setup/a2p/brand',
    { providerType: 'twilio', brandInfo: MOCK_BRAND_INFO, hubId: workerHub },
    ADMIN_SEED,
  )
  if (status !== 200) throw new Error(`Failed to submit brand: ${status} ${JSON.stringify(data)}`)
  const registrationId = (data as Record<string, string>).id

  // Directly approve the brand via test helper (no real Twilio poll needed)
  const { status: approveStatus } = await apiPost(
    request,
    '/test-a2p-approve-brand',
    { registrationId },
    ADMIN_SEED,
  )
  if (approveStatus !== 200) throw new Error(`Failed to approve brand: ${approveStatus}`)

  const state = getA2P(world)
  state.registrationId = registrationId
  setState(world, KEY, state)
})

// ── When steps ─────────────────────────────────────────────────────────────

When('I POST to submit A2P brand registration', async ({ request, world, workerHub }) => {
  const seed = getA2P(world).volunteerSeed ?? ADMIN_SEED
  const { status, data } = await apiPost(
    request,
    '/provider-setup/a2p/brand',
    { providerType: 'twilio', brandInfo: MOCK_BRAND_INFO, hubId: workerHub },
    seed,
  )
  const state = getA2P(world)
  state.lastStatus = status
  state.lastData = data
  if (status === 200 && data && typeof data === 'object' && 'id' in data) {
    state.registrationId = (data as Record<string, string>).id
  }
  setState(world, KEY, state)
})

When('I POST to submit A2P brand registration for provider {string}', async ({ request, world, workerHub }, provider: string) => {
  const seed = getA2P(world).volunteerSeed ?? ADMIN_SEED
  const { status, data } = await apiPost(
    request,
    '/provider-setup/a2p/brand',
    { providerType: provider, brandInfo: MOCK_BRAND_INFO, hubId: workerHub },
    seed,
  )
  const state = getA2P(world)
  state.lastStatus = status
  state.lastData = data
  setState(world, KEY, state)
})

When('I POST to submit A2P campaign', async ({ request, world }) => {
  const a2p = getA2P(world)
  const seed = a2p.volunteerSeed ?? ADMIN_SEED
  if (!a2p.registrationId) {
    a2p.lastStatus = 400
    a2p.lastData = { error: 'No registration id in state' }
    setState(world, KEY, a2p)
    return
  }
  const { status, data } = await apiPost(
    request,
    '/provider-setup/a2p/campaign',
    { registrationId: a2p.registrationId, campaignInfo: MOCK_CAMPAIGN_INFO },
    seed,
  )
  a2p.lastStatus = status
  a2p.lastData = data
  setState(world, KEY, a2p)
})

When('I GET the A2P status by registration id', async ({ request, world }) => {
  const a2p = getA2P(world)
  const seed = a2p.volunteerSeed ?? ADMIN_SEED
  const id = a2p.registrationId ?? 'unknown'
  const { status, data } = await apiGet(
    request,
    `/provider-setup/a2p/status?registrationId=${id}`,
    seed,
  )
  a2p.lastStatus = status
  a2p.lastData = data
  setState(world, KEY, a2p)
})

When('I POST to skip A2P registration', async ({ request, world, workerHub }) => {
  const seed = getA2P(world).volunteerSeed ?? ADMIN_SEED
  const { status, data } = await apiPost(
    request,
    '/provider-setup/a2p/skip',
    { providerType: 'twilio', hubId: workerHub },
    seed,
  )
  const state = getA2P(world)
  state.lastStatus = status
  state.lastData = data
  setState(world, KEY, state)
})

// ── Then steps ─────────────────────────────────────────────────────────────

Then('the a2p registration response is {int}', ({ world }, expected: number) => {
  expect(getA2P(world).lastStatus).toBe(expected)
})

Then('the brand status is {string}', ({ world }, expectedStatus: string) => {
  const data = getA2P(world).lastData as Record<string, unknown>
  expect(data.brandStatus).toBe(expectedStatus)
})

Then('the campaign status is {string}', ({ world }, expectedStatus: string) => {
  const data = getA2P(world).lastData as Record<string, unknown>
  expect(data.campaignStatus).toBe(expectedStatus)
})
