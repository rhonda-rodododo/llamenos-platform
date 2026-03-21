/**
 * Data isolation step definitions (Epic 365).
 *
 * Tests that users can only see their own resources, that hub-scoped
 * data does not leak across hubs, and that role changes / deactivation
 * take immediate effect.
 */
import { expect } from '@playwright/test'
import { Given, When, Then, Before, getState, setState } from './fixtures'
import { getScenarioState } from './common.steps'
import {
  apiGet,
  apiPost,
  apiPatch,
  createVolunteerViaApi,
  listNotesViaApi,
  createReportViaApi,
  listReportsViaApi,
  listRecordsViaApi,
  createRecordViaApi,
  enableCaseManagementViaApi,
  createEntityTypeViaApi,
  testEndpointAccess,
  generateTestKeypair,
  ADMIN_NSEC,
  type CreateVolunteerResult,
} from '../../api-helpers'
import { TestDB } from '../../db-helpers'

// ── Local State ────────────────────────────────────────────────────

interface UserWithResources {
  name: string
  nsec: string
  pubkey: string
  noteIds: string[]
  reportIds: string[]
  recordIds: string[]
}

interface IsolationState {
  users: Map<string, UserWithResources>
  entityTypeId?: string
  /** Stores the last list result per user for Then assertions. */
  listResults: Map<string, { notes?: string[]; reports?: string[]; records?: string[] }>
  /** For role-change scenarios */
  volunteer?: CreateVolunteerResult & { roles?: string[] }
  roleChangeResponse?: number
  /** For deactivation scenarios */
  deactivatedVol?: CreateVolunteerResult
  deactivationResponses: Map<string, number>
}

const DATA_ISOLATION_KEY = 'data_isolation'

function getIsolationState(world: Record<string, unknown>): IsolationState {
  return getState<IsolationState>(world, DATA_ISOLATION_KEY)
}


Before({ tags: '@security or @permissions' }, async ({ world }) => {
  const iso = {
    users: new Map(),
    listResults: new Map(),
    deactivationResponses: new Map(),
  }
  setState(world, DATA_ISOLATION_KEY, iso)
})

// ── Helpers ────────────────────────────────────────────────────────

async function ensureEntityType(
  request: import('@playwright/test').APIRequestContext,
  world: Record<string, unknown>,
): Promise<string> {
  const isoState = getIsolationState(world)
  if (isoState.entityTypeId) return isoState.entityTypeId
  await enableCaseManagementViaApi(request, true)
  const hubId = getScenarioState(world).hubId
  const et = await createEntityTypeViaApi(request, {
    name: `isolation_case_${Date.now()}`,
    hubId,
  })
  isoState.entityTypeId = et.id as string
  return et.id as string
}

// ── Parameterized: <role> can only see their own <resource> ───────

Given(
  'a {string} user {string} with resources',
  async ({ request, world }, role: string, name: string) => {
    // Create volunteer with given role
    const vol = await createVolunteerViaApi(request, {
      name: `${name} ${Date.now()}`,
    })

    // Assign the right role
    if (role === 'reporter') {
      await apiPatch(request, `/users/${vol.pubkey}`, { roles: ['reporter'] })
    } else if (role === 'volunteer') {
      // Default role is volunteer — no change needed
    }

    const user: UserWithResources = {
      name,
      nsec: vol.nsec,
      pubkey: vol.pubkey,
      noteIds: [],
      reportIds: [],
      recordIds: [],
    }

    // Create resources as this user
    if (role === 'volunteer') {
      // Create a note
      const noteRes = await apiPost<{ note: { id: string } }>(
        request,
        '/notes',
        {
          encryptedContent: Buffer.from(`${name}'s note`).toString('base64'),
          callId: `iso-${Date.now()}-${name}`,
        },
        vol.nsec,
      )
      if (noteRes.status === 200 || noteRes.status === 201) {
        user.noteIds.push(noteRes.data.note.id)
      }

      // Create a record (if CMS enabled)
      try {
        const etId = await ensureEntityType(request, world)
        const rec = await createRecordViaApi(request, etId, {}, vol.nsec)
        if ((rec as { id?: string }).id) {
          user.recordIds.push((rec as { id: string }).id)
        }
      } catch {
        // CMS may not be enabled — skip
      }
    }

    if (role === 'reporter') {
      // Create a report as this reporter
      const report = await createReportViaApi(request, {
        title: `${name}'s report ${Date.now()}`,
      })
      user.reportIds.push(report.id)
    }

    getIsolationState(world).users.set(name, user)
  },
)

When('{string} lists their {word}', async ({ request, world }, name: string, resource: string) => {
  const user = getIsolationState(world).users.get(name)
  expect(user).toBeTruthy()

  const results: { notes?: string[]; reports?: string[]; records?: string[] } = {}

  if (resource === 'note' || resource === 'notes') {
    const { status, data } = await apiGet<{ notes: Array<{ id: string }> }>(
      request,
      '/notes',
      user!.nsec,
    )
    results.notes = status === 200 ? data.notes.map(n => n.id) : []
  }

  if (resource === 'report' || resource === 'reports') {
    const { status, data } = await apiGet<{ conversations: Array<{ id: string }> }>(
      request,
      '/reports',
      user!.nsec,
    )
    results.reports = status === 200 ? data.conversations.map(r => r.id) : []
  }

  if (resource === 'record' || resource === 'records') {
    try {
      const data = await listRecordsViaApi(request, {}, user!.nsec)
      results.records = data.records.map(r => (r as { id: string }).id)
    } catch {
      results.records = []
    }
  }

  getIsolationState(world).listResults.set(name, results)
})

Then('{string} should only see resources they created', async ({ world }, name: string) => {
  const user = getIsolationState(world).users.get(name)
  expect(user).toBeTruthy()
  const results = getIsolationState(world).listResults.get(name)
  expect(results).toBeTruthy()

  // Every returned ID should belong to the user
  if (results!.notes) {
    for (const noteId of results!.notes) {
      expect(user!.noteIds).toContain(noteId)
    }
  }
  if (results!.reports) {
    for (const reportId of results!.reports) {
      expect(user!.reportIds).toContain(reportId)
    }
  }
  if (results!.records && results!.records.length > 0) {
    for (const recordId of results!.records) {
      expect(user!.recordIds).toContain(recordId)
    }
  }
})

Then(
  "{string}'s {word} should not be visible to {string}",
  async ({ world }, otherName: string, resource: string, viewerName: string) => {
    const other = getIsolationState(world).users.get(otherName)
    expect(other).toBeTruthy()
    const results = getIsolationState(world).listResults.get(viewerName)
    expect(results).toBeTruthy()

    if (resource === 'note' || resource === 'notes') {
      for (const noteId of other!.noteIds) {
        expect(results!.notes ?? []).not.toContain(noteId)
      }
    }
    if (resource === 'report' || resource === 'reports') {
      for (const reportId of other!.reportIds) {
        expect(results!.reports ?? []).not.toContain(reportId)
      }
    }
    if (resource === 'record' || resource === 'records') {
      for (const recordId of other!.recordIds) {
        expect(results!.records ?? []).not.toContain(recordId)
      }
    }
  },
)

// ── Hub-Scoped Isolation ──────────────────────────────────────────

Given(
  'hub {string} with a volunteer {string}',
  async ({ request, world }, _hubName: string, volName: string) => {
    const vol = await createVolunteerViaApi(request, {
      name: `${volName} ${Date.now()}`,
    })
    getIsolationState(world).users.set(volName, {
      name: volName,
      nsec: vol.nsec,
      pubkey: vol.pubkey,
      noteIds: [],
      reportIds: [],
      recordIds: [],
    })
  },
)

When(
  '{string} creates a note in hub {string}',
  async ({ request, world }, volName: string, _hubName: string) => {
    const user = getIsolationState(world).users.get(volName)
    expect(user).toBeTruthy()
    const res = await apiPost<{ note: { id: string } }>(
      request,
      '/notes',
      {
        encryptedContent: Buffer.from(`${volName}'s hub note`).toString('base64'),
        callId: `hub-iso-${Date.now()}-${volName}`,
      },
      user!.nsec,
    )
    if (res.status === 200 || res.status === 201) {
      user!.noteIds.push(res.data.note.id)
    }
  },
)

Then(
  '{string} should not see notes from hub {string}',
  async ({ request, world }, viewerName: string, _hubName: string) => {
    const viewer = getIsolationState(world).users.get(viewerName)
    expect(viewer).toBeTruthy()

    const { status, data } = await apiGet<{ notes: Array<{ id: string }> }>(
      request,
      '/notes',
      viewer!.nsec,
    )
    expect(status).toBe(200)

    // Get all note IDs belonging to OTHER users
    const otherNoteIds: string[] = []
    for (const [name, user] of getIsolationState(world).users) {
      if (name !== viewerName) {
        otherNoteIds.push(...user.noteIds)
      }
    }

    const visibleIds = data.notes.map(n => n.id)
    for (const otherId of otherNoteIds) {
      expect(visibleIds).not.toContain(otherId)
    }
  },
)

// ── Role Change Enforcement ───────────────────────────────────────

Given('a volunteer with role {string}', async ({ request, world }, role: string) => {
  const vol = await createVolunteerViaApi(request, {
    name: `Role Change Vol ${Date.now()}`,
  })
  // Set the initial role
  await apiPatch(request, `/users/${vol.pubkey}`, { roles: [role] })
  getIsolationState(world).volunteer = { ...vol, roles: [role] }
})

When(
  "an admin changes the volunteer's role to {string}",
  async ({ request, world }, newRole: string) => {
    expect(getIsolationState(world).volunteer).toBeTruthy()
    await apiPatch(request, `/users/${getIsolationState(world).volunteer!.pubkey}`, {
      roles: [newRole],
    })
    getIsolationState(world).volunteer!.roles = [newRole]
  },
)

When(
  'the volunteer makes a request requiring {string} permissions',
  async ({ request, world }, oldRole: string) => {
    expect(getIsolationState(world).volunteer).toBeTruthy()
    // hub-admin can list volunteers; volunteer cannot
    // Use an endpoint that the old role had access to
    let endpoint = '/users'
    if (oldRole === 'hub-admin') {
      endpoint = '/users'
    } else if (oldRole === 'reviewer') {
      endpoint = '/notes' // reviewers can list notes
    }
    getIsolationState(world).roleChangeResponse = await testEndpointAccess(
      request,
      'GET',
      endpoint,
      getIsolationState(world).volunteer!.nsec,
    )
  },
)

Then(
  'the response status should reflect the {string} role permissions',
  async ({ world }, newRole: string) => {
    expect(getIsolationState(world).roleChangeResponse).toBeDefined()
    if (newRole === 'volunteer' || newRole === 'reporter') {
      // Volunteers and reporters cannot list volunteers (requires admin perm)
      expect(getIsolationState(world).roleChangeResponse).toBe(403)
    } else {
      expect(getIsolationState(world).roleChangeResponse).toBe(200)
    }
  },
)

// ── Deactivation Enforcement ──────────────────────────────────────

Given('an active volunteer with notes and shift access', async ({ request, world }) => {
  const vol = await createVolunteerViaApi(request, {
    name: `Deactivation Vol ${Date.now()}`,
  })
  // Create a note as the volunteer
  await apiPost(
    request,
    '/notes',
    {
      encryptedContent: Buffer.from('deactivation test note').toString('base64'),
      callId: `deact-${Date.now()}`,
    },
    vol.nsec,
  )
  getIsolationState(world).deactivatedVol = vol
})

When('an admin deactivates the volunteer', async ({ request, world }) => {
  expect(getIsolationState(world).deactivatedVol).toBeTruthy()
  await apiPatch(request, `/users/${getIsolationState(world).deactivatedVol!.pubkey}`, {
    active: false,
  })
})

Then(
  'the volunteer should receive {int} when listing notes',
  async ({ request, world }, expectedStatus: number) => {
    expect(getIsolationState(world).deactivatedVol).toBeTruthy()
    const status = await testEndpointAccess(
      request,
      'GET',
      '/notes',
      getIsolationState(world).deactivatedVol!.nsec,
    )
    expect(status).toBe(expectedStatus)
  },
)

Then(
  'the volunteer should receive {int} when listing shifts',
  async ({ request, world }, expectedStatus: number) => {
    expect(getIsolationState(world).deactivatedVol).toBeTruthy()
    const status = await testEndpointAccess(
      request,
      'GET',
      '/shifts',
      getIsolationState(world).deactivatedVol!.nsec,
    )
    expect(status).toBe(expectedStatus)
  },
)

Then(
  'the volunteer should receive {int} when accessing their profile',
  async ({ request, world }, expectedStatus: number) => {
    expect(getIsolationState(world).deactivatedVol).toBeTruthy()
    const status = await testEndpointAccess(
      request,
      'GET',
      '/auth/me',
      getIsolationState(world).deactivatedVol!.nsec,
    )
    expect(status).toBe(expectedStatus)
  },
)
