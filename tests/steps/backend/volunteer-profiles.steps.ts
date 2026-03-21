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
import { Given, When, Then, Before, getState, setState } from './fixtures'
import { getScenarioState } from './common.steps'
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

const VOLUNTEER_PROFILES_KEY = 'volunteer_profiles'

function getProfileState(world: Record<string, unknown>): ProfileState {
  return getState<ProfileState>(world, VOLUNTEER_PROFILES_KEY)
}


Before({ tags: '@cases' }, async ({ world }) => {
  const state = {
    volunteers: new Map(),
    entityTypeIds: new Map(),
  }
  setState(world, VOLUNTEER_PROFILES_KEY, state)
})

// ── Helpers ────────────────────────────────────────────────────────

async function resolveEntityTypeId(
  request: import('@playwright/test').APIRequestContext,
  world: Record<string, unknown>,
  name: string,
): Promise<string> {
  const cached = getProfileState(world).entityTypeIds.get(name)
  if (cached) return cached

  const hubId = getScenarioState(world).hubId
  const types = await listEntityTypesViaApi(request, hubId)
  const existing = types.find(t => t.name === name)
  if (existing) {
    const id = existing.id as string
    getProfileState(world).entityTypeIds.set(name, id)
    return id
  }

  const created = await createEntityTypeViaApi(request, { name, category: 'case', hubId })
  const id = created.id as string
  getProfileState(world).entityTypeIds.set(name, id)
  return id
}

// ── Given ──────────────────────────────────────────────────────────

Given('a volunteer exists with self-update permissions', async ({ request, world }) => {
  const vol = await createVolunteerViaApi(request, {
    name: `vol-self-${Date.now()}`,
  })
  getProfileState(world).lastVolunteerPubkey = vol.pubkey
  getProfileState(world).lastVolunteerNsec = vol.nsec
  getProfileState(world).volunteers.set('self', { pubkey: vol.pubkey, nsec: vol.nsec, name: vol.name })
})

Given('a volunteer exists for profile update', async ({ request, world }) => {
  const vol = await createVolunteerViaApi(request, {
    name: `vol-profile-${Date.now()}`,
  })
  getProfileState(world).lastVolunteerPubkey = vol.pubkey
  getProfileState(world).lastVolunteerNsec = vol.nsec
  getProfileState(world).volunteers.set('profile', { pubkey: vol.pubkey, nsec: vol.nsec, name: vol.name })
})

Given('a volunteer {string} exists for case assignment', async ({ request, world }, alias: string) => {
  const vol = await createVolunteerViaApi(request, {
    name: `vol-${alias}-${Date.now()}`,
  })
  getProfileState(world).volunteers.set(alias, { pubkey: vol.pubkey, nsec: vol.nsec, name: vol.name })
})

Given('{int} records of type {string} are assigned to volunteer {string}', async ({ request, world }, count: number, typeName: string, alias: string) => {
  const vol = getProfileState(world).volunteers.get(alias)
  expect(vol).toBeTruthy()

  const entityTypeId = await resolveEntityTypeId(request, world, typeName)

  const hubId = getScenarioState(world).hubId
  for (let i = 0; i < count; i++) {
    // Create record with initial assignment (assignedTo set at creation time)
    await createRecordViaApi(request, entityTypeId, { assignedTo: [vol!.pubkey], hubId })
  }
})

// Reserved for future: closed record test step (requires fixing Node.js record PATCH pipeline)

// ── When ──────────────────────────────────────────────────────────

When('the admin creates a volunteer with specializations {string}', async ({ request, world }, specsCsv: string) => {
  const specializations = specsCsv.split(',').map(s => s.trim())
  const vol = await createVolunteerViaApi(request, {
    name: `vol-spec-${Date.now()}`,
  })
  // Set specializations via admin update (create doesn't go through admin PATCH)
  await updateVolunteerViaApi(request, vol.pubkey, { specializations } as Record<string, unknown>)
  getProfileState(world).lastVolunteerPubkey = vol.pubkey
  getProfileState(world).lastVolunteerNsec = vol.nsec
})

When('the volunteer updates their specializations to {string}', async ({ request, world }, specsCsv: string) => {
  const specializations = specsCsv.split(',').map(s => s.trim())
  const vol = getProfileState(world).volunteers.get('self')
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

When('the admin sets the volunteer max case assignments to {int}', async ({ request, world }, max: number) => {
  const vol = getProfileState(world).volunteers.get('profile')
  expect(vol).toBeTruthy()
  await updateVolunteerViaApi(request, vol!.pubkey, { maxCaseAssignments: max } as Record<string, unknown>)
})

When('the admin sets the volunteer team to {string}', async ({ request, world }, teamId: string) => {
  const vol = getProfileState(world).volunteers.get('profile')
  expect(vol).toBeTruthy()
  await updateVolunteerViaApi(request, vol!.pubkey, { teamId } as Record<string, unknown>)
})

When('the admin fetches volunteer {string} metrics', async ({ request, world }, alias: string) => {
  const vol = getProfileState(world).volunteers.get(alias)
  expect(vol).toBeTruthy()
  const hubId = getScenarioState(world).hubId

  const { status, data } = await apiGet<{
    pubkey: string
    activeCaseCount: number
    totalCasesHandled: number
    averageResolutionDays: number | null
  }>(request, `/users/${vol!.pubkey}/metrics${hubId ? `?hubId=${hubId}` : ''}`)
  expect(status).toBe(200)
  getProfileState(world).metricsResult = data
})

When('the admin lists cases for volunteer {string}', async ({ request, world }, alias: string) => {
  const vol = getProfileState(world).volunteers.get(alias)
  expect(vol).toBeTruthy()
  const hubId = getScenarioState(world).hubId

  const { status, data } = await apiGet<{
    records: Record<string, unknown>[]
    total: number
  }>(request, `/users/${vol!.pubkey}/cases${hubId ? `?hubId=${hubId}` : ''}`)
  expect(status).toBe(200)
  getProfileState(world).casesResult = data
})

// ── Then ──────────────────────────────────────────────────────────

Then('the volunteer should have specializations {string} and {string}', async ({ request, world }, spec1: string, spec2: string) => {
  const pubkey = getProfileState(world).lastVolunteerPubkey
  expect(pubkey).toBeTruthy()

  const vol = await getVolunteerViaApi(request, pubkey!)
  const specializations = vol.specializations as string[] | undefined

  expect(specializations).toBeDefined()
  expect(specializations).toContain(spec1)
  expect(specializations).toContain(spec2)
})

Then('the volunteer should have max case assignments {int}', async ({ request, world }, max: number) => {
  const vol = getProfileState(world).volunteers.get('profile')
  expect(vol).toBeTruthy()

  const data = await getVolunteerViaApi(request, vol!.pubkey)
  expect(data.maxCaseAssignments).toBe(max)
})

Then('the volunteer should have team {string}', async ({ request, world }, teamId: string) => {
  const vol = getProfileState(world).volunteers.get('profile')
  expect(vol).toBeTruthy()

  const data = await getVolunteerViaApi(request, vol!.pubkey)
  expect(data.teamId).toBe(teamId)
})

Then('the active case count should be {int}', async ({ world }, count: number) => {
  expect(getProfileState(world).metricsResult).toBeTruthy()
  expect(getProfileState(world).metricsResult!.activeCaseCount).toBe(count)
})

Then('the total cases handled should be {int}', async ({ world }, count: number) => {
  expect(getProfileState(world).metricsResult).toBeTruthy()
  expect(getProfileState(world).metricsResult!.totalCasesHandled).toBe(count)
})

Then('the average resolution days should be a number', async ({ world }) => {
  expect(getProfileState(world).metricsResult).toBeTruthy()
  expect(getProfileState(world).metricsResult!.averageResolutionDays).not.toBeNull()
  expect(typeof getProfileState(world).metricsResult!.averageResolutionDays).toBe('number')
})

Then('the average resolution days should be null', async ({ world }) => {
  expect(getProfileState(world).metricsResult).toBeTruthy()
  expect(getProfileState(world).metricsResult!.averageResolutionDays).toBeNull()
})

Then('{int} assigned records should be returned', async ({ world }, count: number) => {
  expect(getProfileState(world).casesResult).toBeTruthy()
  expect(getProfileState(world).casesResult!.records.length).toBe(count)
})
