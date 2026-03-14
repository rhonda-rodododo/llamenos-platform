/**
 * Volunteer Profiles & Case Workload step definitions (Epic 340).
 *
 * Covers specializations, capacity limits, team assignment,
 * case count metrics, and volunteer case listing.
 *
 * Reuses existing steps from:
 * - entity-schema.steps.ts: "case management is enabled", "an entity type {string} exists"
 * - common.steps.ts: "the server is reset"
 */
import { expect } from '@playwright/test'
import { Given, When, Then, Before } from './fixtures'
import {
  createVolunteerViaApi,
  getVolunteerViaApi,
  updateVolunteerViaApi,
  createEntityTypeViaApi,
  listEntityTypesViaApi,
  createRecordViaApi,
  apiGet,
  apiPatch,
} from '../../api-helpers'

// ── Local State ────────────────────────────────────────────────────

interface ProfileState {
  volunteers: Map<string, { pubkey: string; nsec: string; name: string }>
  entityTypeIds: Map<string, string>
  lastVolunteerPubkey?: string
  lastVolunteerNsec?: string
  metricsResult?: {
    pubkey: string
    activeCaseCount: number
    totalCasesHandled: number
    averageResolutionDays: number | null
  }
  casesResult?: {
    records: Record<string, unknown>[]
    total: number
  }
}

let state: ProfileState

Before({ tags: '@cases' }, async () => {
  state = {
    volunteers: new Map(),
    entityTypeIds: new Map(),
  }
})

// ── Helpers ────────────────────────────────────────────────────────

async function resolveEntityTypeId(
  request: import('@playwright/test').APIRequestContext,
  name: string,
): Promise<string> {
  const cached = state.entityTypeIds.get(name)
  if (cached) return cached

  const types = await listEntityTypesViaApi(request)
  const existing = types.find(t => t.name === name)
  if (existing) {
    const id = existing.id as string
    state.entityTypeIds.set(name, id)
    return id
  }

  const created = await createEntityTypeViaApi(request, { name, category: 'case' })
  const id = created.id as string
  state.entityTypeIds.set(name, id)
  return id
}

// ── Given ──────────────────────────────────────────────────────────

Given('a volunteer exists with self-update permissions', async ({ request }) => {
  const vol = await createVolunteerViaApi(request, {
    name: `vol-self-${Date.now()}`,
  })
  state.lastVolunteerPubkey = vol.pubkey
  state.lastVolunteerNsec = vol.nsec
  state.volunteers.set('self', { pubkey: vol.pubkey, nsec: vol.nsec, name: vol.name })
})

Given('a volunteer exists for profile update', async ({ request }) => {
  const vol = await createVolunteerViaApi(request, {
    name: `vol-profile-${Date.now()}`,
  })
  state.lastVolunteerPubkey = vol.pubkey
  state.lastVolunteerNsec = vol.nsec
  state.volunteers.set('profile', { pubkey: vol.pubkey, nsec: vol.nsec, name: vol.name })
})

Given('a volunteer {string} exists for case assignment', async ({ request }, alias: string) => {
  const vol = await createVolunteerViaApi(request, {
    name: `vol-${alias}-${Date.now()}`,
  })
  state.volunteers.set(alias, { pubkey: vol.pubkey, nsec: vol.nsec, name: vol.name })
})

Given('{int} records of type {string} are assigned to volunteer {string}', async ({ request }, count: number, typeName: string, alias: string) => {
  const vol = state.volunteers.get(alias)
  expect(vol).toBeTruthy()

  const entityTypeId = await resolveEntityTypeId(request, typeName)

  for (let i = 0; i < count; i++) {
    // Create record with initial assignment (assignedTo set at creation time)
    await createRecordViaApi(request, entityTypeId, { assignedTo: [vol!.pubkey] })
  }
})

// Reserved for future: closed record test step (requires fixing Node.js record PATCH pipeline)

// ── When ──────────────────────────────────────────────────────────

When('the admin creates a volunteer with specializations {string}', async ({ request }, specsCsv: string) => {
  const specializations = specsCsv.split(',').map(s => s.trim())
  const vol = await createVolunteerViaApi(request, {
    name: `vol-spec-${Date.now()}`,
  })
  // Set specializations via admin update (create doesn't go through admin PATCH)
  await updateVolunteerViaApi(request, vol.pubkey, { specializations } as Record<string, unknown>)
  state.lastVolunteerPubkey = vol.pubkey
  state.lastVolunteerNsec = vol.nsec
})

When('the volunteer updates their specializations to {string}', async ({ request }, specsCsv: string) => {
  const specializations = specsCsv.split(',').map(s => s.trim())
  const vol = state.volunteers.get('self')
  expect(vol).toBeTruthy()

  // Self-update uses the non-admin PATCH endpoint (via /me/profile auth route)
  // For API test, use the volunteer's own nsec to call the admin PATCH path
  // which the route delegates to the non-admin identity-do PATCH (safe fields only).
  // Actually, the /me/profile route uses the non-admin PATCH. Let's use that.
  const { status } = await apiPatch(
    request,
    '/auth/me/profile',
    { specializations },
    vol!.nsec,
  )
  expect(status).toBe(200)
})

When('the admin sets the volunteer max case assignments to {int}', async ({ request }, max: number) => {
  const vol = state.volunteers.get('profile')
  expect(vol).toBeTruthy()
  await updateVolunteerViaApi(request, vol!.pubkey, { maxCaseAssignments: max } as Record<string, unknown>)
})

When('the admin sets the volunteer team to {string}', async ({ request }, teamId: string) => {
  const vol = state.volunteers.get('profile')
  expect(vol).toBeTruthy()
  await updateVolunteerViaApi(request, vol!.pubkey, { teamId } as Record<string, unknown>)
})

When('the admin fetches volunteer {string} metrics', async ({ request }, alias: string) => {
  const vol = state.volunteers.get(alias)
  expect(vol).toBeTruthy()

  const { status, data } = await apiGet<{
    pubkey: string
    activeCaseCount: number
    totalCasesHandled: number
    averageResolutionDays: number | null
  }>(request, `/volunteers/${vol!.pubkey}/metrics`)
  expect(status).toBe(200)
  state.metricsResult = data
})

When('the admin lists cases for volunteer {string}', async ({ request }, alias: string) => {
  const vol = state.volunteers.get(alias)
  expect(vol).toBeTruthy()

  const { status, data } = await apiGet<{
    records: Record<string, unknown>[]
    total: number
  }>(request, `/volunteers/${vol!.pubkey}/cases`)
  expect(status).toBe(200)
  state.casesResult = data
})

// ── Then ──────────────────────────────────────────────────────────

Then('the volunteer should have specializations {string} and {string}', async ({ request }, spec1: string, spec2: string) => {
  const pubkey = state.lastVolunteerPubkey
  expect(pubkey).toBeTruthy()

  const vol = await getVolunteerViaApi(request, pubkey!)
  const specializations = vol.specializations as string[] | undefined

  expect(specializations).toBeDefined()
  expect(specializations).toContain(spec1)
  expect(specializations).toContain(spec2)
})

Then('the volunteer should have max case assignments {int}', async ({ request }, max: number) => {
  const vol = state.volunteers.get('profile')
  expect(vol).toBeTruthy()

  const data = await getVolunteerViaApi(request, vol!.pubkey)
  expect(data.maxCaseAssignments).toBe(max)
})

Then('the volunteer should have team {string}', async ({ request }, teamId: string) => {
  const vol = state.volunteers.get('profile')
  expect(vol).toBeTruthy()

  const data = await getVolunteerViaApi(request, vol!.pubkey)
  expect(data.teamId).toBe(teamId)
})

Then('the active case count should be {int}', async ({}, count: number) => {
  expect(state.metricsResult).toBeTruthy()
  expect(state.metricsResult!.activeCaseCount).toBe(count)
})

Then('the total cases handled should be {int}', async ({}, count: number) => {
  expect(state.metricsResult).toBeTruthy()
  expect(state.metricsResult!.totalCasesHandled).toBe(count)
})

Then('the average resolution days should be a number', async () => {
  expect(state.metricsResult).toBeTruthy()
  expect(state.metricsResult!.averageResolutionDays).not.toBeNull()
  expect(typeof state.metricsResult!.averageResolutionDays).toBe('number')
})

Then('the average resolution days should be null', async () => {
  expect(state.metricsResult).toBeTruthy()
  expect(state.metricsResult!.averageResolutionDays).toBeNull()
})

Then('{int} assigned records should be returned', async ({}, count: number) => {
  expect(state.casesResult).toBeTruthy()
  expect(state.casesResult!.records.length).toBe(count)
})
