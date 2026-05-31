/**
 * Invite lifecycle step definitions.
 * Tests invite creation, validation, redemption, revocation, and rate limiting.
 */
import { expect } from '@playwright/test'
import { Given, When, Then, Before, getState, setState } from './fixtures'
import { setLastResponse, getSharedState } from './shared-state'
import {
  apiGet,
  apiPost,
  apiDelete,
  createUserViaApi,
  generateTestKeypair,
  ADMIN_SEED,
} from '../../api-helpers'
import { ed25519 } from '@noble/curves/ed25519.js'
import { hexToBytes, bytesToHex, utf8ToBytes } from '@shared/encoding'
import { LABEL_DEVICE_AUTH } from '@shared/crypto-labels'

// ── State ──────────────────────────────────────────────────────────���

interface InviteTestState {
  inviteCode?: string
  rateLimitResponses: number[]
  volunteerNsec?: string
  /** Unique per-scenario fake IP so validation calls don't share the 'unknown' rate limit bucket. */
  scenarioIp: string
}

const STATE_KEY = 'invite_test'

function getS(world: Record<string, unknown>): InviteTestState {
  return getState<InviteTestState>(world, STATE_KEY)
}

const BASE_URL = process.env.TEST_HUB_URL || 'http://localhost:3000'

Before(async ({ world }) => {
  // Assign a unique fake IP per scenario so all validation calls use an isolated
  // rate limit bucket instead of the shared 'unknown' bucket (which fills up across
  // scenarios when CF-Connecting-IP is absent and causes spurious 429s).
  const scenarioIp = `10.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`
  setState<InviteTestState>(world, STATE_KEY, { rateLimitResponses: [], scenarioIp })
})
// ── Helpers ─────────────────────────────────────────────────────────

function createRedeemAuth(seedHex: string): { pubkey: string; timestamp: number; token: string } {
  const seedBytes = hexToBytes(seedHex)
  const pubkey = bytesToHex(ed25519.getPublicKey(seedBytes))
  const timestamp = Date.now()
  const message = utf8ToBytes(`${LABEL_DEVICE_AUTH}:${pubkey}:${timestamp}:POST:/api/invites/redeem`)
  const sig = ed25519.sign(message, seedBytes)
  return { pubkey, timestamp, token: bytesToHex(sig) }
}

// ── Given ───────────────────────────────────��───────────────────────

Given('an invite exists for {string} with phone {string}', async ({ request, world }, name: string, phone: string) => {
  const s = getS(world)
  const res = await apiPost<{ invite: { code: string } }>(request, '/invites', {
    name, phone, roleIds: ['role-volunteer'],
  }, ADMIN_SEED)
  expect(res.status).toBe(201)
  s.inviteCode = res.data.invite.code
})

Given('the invite has been redeemed by a user', async ({ request, world }) => {
  const s = getS(world)
  expect(s.inviteCode).toBeDefined()
  const kp = generateTestKeypair()
  const auth = createRedeemAuth(kp.seedHex)
  const res = await request.post(`${BASE_URL}/api/invites/redeem`, {
    headers: { 'Content-Type': 'application/json' },
    data: { code: s.inviteCode, ...auth },
  })
  expect(res.status()).toBe(200)
})

Given('a registered volunteer user', async ({ request, world }) => {
  const vol = await createUserViaApi(request, { name: `Invite Vol ${Date.now()}` })
  getS(world).volunteerNsec = vol.nsec
})

// ── When ────────────────────────────────────────────────────────────

When('the admin creates an invite for {string} with phone {string}', async ({ request, world }, name: string, phone: string) => {
  const s = getS(world)
  const res = await apiPost<{ invite: { code: string } }>(request, '/invites', {
    name, phone, roleIds: ['role-volunteer'],
  }, ADMIN_SEED)
  setLastResponse(world, res)
  if (res.status === 201 && (res.data as Record<string, unknown>)?.invite) {
    s.inviteCode = (res.data as { invite: { code: string } }).invite.code
  }
})

When('the invite code is validated', async ({ request, world }) => {
  const s = getS(world)
  expect(s.inviteCode).toBeDefined()
  const res = await request.get(`${BASE_URL}/api/invites/validate/${s.inviteCode}`, {
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': s.scenarioIp },
  })
  const data = res.ok() ? await res.json().catch(() => null) : null
  setLastResponse(world, { status: res.status(), data })
})

When('a random UUID is validated as an invite', async ({ request, world }) => {
  const s = getS(world)
  const res = await request.get(`${BASE_URL}/api/invites/validate/${crypto.randomUUID()}`, {
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': s.scenarioIp },
  })
  const data = res.ok() ? await res.json().catch(() => null) : null
  setLastResponse(world, { status: res.status(), data })
})

When('a new user redeems the invite', async ({ request, world }) => {
  const s = getS(world)
  expect(s.inviteCode).toBeDefined()
  const kp = generateTestKeypair()
  const auth = createRedeemAuth(kp.seedHex)
  const res = await request.post(`${BASE_URL}/api/invites/redeem`, {
    headers: { 'Content-Type': 'application/json' },
    data: { code: s.inviteCode, ...auth },
  })
  const data = res.ok() ? await res.json().catch(() => null) : null
  setLastResponse(world, { status: res.status(), data })
})

When('the admin lists invites', async ({ request, world }) => {
  setLastResponse(world, await apiGet(request, '/invites', ADMIN_SEED))
})

When('the admin revokes the invite', async ({ request, world }) => {
  const s = getS(world)
  const crudState = getState<{ inviteCode?: string }>(world, 'crud')
  const inviteCode = s.inviteCode ?? crudState?.inviteCode
  expect(inviteCode).toBeDefined()
  setLastResponse(world, await apiDelete(request, `/invites/${inviteCode}`))
})

When('a client floods invite validation {int} times', async ({ request, world }, count: number) => {
  // Use a unique fake IP per scenario so each parallel worker gets its own rate limit bucket.
  // The server rate-limits invite validation by hashed IP (CF-Connecting-IP header).
  const fakeIp = `10.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`
  const s = getS(world)
  const shared = getSharedState(world)
  shared.floodResponses = []
  for (let i = 0; i < count; i++) {
    const res = await request.get(`${BASE_URL}/api/invites/validate/${crypto.randomUUID()}`, {
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': fakeIp },
    })
    s.rateLimitResponses.push(res.status())
    shared.floodResponses.push(res.status())
  }
  setLastResponse(world, { status: s.rateLimitResponses[s.rateLimitResponses.length - 1], data: null })
})

When('the volunteer tries to create an invite', async ({ request, world }) => {
  const s = getS(world)
  expect(s.volunteerNsec).toBeDefined()
  setLastResponse(world, await apiPost(request, '/invites', {
    name: 'Unauthorized Invite', phone: '+15559999999', roleIds: ['role-volunteer'],
  }, s.volunteerNsec!))
})

// ── Then ─────────────────��──────────────────────────────────────────

Then('the invite has a valid UUID code', async ({ world }) => {
  const s = getS(world)
  expect(s.inviteCode).toBeDefined()
  expect(s.inviteCode).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
})

Then('the invite has an expiration date', async ({ world }) => {
  const resp = getSharedState(world).lastResponse
  expect(resp).toBeDefined()
  const data = resp!.data as { invite: { expiresAt: string } }
  expect(data.invite.expiresAt).toBeDefined()
  expect(new Date(data.invite.expiresAt).getTime()).toBeGreaterThan(Date.now())
})

Then('the invite is valid', async ({ world }) => {
  const resp = getSharedState(world).lastResponse
  expect(resp).toBeDefined()
  expect((resp!.data as { valid: boolean }).valid).toBe(true)
})

Then('the invite is not valid with error {string}', async ({ world }, error: string) => {
  const resp = getSharedState(world).lastResponse
  expect(resp).toBeDefined()
  const data = resp!.data as { valid: boolean; error?: string }
  expect(data.valid).toBe(false)
  expect(data.error).toBe(error)
})

Then('the invite list is not empty', async ({ world }) => {
  const resp = getSharedState(world).lastResponse
  expect(resp).toBeDefined()
  expect((resp!.data as { invites: unknown[] }).invites.length).toBeGreaterThan(0)
})

Then('the invite code is no longer valid', async ({ request, world }) => {
  const s = getS(world)
  expect(s.inviteCode).toBeDefined()
  const res = await request.get(`${BASE_URL}/api/invites/validate/${s.inviteCode}`, {
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': s.scenarioIp },
  })
  const data = await res.json().catch(() => null)
  expect(data?.valid).toBe(false)
})
