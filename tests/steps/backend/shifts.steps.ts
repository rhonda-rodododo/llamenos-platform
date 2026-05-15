/**
 * EP07 Shift Management step definitions.
 *
 * Covers ring groups, overrides, clock-in/heartbeat, availability blocks,
 * and shift join/leave requests.
 */
import { expect } from '@playwright/test'
import { Given, Then, Before, getState, setState } from './fixtures'
import { getSharedState } from './shared-state'
import {
  ADMIN_SEED,
  apiPost,
  createShiftViaApi,
  generateTestKeypair,
} from '../../api-helpers'

// ── State ────────────────────────────────────────────────────────────────────

interface ShiftsEP07State {
  ringGroupId?: string
  overrideId?: string
  availabilityBlockId?: string
  requestId?: string
  shiftId?: string
  volunteerSeed?: string
}

const EP07_KEY = 'shiftsEP07'

function getEP07State(world: Record<string, unknown>): ShiftsEP07State {
  return getState<ShiftsEP07State>(world, EP07_KEY)
}

Before({ tags: '@backend' }, async ({ world }) => {
  setState<ShiftsEP07State>(world, EP07_KEY, {})
})

// ── Ring Group Givens ─────────────────────────────────────────────────────────

Given('a ring group exists in the hub', async ({ request, world, workerHub }) => {
  const s = getEP07State(world)
  const { status, data } = await apiPost<{ id: string }>(
    request,
    `/hubs/${workerHub}/ring-groups`,
    { id: crypto.randomUUID(), encryptedName: 'test-ring-group' },
    ADMIN_SEED,
  )
  expect(status).toBe(200)
  s.ringGroupId = (data as { id: string }).id
})

Given('a ring group exists with {int} members', async ({ request, world, workerHub }, count: number) => {
  const s = getEP07State(world)
  const { status, data } = await apiPost<{ id: string }>(
    request,
    `/hubs/${workerHub}/ring-groups`,
    { id: crypto.randomUUID(), encryptedName: 'ring-group-with-members' },
    ADMIN_SEED,
  )
  expect(status).toBe(200)
  const groupId = (data as { id: string }).id
  s.ringGroupId = groupId

  for (let i = 0; i < count; i++) {
    const { pubkey } = generateTestKeypair()
    await apiPost(request, `/hubs/${workerHub}/ring-groups/${groupId}/members`, { pubkeys: [pubkey] }, ADMIN_SEED)
  }
})

Given('a ring group exists with member {string}', async ({ request, world, workerHub }, pubkey: string) => {
  const s = getEP07State(world)
  const { data } = await apiPost<{ id: string }>(
    request,
    `/hubs/${workerHub}/ring-groups`,
    { id: crypto.randomUUID(), encryptedName: 'ring-group-with-member' },
    ADMIN_SEED,
  )
  const groupId = (data as { id: string }).id
  s.ringGroupId = groupId
  await apiPost(request, `/hubs/${workerHub}/ring-groups/${groupId}/members`, { pubkeys: [pubkey] }, ADMIN_SEED)
})

// ── Override Givens ───────────────────────────────────────────────────────────

Given('an override exists on date {string}', async ({ request, world, workerHub }, date: string) => {
  const s = getEP07State(world)
  const { data } = await apiPost<{ id: string }>(
    request,
    `/hubs/${workerHub}/shifts/overrides`,
    { id: crypto.randomUUID(), date, type: 'cancel' },
    ADMIN_SEED,
  )
  s.overrideId = (data as { id: string }).id
})

Given('overrides exist for {string} to {string}', async ({ request, workerHub }, from: string, _to: string) => {
  await apiPost(request, `/hubs/${workerHub}/shifts/overrides`, { id: crypto.randomUUID(), date: from, type: 'cancel' }, ADMIN_SEED)
})

// ── Clock-in Givens ───────────────────────────────────────────────────────────

Given('I am clocked in', async ({ request, world, workerHub }) => {
  const s = getEP07State(world)
  const seed = s.volunteerSeed ?? ADMIN_SEED
  const { status } = await apiPost(request, `/hubs/${workerHub}/shifts/clock-in`, {}, seed)
  expect(status).toBe(200)
})

Given('volunteer {string} is clocked in', async ({ request, world, workerHub }, _pubkey: string) => {
  // The volunteer must clock themselves in. This step establishes expected context.
  const s = getEP07State(world)
  const seed = s.volunteerSeed ?? ADMIN_SEED
  await apiPost(request, `/hubs/${workerHub}/shifts/clock-in`, {}, seed)
})

// ── Availability Givens ───────────────────────────────────────────────────────

Given('I have an availability block from {string} to {string}', async ({ request, world, workerHub }, start: string, end: string) => {
  const s = getEP07State(world)
  const seed = s.volunteerSeed ?? ADMIN_SEED
  const { data } = await apiPost<{ id: string }>(
    request,
    `/hubs/${workerHub}/shifts/availability`,
    { id: crypto.randomUUID(), startDate: start, endDate: end },
    seed,
  )
  s.availabilityBlockId = (data as { id: string }).id
})

Given('I have an availability block', async ({ request, world, workerHub }) => {
  const s = getEP07State(world)
  const seed = s.volunteerSeed ?? ADMIN_SEED
  const { data } = await apiPost<{ id: string }>(
    request,
    `/hubs/${workerHub}/shifts/availability`,
    { id: crypto.randomUUID(), startDate: '2026-09-01', endDate: '2026-09-07' },
    seed,
  )
  s.availabilityBlockId = (data as { id: string }).id
})

Given('a volunteer has an availability block in {string} to {string}', async ({ request, world, workerHub }, from: string, to: string) => {
  const s = getEP07State(world)
  const seed = s.volunteerSeed ?? ADMIN_SEED
  await apiPost(request, `/hubs/${workerHub}/shifts/availability`, { id: crypto.randomUUID(), startDate: from, endDate: to }, seed)
})

// ── Request Givens ────────────────────────────────────────────────────────────

Given('a shift exists in the hub with id {string}', async ({ request, world, workerHub }, _id: string) => {
  const s = getEP07State(world)
  const result = await createShiftViaApi(request, { hubId: workerHub })
  s.shiftId = result.id
})

Given('a join request exists with status {string}', async ({ request, world, workerHub }, _status: string) => {
  const s = getEP07State(world)
  if (!s.shiftId) throw new Error('No shift ID — run "a shift exists in the hub" step first')
  const seed = s.volunteerSeed ?? ADMIN_SEED
  const { data } = await apiPost<{ id: string }>(
    request,
    `/hubs/${workerHub}/shifts/requests`,
    { shiftId: s.shiftId, type: 'join' },
    seed,
  )
  s.requestId = (data as { id: string }).id
})

Given('a pending join request exists for shift {string}', async ({ request, world, workerHub }, _shiftRef: string) => {
  const s = getEP07State(world)
  if (!s.shiftId) throw new Error('No shift ID')
  const seed = s.volunteerSeed ?? ADMIN_SEED
  const { data } = await apiPost<{ id: string }>(
    request,
    `/hubs/${workerHub}/shifts/requests`,
    { shiftId: s.shiftId, type: 'join' },
    seed,
  )
  s.requestId = (data as { id: string }).id
})

Given('a pending join request exists', async ({ request, world, workerHub }) => {
  const s = getEP07State(world)
  if (!s.shiftId) throw new Error('No shift ID')
  const seed = s.volunteerSeed ?? ADMIN_SEED
  const { data } = await apiPost<{ id: string }>(
    request,
    `/hubs/${workerHub}/shifts/requests`,
    { shiftId: s.shiftId, type: 'join' },
    seed,
  )
  s.requestId = (data as { id: string }).id
})

Given('I already have a pending join request for {string}', async ({ request, world, workerHub }, _shiftRef: string) => {
  const s = getEP07State(world)
  if (!s.shiftId) throw new Error('No shift ID')
  const seed = s.volunteerSeed ?? ADMIN_SEED
  const { data } = await apiPost<{ id: string }>(
    request,
    `/hubs/${workerHub}/shifts/requests`,
    { shiftId: s.shiftId, type: 'join' },
    seed,
  )
  s.requestId = (data as { id: string }).id
})

// ── EP07-specific Then assertions ─────────────────────────────────────────────

Then('the response body {string} should contain member {string}', async ({ world }, field: string, value: string) => {
  const shared = getSharedState(world)
  const body = shared.lastResponse as Record<string, unknown>
  const fieldVal = body?.[field]
  if (Array.isArray(fieldVal)) {
    expect(fieldVal.some((m: unknown) => JSON.stringify(m).includes(value))).toBe(true)
  } else {
    expect(JSON.stringify(fieldVal)).toContain(value)
  }
})

Then('the response body {string} should not contain member {string}', async ({ world }, field: string, value: string) => {
  const shared = getSharedState(world)
  const body = shared.lastResponse as Record<string, unknown>
  const fieldVal = body?.[field]
  if (Array.isArray(fieldVal)) {
    expect(fieldVal.some((m: unknown) => JSON.stringify(m).includes(value))).toBe(false)
  } else {
    expect(JSON.stringify(fieldVal)).not.toContain(value)
  }
})

Then('the response body {string} should have {int} entries', async ({ world }, field: string, count: number) => {
  const shared = getSharedState(world)
  const body = shared.lastResponse as Record<string, unknown>
  const arr = body?.[field]
  expect(Array.isArray(arr)).toBe(true)
  expect((arr as unknown[]).length).toBe(count)
})

Then('the response body {string} array should be empty', async ({ world }, field: string) => {
  const shared = getSharedState(world)
  const body = shared.lastResponse as Record<string, unknown>
  const arr = body?.[field]
  expect(Array.isArray(arr)).toBe(true)
  expect((arr as unknown[]).length).toBe(0)
})
