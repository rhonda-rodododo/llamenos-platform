/**
 * Recovery Group step definitions (EP09-P2).
 *
 * Tests recovery group enrollment, session lifecycle, share contributions,
 * user envelopes, liveness proofs, and permission enforcement.
 */
import { expect } from '@playwright/test'
import { Given, When, Then, Before, getState, setState } from './fixtures'
import { setLastResponse } from './shared-state'
import { encryptContent, generateContentKey } from '../../crypto-helpers'
import {
  apiGet,
  apiPost,
  createUserViaApi,
  createRoleViaApi,
  ADMIN_SEED,
  seedHexToPubkey,
} from '../../api-helpers'

// Admin pubkey derived from ADMIN_SEED — used to enroll admin as a share holder
// so liveness proof tests can authenticate correctly.
const ADMIN_PUBKEY = seedHexToPubkey(ADMIN_SEED)

// ── State ──────────────────────────────────────────────────────────

interface RecoveryGroupState {
  hubId?: string
  adminSeed: string
  limitedUserSeed?: string
  limitedUserPubkey?: string
  holderSeeds: string[]
  holderPubkeys: string[]
  enrolledShareHolderPubkeys?: string[]
  sessionId?: string
  lastStatus?: number
  lastBody?: Record<string, unknown>
}

const STATE_KEY = 'recovery_group'

function getS(world: Record<string, unknown>): RecoveryGroupState {
  return getState<RecoveryGroupState>(world, STATE_KEY)
}

const BASE_URL = process.env.TEST_HUB_URL ?? 'http://localhost:3000'

Before({ tags: '@backend' }, async ({ world }) => {
  setState<RecoveryGroupState>(world, STATE_KEY, {
    adminSeed: ADMIN_SEED,
    holderSeeds: [],
    holderPubkeys: [],
  })
})

// ── Helpers ────────────────────────────────────────────────────────

function makeShareEnvelopes(count: number, pubkeys: string[] = []): Array<{ holderPubkey: string; shareEnvelope: string }> {
  return Array.from({ length: count }, (_, i) => ({
    holderPubkey: pubkeys[i] ?? `deadbeef${String(i).padStart(56, '0')}`,
    shareEnvelope: encryptContent(`hpke-share-envelope-${i}`, generateContentKey(), 'llamenos:recovery'),
  }))
}

function makeCommitments(count: number): string[] {
  return Array.from({ length: count }, (_, i) =>
    `${'a'.repeat(63)}${i}`,
  )
}

async function enrollRecoveryGroup(
  request: import('@playwright/test').APIRequestContext,
  hubId: string,
  seedHex: string,
  opts: {
    threshold?: number
    totalShares?: number
    shareHolderPubkeys?: string[]
    delayHours?: number
  } = {},
): Promise<{ status: number; data: Record<string, unknown> }> {
  const threshold = opts.threshold ?? 2
  const totalShares = opts.totalShares ?? 3
  const envelopes = makeShareEnvelopes(totalShares, opts.shareHolderPubkeys)
  const commitments = makeCommitments(totalShares)

  return apiPost(request, '/recovery-group/enroll', {
    hubId,
    threshold,
    totalShares,
    groupPublicKey: 'a'.repeat(64),
    shareEnvelopes: envelopes,
    shareCommitments: commitments,
    sigchainLinkHash: 'b'.repeat(64),
    delayHours: opts.delayHours ?? 24,
    emergencyFloorHours: 4,
  }, seedHex)
}

// ── Background ─────────────────────────────────────────────────────

Given('a registered admin user with {string} permission', async ({ world }, _permission: string) => {
  getS(world).adminSeed = ADMIN_SEED
})

Given('a hub is available for recovery group tests', async ({ workerHub, world }) => {
  getS(world).hubId = workerHub
})

// ── Enrollment steps ───────────────────────────────────────────────

When('the admin enrolls a 2-of-3 recovery group for the hub', async ({ request, world }) => {
  const s = getS(world)
  expect(s.hubId).toBeDefined()
  const { status, data } = await enrollRecoveryGroup(request, s.hubId!, s.adminSeed)
  s.lastStatus = status
  s.lastBody = data as Record<string, unknown>
  setLastResponse(world, { status, data })
})

When('the admin enrolls a recovery group with threshold {int} and totalShares {int}', async ({ request, world }, threshold: number, totalShares: number) => {
  const s = getS(world)
  expect(s.hubId).toBeDefined()

  // For invalid combinations (threshold > totalShares), pass as-is to test server validation
  const envelopes = makeShareEnvelopes(totalShares)
  const commitments = makeCommitments(totalShares)

  const { status, data } = await apiPost(request, '/recovery-group/enroll', {
    hubId: s.hubId!,
    threshold,
    totalShares,
    groupPublicKey: 'a'.repeat(64),
    shareEnvelopes: envelopes,
    shareCommitments: commitments,
    sigchainLinkHash: 'b'.repeat(64),
    delayHours: 24,
    emergencyFloorHours: 4,
  }, s.adminSeed)
  s.lastStatus = status
  s.lastBody = data as Record<string, unknown>
  setLastResponse(world, { status, data })
})

When('the admin enrolls a recovery group with mismatched envelope count', async ({ request, world }) => {
  const s = getS(world)
  expect(s.hubId).toBeDefined()

  const { status, data } = await apiPost(request, '/recovery-group/enroll', {
    hubId: s.hubId!,
    threshold: 2,
    totalShares: 3,
    groupPublicKey: 'a'.repeat(64),
    shareEnvelopes: makeShareEnvelopes(2), // mismatch: 2 instead of 3
    shareCommitments: makeCommitments(3),
    sigchainLinkHash: 'b'.repeat(64),
    delayHours: 24,
    emergencyFloorHours: 4,
  }, s.adminSeed)

  s.lastStatus = status
  s.lastBody = data as Record<string, unknown>
  setLastResponse(world, { status, data })
})

When('the admin fetches the recovery group for the hub', async ({ request, world }) => {
  const s = getS(world)
  expect(s.hubId).toBeDefined()
  const { status, data } = await apiGet<Record<string, unknown>>(request, `/recovery-group/${s.hubId!}`, s.adminSeed)
  s.lastStatus = status
  s.lastBody = data
  setLastResponse(world, { status, data })
})

When('the admin enrolls a new 2-of-3 recovery group with different share holders', async ({ request, world }) => {
  const s = getS(world)
  expect(s.hubId).toBeDefined()

  const newHolderPubkeys = [
    'c'.repeat(64),
    'd'.repeat(64),
    'e'.repeat(64),
  ]
  s.enrolledShareHolderPubkeys = newHolderPubkeys

  const { status, data } = await enrollRecoveryGroup(request, s.hubId!, s.adminSeed, {
    threshold: 2,
    totalShares: 3,
    shareHolderPubkeys: newHolderPubkeys,
  })
  s.lastStatus = status
  s.lastBody = data as Record<string, unknown>
  setLastResponse(world, { status, data })
})

Given('a recovery group is enrolled for the hub', async ({ request, world }) => {
  const s = getS(world)
  expect(s.hubId).toBeDefined()

  // Include admin pubkey as first holder so liveness proof tests can authenticate
  // as admin (who has '*' permission and is a registered holder in the DB).
  const holderPubkeys = [
    ADMIN_PUBKEY,
    '0'.repeat(63) + '1',
    '0'.repeat(63) + '2',
  ]
  s.holderPubkeys = holderPubkeys
  s.holderSeeds = [s.adminSeed]

  const { status } = await enrollRecoveryGroup(request, s.hubId!, s.adminSeed, {
    shareHolderPubkeys: holderPubkeys,
  })
  expect(status).toBe(200)
})

// ── Permission steps ───────────────────────────────────────────────

Given('a user without {string} permission', async ({ request, world }, _permission: string) => {
  const s = getS(world)

  const roleSlug = `no-recovery-${Date.now()}`
  await createRoleViaApi(request, {
    name: `No Recovery ${Date.now()}`,
    slug: roleSlug,
    permissions: ['calls:view'],
  })

  const user = await createUserViaApi(request, {
    name: `No Perm User ${Date.now()}`,
    roleIds: [`role-${roleSlug}`],
  })

  s.limitedUserSeed = user.seedHex
  s.limitedUserPubkey = user.pubkey
})

When('that user attempts to enroll a recovery group', async ({ request, world }) => {
  const s = getS(world)
  expect(s.hubId).toBeDefined()
  expect(s.limitedUserSeed).toBeDefined()

  const { status, data } = await enrollRecoveryGroup(request, s.hubId!, s.limitedUserSeed!)
  s.lastStatus = status
  s.lastBody = data as Record<string, unknown>
  setLastResponse(world, { status, data })
})

When('that user fetches the recovery group for the hub', async ({ request, world }) => {
  const s = getS(world)
  expect(s.hubId).toBeDefined()
  expect(s.limitedUserSeed).toBeDefined()

  const { status, data } = await apiGet<Record<string, unknown>>(request, `/recovery-group/${s.hubId!}`, s.limitedUserSeed!)
  s.lastStatus = status
  s.lastBody = data
  setLastResponse(world, { status, data })
})

// ── Anti-enumeration steps ─────────────────────────────────────────

When('an unauthenticated client initiates recovery for a nonexistent user in the hub', async ({ request, world }) => {
  const s = getS(world)
  expect(s.hubId).toBeDefined()

  const res = await request.post(`${BASE_URL}/api/recovery-group/initiate`, {
    data: {
      hubId: s.hubId!,
      userIdentifier: `nonexistent-user-${Date.now()}@nowhere.invalid`,
      newDevicePubkey: 'a'.repeat(64),
    },
    headers: { 'Content-Type': 'application/json' },
  })

  const body = await res.json().catch(() => ({})) as Record<string, unknown>
  s.lastStatus = res.status()
  s.lastBody = body
  if (res.status() === 200 && typeof body.sessionId === 'string') {
    s.sessionId = body.sessionId
  }
  setLastResponse(world, { status: res.status(), data: body })
})

When('an authenticated user contributes a share to session {string}', async ({ request, world }, sessionId: string) => {
  const s = getS(world)
  const { status, data } = await apiPost(request, `/recovery-group/session/${sessionId}/contribute`, {
    encryptedShare: encryptContent('fake-share', generateContentKey(), 'llamenos:recovery'),
    contributorSignature: 'a'.repeat(128),
  }, s.adminSeed)
  s.lastStatus = status
  s.lastBody = data as Record<string, unknown>
  setLastResponse(world, { status, data })
})

// ── User envelope steps ────────────────────────────────────────────

When('an authenticated user stores a recovery envelope for the hub', async ({ request, world }) => {
  const s = getS(world)
  expect(s.hubId).toBeDefined()

  const { status, data } = await apiPost(request, '/recovery-group/user-envelope', {
    hubId: s.hubId!,
    envelope: encryptContent(`puk-seed-envelope-${Date.now()}`, generateContentKey(), 'llamenos:recovery'),
  }, s.adminSeed)
  s.lastStatus = status
  s.lastBody = data as Record<string, unknown>
  setLastResponse(world, { status, data })
})

When('the user stores a different envelope for the same hub', async ({ request, world }) => {
  const s = getS(world)
  expect(s.hubId).toBeDefined()

  const { status, data } = await apiPost(request, '/recovery-group/user-envelope', {
    hubId: s.hubId!,
    envelope: encryptContent(`puk-seed-envelope-v2-${Date.now()}`, generateContentKey(), 'llamenos:recovery'),
  }, s.adminSeed)
  s.lastStatus = status
  s.lastBody = data as Record<string, unknown>
  setLastResponse(world, { status, data })
})

// ── Liveness proof steps ───────────────────────────────────────────

When('a share holder submits a liveness proof for the hub', async ({ request, world }) => {
  const s = getS(world)
  expect(s.hubId).toBeDefined()

  // Use the first enrolled holder's seed (admin, who is also a registered holder)
  const holderSeed = s.holderSeeds[0] ?? s.adminSeed
  const { status, data } = await apiPost(request, '/recovery-group/shares/liveness', {
    hubId: s.hubId!,
    proof: 'a'.repeat(128),
  }, holderSeed)

  s.lastStatus = status
  s.lastBody = data as Record<string, unknown>
  setLastResponse(world, { status, data })
})

When('a non-holder submits a liveness proof for the hub', async ({ request, world }) => {
  const s = getS(world)
  expect(s.hubId).toBeDefined()

  const nonHolder = await createUserViaApi(request, { name: `Non Holder ${Date.now()}` })

  const { status, data } = await apiPost(request, '/recovery-group/shares/liveness', {
    hubId: s.hubId!,
    proof: 'a'.repeat(128),
  }, nonHolder.seedHex)

  s.lastStatus = status
  s.lastBody = data as Record<string, unknown>
  setLastResponse(world, { status, data })
})

// ── Recovery-group-specific assertion steps ────────────────────────
// Note: 'the response status is {int}' lives in assertions.steps.ts (reads shared state)

Then('the response body has {string} equal to true', async ({ world }, key: string) => {
  const s = getS(world)
  expect(s.lastBody?.[key]).toBe(true)
})

Then('the response body has {string} equal to {string}', async ({ world }, key: string, value: string) => {
  const s = getS(world)
  expect(s.lastBody?.[key]).toBe(value)
})

Then('the response body has error containing {string}', async ({ world }, substring: string) => {
  const s = getS(world)
  const error = s.lastBody?.['error']
  expect(typeof error).toBe('string')
  expect(error as string).toContain(substring)
})

Then('the recovery group has threshold {int} and totalShares {int}', async ({ world }, threshold: number, totalShares: number) => {
  const s = getS(world)
  expect(s.lastBody?.['threshold']).toBe(threshold)
  expect(s.lastBody?.['totalShares']).toBe(totalShares)
})

Then('the recovery group has {int} share holders', async ({ world }, count: number) => {
  const s = getS(world)
  const holders = s.lastBody?.['shareHolderLiveness']
  expect(Array.isArray(holders)).toBe(true)
  expect((holders as unknown[]).length).toBe(count)
})

Then('the recovery group has the new share holders', async ({ world }) => {
  const s = getS(world)
  const holders = s.lastBody?.['shareHolderLiveness'] as Array<{ holderPubkey: string }> | undefined
  expect(Array.isArray(holders)).toBe(true)
  expect(holders!.length).toBe(3)
  if (s.enrolledShareHolderPubkeys) {
    const holderPubkeys = holders!.map(h => h.holderPubkey)
    for (const expected of s.enrolledShareHolderPubkeys) {
      expect(holderPubkeys).toContain(expected)
    }
  }
})

Then('the response body has a {string} UUID field', async ({ world }, key: string) => {
  const s = getS(world)
  const value = s.lastBody?.[key]
  expect(typeof value).toBe('string')
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  expect(uuidRegex.test(value as string)).toBe(true)
})
