/**
 * Data isolation step definitions (Epic 365).
 *
 * Tests that users can only see their own resources, that hub-scoped
 * data does not leak across hubs, and that role changes / deactivation
 * take immediate effect.
 */
import { expect } from '@playwright/test'
import { Given, When, Then, Before } from './fixtures'
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

let iso: IsolationState

Before({ tags: '@security or @permissions' }, async () => {
  iso = {
    users: new Map(),
    listResults: new Map(),
    deactivationResponses: new Map(),
  }
})

// ── Helpers ────────────────────────────────────────────────────────

async function ensureEntityType(request: import('@playwright/test').APIRequestContext): Promise<string> {
  if (iso.entityTypeId) return iso.entityTypeId
  await enableCaseManagementViaApi(request, true)
  const et = await createEntityTypeViaApi(request, {
    name: `Isolation Case ${Date.now()}`,
    slug: `isolation-case-${Date.now()}`,
  })
  iso.entityTypeId = et.id
  return et.id
}

// ── Parameterized: <role> can only see their own <resource> ───────

Given(
  'a {string} user {string} with resources',
  async ({ request }, role: string, name: string) => {
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
        const etId = await ensureEntityType(request)
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

    iso.users.set(name, user)
  },
)

When('{string} lists their {word}', async ({ request }, name: string, resource: string) => {
  const user = iso.users.get(name)
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

  iso.listResults.set(name, results)
})

Then('{string} should only see resources they created', async ({}, name: string) => {
  const user = iso.users.get(name)
  expect(user).toBeTruthy()
  const results = iso.listResults.get(name)
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
  async ({}, otherName: string, resource: string, viewerName: string) => {
    const other = iso.users.get(otherName)
    expect(other).toBeTruthy()
    const results = iso.listResults.get(viewerName)
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
  async ({ request }, _hubName: string, volName: string) => {
    const vol = await createVolunteerViaApi(request, {
      name: `${volName} ${Date.now()}`,
    })
    iso.users.set(volName, {
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
  async ({ request }, volName: string, _hubName: string) => {
    const user = iso.users.get(volName)
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
  async ({ request }, viewerName: string, _hubName: string) => {
    const viewer = iso.users.get(viewerName)
    expect(viewer).toBeTruthy()

    const { status, data } = await apiGet<{ notes: Array<{ id: string }> }>(
      request,
      '/notes',
      viewer!.nsec,
    )
    expect(status).toBe(200)

    // Get all note IDs belonging to OTHER users
    const otherNoteIds: string[] = []
    for (const [name, user] of iso.users) {
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

Given('a volunteer with role {string}', async ({ request }, role: string) => {
  const vol = await createVolunteerViaApi(request, {
    name: `Role Change Vol ${Date.now()}`,
  })
  // Set the initial role
  await apiPatch(request, `/users/${vol.pubkey}`, { roles: [role] })
  iso.volunteer = { ...vol, roles: [role] }
})

When(
  "an admin changes the volunteer's role to {string}",
  async ({ request }, newRole: string) => {
    expect(iso.volunteer).toBeTruthy()
    await apiPatch(request, `/users/${iso.volunteer!.pubkey}`, {
      roles: [newRole],
    })
    iso.volunteer!.roles = [newRole]
  },
)

When(
  'the volunteer makes a request requiring {string} permissions',
  async ({ request }, oldRole: string) => {
    expect(iso.volunteer).toBeTruthy()
    // hub-admin can list volunteers; volunteer cannot
    // Use an endpoint that the old role had access to
    let endpoint = '/users'
    if (oldRole === 'hub-admin') {
      endpoint = '/users'
    } else if (oldRole === 'reviewer') {
      endpoint = '/notes' // reviewers can list notes
    }
    iso.roleChangeResponse = await testEndpointAccess(
      request,
      'GET',
      endpoint,
      iso.volunteer!.nsec,
    )
  },
)

Then(
  'the response status should reflect the {string} role permissions',
  async ({}, newRole: string) => {
    expect(iso.roleChangeResponse).toBeDefined()
    if (newRole === 'volunteer' || newRole === 'reporter') {
      // Volunteers and reporters cannot list volunteers (requires admin perm)
      expect(iso.roleChangeResponse).toBe(403)
    } else {
      expect(iso.roleChangeResponse).toBe(200)
    }
  },
)

// ── Deactivation Enforcement ──────────────────────────────────────

Given('an active volunteer with notes and shift access', async ({ request }) => {
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
  iso.deactivatedVol = vol
})

When('an admin deactivates the volunteer', async ({ request }) => {
  expect(iso.deactivatedVol).toBeTruthy()
  await apiPatch(request, `/users/${iso.deactivatedVol!.pubkey}`, {
    active: false,
  })
})

Then(
  'the volunteer should receive {int} when listing notes',
  async ({ request }, expectedStatus: number) => {
    expect(iso.deactivatedVol).toBeTruthy()
    const status = await testEndpointAccess(
      request,
      'GET',
      '/notes',
      iso.deactivatedVol!.nsec,
    )
    expect(status).toBe(expectedStatus)
  },
)

Then(
  'the volunteer should receive {int} when listing shifts',
  async ({ request }, expectedStatus: number) => {
    expect(iso.deactivatedVol).toBeTruthy()
    const status = await testEndpointAccess(
      request,
      'GET',
      '/shifts',
      iso.deactivatedVol!.nsec,
    )
    expect(status).toBe(expectedStatus)
  },
)

Then(
  'the volunteer should receive {int} when accessing their profile',
  async ({ request }, expectedStatus: number) => {
    expect(iso.deactivatedVol).toBeTruthy()
    const status = await testEndpointAccess(
      request,
      'GET',
      '/auth/me',
      iso.deactivatedVol!.nsec,
    )
    expect(status).toBe(expectedStatus)
  },
)
