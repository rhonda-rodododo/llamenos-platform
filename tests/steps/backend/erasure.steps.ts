/**
 * Erasure step definitions (EP08).
 * Tests GDPR erasure request lifecycle and admin erasure.
 */
import { expect } from '@playwright/test'
import { Given, When, Then, Before, getState, setState } from './fixtures'
import { setLastResponse, getSharedState } from './shared-state'
import {
  apiGet,
  apiPost,
  apiDelete,
  createUserViaApi,
} from '../../api-helpers'

// ── State ──────────────────────────────────────────────────────────

interface ErasureTestState {
  volunteer?: { seedHex: string; pubkey: string; nsec: string }
  admin?: { seedHex: string; pubkey: string; nsec: string }
  targetUser?: { seedHex: string; pubkey: string; nsec: string }
}

const STATE_KEY = 'erasure_test'

function getS(world: Record<string, unknown>): ErasureTestState {
  return getState<ErasureTestState>(world, STATE_KEY)
}

Before(async ({ world }) => {
  setState<ErasureTestState>(world, STATE_KEY, {})
})

// ── Given ──────────────────────────────────────────────────────────

Given('a volunteer user', async ({ request, world }) => {
  const s = getS(world)
  s.volunteer = await createUserViaApi(request)
})

Given('a registered volunteer user with a pending erasure request', async ({ request, world }) => {
  const s = getS(world)
  s.volunteer = await createUserViaApi(request)
  const res = await apiPost(request, '/erasure/me', { justification: 'test' }, s.volunteer.nsec)
  expect(res.status).toBe(200)
})

Given('a registered volunteer user with no pending erasure request', async ({ request, world }) => {
  const s = getS(world)
  s.volunteer = await createUserViaApi(request)
})

Given('an admin user', async ({ request, world }) => {
  const s = getS(world)
  s.admin = await createUserViaApi(request, { roleIds: ['role-super-admin'] })
})

Given('{int} pending erasure requests exist', async ({ request }, count: number) => {
  for (let i = 0; i < count; i++) {
    const user = await createUserViaApi(request)
    await apiPost(request, '/erasure/me', { justification: `test-${i}` }, user.nsec)
  }
})

Given('a target volunteer user exists', async ({ request, world }) => {
  const s = getS(world)
  s.targetUser = await createUserViaApi(request)
})

Given('a target volunteer user with a known device pubkey', async ({ request, world }) => {
  const s = getS(world)
  s.targetUser = await createUserViaApi(request)
})

// ── When ───────────────────────────────────────────────────────────

When('the volunteer POSTs to {string} with a justification', async ({ request, world }, path: string) => {
  const s = getS(world)
  expect(s.volunteer).toBeDefined()
  const res = await apiPost(request, path, { justification: 'I want my data removed' }, s.volunteer!.nsec)
  setLastResponse(world, res)
})

When('the volunteer POSTs to {string} again', async ({ request, world }, path: string) => {
  const s = getS(world)
  expect(s.volunteer).toBeDefined()
  const res = await apiPost(request, path, { justification: 'duplicate' }, s.volunteer!.nsec)
  setLastResponse(world, res)
})

When('the volunteer DELETEs {string}', async ({ request, world }, path: string) => {
  const s = getS(world)
  expect(s.volunteer).toBeDefined()
  const res = await apiDelete(request, path, s.volunteer!.nsec)
  setLastResponse(world, res)
})

When('the volunteer GETs {string}', async ({ request, world }, path: string) => {
  const s = getS(world)
  expect(s.volunteer).toBeDefined()
  const res = await apiGet(request, path, s.volunteer!.nsec)
  setLastResponse(world, res)
})

When('the admin GETs {string}', async ({ request, world }, path: string) => {
  const s = getS(world)
  expect(s.admin).toBeDefined()
  const res = await apiGet(request, path, s.admin!.nsec)
  setLastResponse(world, res)
})

When('the admin POSTs to {string} with a justification', async ({ request, world }, pathTemplate: string) => {
  const s = getS(world)
  expect(s.admin).toBeDefined()
  expect(s.targetUser).toBeDefined()
  const path = pathTemplate.replace(':userId', s.targetUser!.pubkey)
  const res = await apiPost(request, path, { justification: 'Admin-ordered erasure' }, s.admin!.nsec)
  setLastResponse(world, res)
})

When('the admin POSTs to {string}', async ({ request, world }, pathTemplate: string) => {
  const s = getS(world)
  expect(s.admin).toBeDefined()
  expect(s.targetUser).toBeDefined()
  const path = pathTemplate
    .replace(':userId', s.targetUser!.pubkey)
    .replace(':devicePubkey', 'a'.repeat(64))
  const res = await apiPost(request, path, {}, s.admin!.nsec)
  setLastResponse(world, res)
})

// ── Then ───────────────────────────────────────────────────────────

Then('the response should contain an erasure request with status {string}', ({ world }, status: string) => {
  const state = getSharedState(world)
  const body = state.lastResponse?.data as { request?: { status?: string } }
  expect(body?.request?.status).toBe(status)
})

Then('the executeAt should be approximately {int} hours in the future', ({ world }, hours: number) => {
  const state = getSharedState(world)
  const body = state.lastResponse?.data as { request?: { executeAt?: string } }
  const executeAt = new Date(body?.request?.executeAt ?? '')
  const expectedMs = Date.now() + hours * 60 * 60 * 1000
  expect(Math.abs(executeAt.getTime() - expectedMs)).toBeLessThan(5 * 60 * 1000)
})

Then('the response should contain a list of requests with total {int}', ({ world }, total: number) => {
  const state = getSharedState(world)
  const body = state.lastResponse?.data as { total?: number }
  expect(body?.total).toBeGreaterThanOrEqual(total)
})

Then('the response should contain reEncryptionJobIds', ({ world }) => {
  const state = getSharedState(world)
  const body = state.lastResponse?.data as { reEncryptionJobIds?: string[] }
  expect(Array.isArray(body?.reEncryptionJobIds)).toBe(true)
})

Then('the response should contain a jobs list', ({ world }) => {
  const state = getSharedState(world)
  const body = state.lastResponse?.data as { jobs?: unknown[] }
  expect(Array.isArray(body?.jobs)).toBe(true)
})

Then('the response should contain request null', ({ world }) => {
  const state = getSharedState(world)
  const body = state.lastResponse?.data as { request?: unknown }
  expect(body?.request).toBeNull()
})
