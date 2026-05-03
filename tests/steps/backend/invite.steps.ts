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
  ADMIN_NSEC,
} from '../../api-helpers'
import { schnorr } from '@noble/curves/secp256k1.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { hexToBytes, bytesToHex } from '@noble/hashes/utils.js'
import { utf8ToBytes } from '@noble/ciphers/utils.js'
import { nip19, getPublicKey } from 'nostr-tools'

// ── State ──────────────────────────────────────────────────────────���

interface InviteTestState {
  inviteCode?: string
  rateLimitResponses: number[]
  volunteerNsec?: string
}

const STATE_KEY = 'invite_test'

function getS(world: Record<string, unknown>): InviteTestState {
  return getState<InviteTestState>(world, STATE_KEY)
}

Before(async ({ world }) => {
  setState<InviteTestState>(world, STATE_KEY, { rateLimitResponses: [] })
})

const BASE_URL = process.env.TEST_HUB_URL || 'http://localhost:3000'
const AUTH_PREFIX = 'llamenos:auth:'

// ── Helpers ─────────────────────────────────────────────────────────

function nsecToSkHex(nsec: string): string {
  const decoded = nip19.decode(nsec)
  if (decoded.type !== 'nsec') throw new Error('Invalid nsec')
  return bytesToHex(decoded.data as Uint8Array)
}

function createRedeemAuth(nsec: string): { pubkey: string; timestamp: number; token: string } {
  const skHex = nsecToSkHex(nsec)
  const pubkey = getPublicKey(hexToBytes(skHex))
  const timestamp = Date.now()
  const message = `${AUTH_PREFIX}${pubkey}:${timestamp}:POST:/api/invites/redeem`
  const messageHash = sha256(utf8ToBytes(message))
  const sig = schnorr.sign(messageHash, hexToBytes(skHex))
  return { pubkey, timestamp, token: bytesToHex(sig) }
}

// ── Given ───────────────────────────────────��───────────────────────

Given('an invite exists for {string} with phone {string}', async ({ request, world }, name: string, phone: string) => {
  const s = getS(world)
  const res = await apiPost<{ invite: { code: string } }>(request, '/invites', {
    name, phone, roleIds: ['role-volunteer'],
  }, ADMIN_NSEC)
  expect(res.status).toBe(201)
  s.inviteCode = res.data.invite.code
})

Given('the invite has been redeemed by a user', async ({ request, world }) => {
  const s = getS(world)
  expect(s.inviteCode).toBeDefined()
  const kp = generateTestKeypair()
  const auth = createRedeemAuth(kp.nsec)
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
  }, ADMIN_NSEC)
  setLastResponse(world, res)
  if (res.status === 201 && (res.data as Record<string, unknown>)?.invite) {
    s.inviteCode = (res.data as { invite: { code: string } }).invite.code
  }
})

When('the invite code is validated', async ({ request, world }) => {
  const s = getS(world)
  expect(s.inviteCode).toBeDefined()
  const res = await request.get(`${BASE_URL}/api/invites/validate/${s.inviteCode}`, {
    headers: { 'Content-Type': 'application/json' },
  })
  const data = res.ok() ? await res.json().catch(() => null) : null
  setLastResponse(world, { status: res.status(), data })
})

When('a random UUID is validated as an invite', async ({ request, world }) => {
  const res = await request.get(`${BASE_URL}/api/invites/validate/${crypto.randomUUID()}`, {
    headers: { 'Content-Type': 'application/json' },
  })
  const data = res.ok() ? await res.json().catch(() => null) : null
  setLastResponse(world, { status: res.status(), data })
})

When('a new user redeems the invite', async ({ request, world }) => {
  const s = getS(world)
  expect(s.inviteCode).toBeDefined()
  const kp = generateTestKeypair()
  const auth = createRedeemAuth(kp.nsec)
  const res = await request.post(`${BASE_URL}/api/invites/redeem`, {
    headers: { 'Content-Type': 'application/json' },
    data: { code: s.inviteCode, ...auth },
  })
  const data = res.ok() ? await res.json().catch(() => null) : null
  setLastResponse(world, { status: res.status(), data })
})

When('the admin lists invites', async ({ request, world }) => {
  setLastResponse(world, await apiGet(request, '/invites', ADMIN_NSEC))
})

When('the admin revokes the invite', async ({ request, world }) => {
  const s = getS(world)
  expect(s.inviteCode).toBeDefined()
  setLastResponse(world, await apiDelete(request, `/invites/${s.inviteCode}`, ADMIN_NSEC))
})

When('a client floods invite validation {int} times', async ({ request, world }, count: number) => {
  const s = getS(world)
  for (let i = 0; i < count; i++) {
    const res = await request.get(`${BASE_URL}/api/invites/validate/${crypto.randomUUID()}`, {
      headers: { 'Content-Type': 'application/json' },
    })
    s.rateLimitResponses.push(res.status())
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
    headers: { 'Content-Type': 'application/json' },
  })
  const data = await res.json().catch(() => null)
  expect(data?.valid).toBe(false)
})
