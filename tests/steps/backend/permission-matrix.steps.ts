/**
 * Permission matrix step definitions.
 *
 * Generic parameterized steps for testing role-based access control
 * across all API endpoints. Creates one user per default role and
 * verifies expected HTTP status codes for each endpoint.
 */
import { Given, When, Before } from './fixtures'
// Status assertions (Then) are in assertions.steps.ts
import { shared, resetSharedState } from './shared-state'
import {
  apiGet,
  apiPost,
  apiPatch,
  apiPut,
  apiDelete,
  createVolunteerViaApi,
  createShiftViaApi,
  createBanViaApi,
  generateTestKeypair,
  uniquePhone,
  uniqueName,
  ADMIN_NSEC,
} from '../../api-helpers'

const BASE_URL = process.env.TEST_HUB_URL || 'http://localhost:3000'

// ── Role-keyed user state ───────────────────────────────────────────

interface RoleUser {
  nsec: string
  pubkey: string
  name: string
}

interface PermMatrixState {
  roleUsers: Record<string, RoleUser>
  /** Reusable test resources created by Given steps */
  testVolunteerPubkey?: string
  deletableVolunteerPubkey?: string
  testShiftId?: string
  deletableShiftId?: string
  testBanPhone?: string
  testInviteCode?: string
  testNoteId?: string
}

let pm: PermMatrixState

Before({ tags: '@backend' }, async () => {
  pm = { roleUsers: {} }
  resetSharedState()
})

// ── Role slug mapping ───────────────────────────────────────────────

function roleIdFromName(roleName: string): string {
  const map: Record<string, string> = {
    'super-admin': 'role-super-admin',
    'hub-admin': 'role-hub-admin',
    'reviewer': 'role-reviewer',
    'volunteer': 'role-volunteer',
    'reporter': 'role-reporter',
  }
  return map[roleName] ?? `role-${roleName}`
}

// ── Background: create test users ───────────────────────────────────

Given('test users exist for all default roles', async ({ request }) => {
  const roles = ['super-admin', 'hub-admin', 'reviewer', 'volunteer', 'reporter']
  for (const role of roles) {
    const vol = await createVolunteerViaApi(request, {
      name: `PM ${role} ${Date.now()}`,
      roleIds: [roleIdFromName(role)],
    })
    pm.roleUsers[role] = { nsec: vol.nsec, pubkey: vol.pubkey, name: vol.name }
  }
})

// ── Resource creation Given steps ───────────────────────────────────

Given('a test volunteer exists', async ({ request }) => {
  if (!pm.testVolunteerPubkey) {
    const vol = await createVolunteerViaApi(request, { name: `PM Target ${Date.now()}` })
    pm.testVolunteerPubkey = vol.pubkey
  }
})

Given('a deletable test volunteer exists', async ({ request }) => {
  // Create a fresh volunteer each time (will be deleted by the test)
  const vol = await createVolunteerViaApi(request, { name: `PM Deletable ${Date.now()}` })
  pm.deletableVolunteerPubkey = vol.pubkey
})

Given('a test shift exists', async ({ request }) => {
  if (!pm.testShiftId) {
    const shift = await createShiftViaApi(request, { name: `PM Shift ${Date.now()}` })
    pm.testShiftId = shift.id
  }
})

Given('a deletable test shift exists', async ({ request }) => {
  const shift = await createShiftViaApi(request, { name: `PM Del Shift ${Date.now()}` })
  pm.deletableShiftId = shift.id
})

Given('a test ban exists', async ({ request }) => {
  // Create a fresh ban each time (will be deleted by the test)
  const ban = await createBanViaApi(request, { phone: uniquePhone(), reason: 'PM test' })
  pm.testBanPhone = ban.phone
})

Given('a test invite exists', async ({ request }) => {
  // Create a fresh invite each time (will be revoked by the test)
  const { data } = await apiPost<{ code: string }>(request, '/invites', {
    name: `PM Invite ${Date.now()}`,
    phone: uniquePhone(),
    roleIds: ['role-volunteer'],
  })
  const d = data as Record<string, unknown> | null
  pm.testInviteCode = d?.code as string
    ?? (d?.invite as Record<string, unknown>)?.code as string
})

Given('a test note exists', async ({ request }) => {
  if (!pm.testNoteId) {
    // Create a note as admin (super-admin has notes:* via wildcard)
    const keypair = generateTestKeypair()
    const { data, status } = await apiPost<{ note: { id: string } }>(request, '/notes', {
      encryptedContent: 'test-encrypted-content',
      callId: `pm-test-note-${Date.now()}`,
      authorEnvelope: {
        wrappedKey: 'test-key-data',
        ephemeralPubkey: keypair.pubkey,
      },
    })
    if (status === 200 || status === 201) {
      pm.testNoteId = (data as Record<string, unknown>)?.id as string
        ?? ((data as Record<string, unknown>)?.note as Record<string, unknown>)?.id as string
    }
  }
})

// ── Generic request steps ───────────────────────────────────────────

When('the {string} user sends {string} to {string}', async ({ request }, role: string, method: string, path: string) => {
  const user = pm.roleUsers[role]
  if (!user) throw new Error(`No test user for role "${role}"`)

  shared.lastResponse = await sendRequest(request, method, path, user.nsec)
})

When('the {string} user sends {string} to {string} with valid volunteer body', async ({ request }, role: string, method: string, _path: string) => {
  const user = pm.roleUsers[role]
  if (!user) throw new Error(`No test user for role "${role}"`)

  const kp = generateTestKeypair()
  shared.lastResponse = await apiPost(request, '/users', {
    pubkey: kp.pubkey,
    name: uniqueName('PM Vol'),
    phone: uniquePhone(),
    roleIds: ['role-volunteer'],
  }, user.nsec)
})

When('the {string} user sends {string} to the test volunteer endpoint with update body', async ({ request }, role: string, _method: string) => {
  const user = pm.roleUsers[role]
  if (!user) throw new Error(`No test user for role "${role}"`)

  shared.lastResponse = await apiPatch(request, `/users/${pm.testVolunteerPubkey}`, {
    name: uniqueName('PM Updated'),
  }, user.nsec)
})

When('the {string} user sends {string} to the deletable volunteer endpoint', async ({ request }, role: string, _method: string) => {
  const user = pm.roleUsers[role]
  if (!user) throw new Error(`No test user for role "${role}"`)

  shared.lastResponse = await apiDelete(request, `/users/${pm.deletableVolunteerPubkey}`, user.nsec)
})

When('the {string} user sends {string} to {string} with valid shift body', async ({ request }, role: string, _method: string, _path: string) => {
  const user = pm.roleUsers[role]
  if (!user) throw new Error(`No test user for role "${role}"`)

  shared.lastResponse = await apiPost(request, '/shifts', {
    name: uniqueName('PM Shift'),
    startTime: '09:00',
    endTime: '17:00',
    days: [1, 2, 3, 4, 5],
    volunteerPubkeys: [],
  }, user.nsec)
})

When('the {string} user sends {string} to the test shift endpoint with shift update body', async ({ request }, role: string, _method: string) => {
  const user = pm.roleUsers[role]
  if (!user) throw new Error(`No test user for role "${role}"`)

  shared.lastResponse = await apiPatch(request, `/shifts/${pm.testShiftId}`, {
    name: uniqueName('PM Shift Updated'),
  }, user.nsec)
})

When('the {string} user sends {string} to the deletable shift endpoint', async ({ request }, role: string, _method: string) => {
  const user = pm.roleUsers[role]
  if (!user) throw new Error(`No test user for role "${role}"`)

  shared.lastResponse = await apiDelete(request, `/shifts/${pm.deletableShiftId}`, user.nsec)
})

When('the {string} user sends {string} to {string} with fallback body', async ({ request }, role: string, _method: string, _path: string) => {
  const user = pm.roleUsers[role]
  if (!user) throw new Error(`No test user for role "${role}"`)

  shared.lastResponse = await apiPut(request, '/shifts/fallback', {
    volunteerPubkeys: [],
  }, user.nsec)
})

When('the {string} user sends {string} to {string} with valid ban body', async ({ request }, role: string, _method: string, _path: string) => {
  const user = pm.roleUsers[role]
  if (!user) throw new Error(`No test user for role "${role}"`)

  shared.lastResponse = await apiPost(request, '/bans', {
    phone: uniquePhone(),
    reason: 'PM test ban',
  }, user.nsec)
})

When('the {string} user sends {string} to {string} with valid bulk ban body', async ({ request }, role: string, _method: string, _path: string) => {
  const user = pm.roleUsers[role]
  if (!user) throw new Error(`No test user for role "${role}"`)

  shared.lastResponse = await apiPost(request, '/bans/bulk', {
    phones: [uniquePhone()],
    reason: 'PM bulk test',
  }, user.nsec)
})

When('the {string} user sends {string} to the test ban endpoint', async ({ request }, role: string, _method: string) => {
  const user = pm.roleUsers[role]
  if (!user) throw new Error(`No test user for role "${role}"`)

  shared.lastResponse = await apiDelete(
    request,
    `/bans/${encodeURIComponent(pm.testBanPhone!)}`,
    user.nsec,
  )
})

When('the {string} user sends {string} to {string} with valid note body', async ({ request }, role: string, _method: string, _path: string) => {
  const user = pm.roleUsers[role]
  if (!user) throw new Error(`No test user for role "${role}"`)

  shared.lastResponse = await apiPost(request, '/notes', {
    encryptedContent: 'pm-test-encrypted',
    callId: `pm-note-${Date.now()}`,
    authorEnvelope: {
      wrappedKey: 'test-key',
      ephemeralPubkey: user.pubkey,
    },
  }, user.nsec)
})

When('the {string} user sends {string} to the test note reply endpoint with reply body', async ({ request }, role: string, _method: string) => {
  const user = pm.roleUsers[role]
  if (!user) throw new Error(`No test user for role "${role}"`)

  shared.lastResponse = await apiPost(request, `/notes/${pm.testNoteId}/replies`, {
    encryptedContent: 'pm-test-reply',
    readerEnvelopes: [{
      pubkey: user.pubkey,
      wrappedKey: 'test-key',
      ephemeralPubkey: user.pubkey,
    }],
  }, user.nsec)
})

When('the {string} user sends {string} to {string} with valid invite body', async ({ request }, role: string, _method: string, _path: string) => {
  const user = pm.roleUsers[role]
  if (!user) throw new Error(`No test user for role "${role}"`)

  shared.lastResponse = await apiPost(request, '/invites', {
    name: uniqueName('PM Invite'),
    phone: uniquePhone(),
    roleIds: ['role-volunteer'],
  }, user.nsec)
})

When('the {string} user sends {string} to the test invite endpoint', async ({ request }, role: string, _method: string) => {
  const user = pm.roleUsers[role]
  if (!user) throw new Error(`No test user for role "${role}"`)

  shared.lastResponse = await apiDelete(request, `/invites/${pm.testInviteCode}`, user.nsec)
})

When('the {string} user sends {string} to {string} with spam settings body', async ({ request }, role: string, _method: string, _path: string) => {
  const user = pm.roleUsers[role]
  if (!user) throw new Error(`No test user for role "${role}"`)

  shared.lastResponse = await apiPatch(request, '/settings/spam', {
    voiceCaptchaEnabled: false,
  }, user.nsec)
})

When('the {string} user sends {string} to {string} with telephony body', async ({ request }, role: string, _method: string, _path: string) => {
  const user = pm.roleUsers[role]
  if (!user) throw new Error(`No test user for role "${role}"`)

  shared.lastResponse = await apiPatch(request, '/settings/telephony-provider', {
    type: 'twilio',
    accountSid: 'AC_test',
    authToken: 'test_token',
    phoneNumber: '+15551234567',
  }, user.nsec)
})

When('the {string} user sends {string} to {string} with messaging body', async ({ request }, role: string, _method: string, _path: string) => {
  const user = pm.roleUsers[role]
  if (!user) throw new Error(`No test user for role "${role}"`)

  shared.lastResponse = await apiPatch(request, '/settings/messaging', {
    smsEnabled: false,
  }, user.nsec)
})

When('the {string} user sends {string} to {string} with IVR body', async ({ request }, role: string, _method: string, _path: string) => {
  const user = pm.roleUsers[role]
  if (!user) throw new Error(`No test user for role "${role}"`)

  shared.lastResponse = await apiPatch(request, '/settings/ivr-languages', {
    enabledLanguages: ['en'],
  }, user.nsec)
})

When('the {string} user sends {string} to {string} with transcription body', async ({ request }, role: string, _method: string, _path: string) => {
  const user = pm.roleUsers[role]
  if (!user) throw new Error(`No test user for role "${role}"`)

  shared.lastResponse = await apiPatch(request, '/settings/transcription', {
    globalEnabled: false,
  }, user.nsec)
})

When('the {string} user sends {string} to {string} with custom fields body', async ({ request }, role: string, _method: string, _path: string) => {
  const user = pm.roleUsers[role]
  if (!user) throw new Error(`No test user for role "${role}"`)

  shared.lastResponse = await apiPut(request, '/settings/custom-fields', {
    fields: [],
  }, user.nsec)
})

When('the {string} user sends {string} to {string} with call settings body', async ({ request }, role: string, _method: string, _path: string) => {
  const user = pm.roleUsers[role]
  if (!user) throw new Error(`No test user for role "${role}"`)

  shared.lastResponse = await apiPatch(request, '/settings/call', {
    queueTimeoutSeconds: 120,
  }, user.nsec)
})

When('the {string} user sends {string} to {string} with webauthn body', async ({ request }, role: string, _method: string, _path: string) => {
  const user = pm.roleUsers[role]
  if (!user) throw new Error(`No test user for role "${role}"`)

  shared.lastResponse = await apiPatch(request, '/settings/webauthn', {
    requireForAdmins: false,
  }, user.nsec)
})

When('the {string} user sends {string} to {string} with TTL body', async ({ request }, role: string, _method: string, _path: string) => {
  const user = pm.roleUsers[role]
  if (!user) throw new Error(`No test user for role "${role}"`)

  shared.lastResponse = await apiPatch(request, '/settings/ttl', {
    captchaChallenge: 600000,
  }, user.nsec)
})

When('the {string} user sends {string} to {string} with report type body', async ({ request }, role: string, _method: string, _path: string) => {
  const user = pm.roleUsers[role]
  if (!user) throw new Error(`No test user for role "${role}"`)

  shared.lastResponse = await apiPost(request, '/settings/report-types', {
    name: uniqueName('PM ReportType'),
  }, user.nsec)
})

When('the {string} user sends {string} to {string} with valid role body', async ({ request }, role: string, _method: string, _path: string) => {
  const user = pm.roleUsers[role]
  if (!user) throw new Error(`No test user for role "${role}"`)

  shared.lastResponse = await apiPost(request, '/settings/roles', {
    name: uniqueName('PM Role'),
    slug: `pm-role-${Date.now()}`,
    permissions: ['notes:read-own'],
    description: 'PM test role',
  }, user.nsec)
})

When('the {string} user sends {string} to {string} with share body', async ({ request }, role: string, _method: string, path: string) => {
  const user = pm.roleUsers[role]
  if (!user) throw new Error(`No test user for role "${role}"`)

  // Extract file ID from path, send share request
  shared.lastResponse = await apiPost(request, '/files/test-file-id/share', {
    envelope: { pubkey: user.pubkey, encryptedFileKey: 'test', ephemeralPubkey: user.pubkey },
    encryptedMetadata: { pubkey: user.pubkey, encryptedContent: 'test', ephemeralPubkey: user.pubkey },
  }, user.nsec)
})

When('the {string} user sends {string} to {string} with valid hub body', async ({ request }, role: string, _method: string, _path: string) => {
  const user = pm.roleUsers[role]
  if (!user) throw new Error(`No test user for role "${role}"`)

  shared.lastResponse = await apiPost(request, '/hubs', {
    name: uniqueName('PM Hub'),
    description: 'PM test hub',
  }, user.nsec)
})

When('the {string} user sends {string} to {string} with valid report body', async ({ request }, role: string, _method: string, _path: string) => {
  const user = pm.roleUsers[role]
  if (!user) throw new Error(`No test user for role "${role}"`)

  shared.lastResponse = await apiPost(request, '/reports', {
    title: uniqueName('PM Report'),
    category: 'general',
    encryptedContent: 'pm-test-encrypted-report',
    readerEnvelopes: [{
      pubkey: user.pubkey,
      wrappedKey: 'test-key',
      ephemeralPubkey: user.pubkey,
    }],
  }, user.nsec)
})

// ── Unauthenticated request step ────────────────────────────────────

When('an unauthenticated request is sent to {string} {string}', async ({ request }, method: string, path: string) => {
  const url = `${BASE_URL}${path}`
  let res
  switch (method) {
    case 'GET':
      res = await request.get(url, { headers: { 'Content-Type': 'application/json' } })
      break
    case 'POST':
      res = await request.post(url, {
        headers: { 'Content-Type': 'application/json' },
        data: {},
      })
      break
    case 'PATCH':
      res = await request.patch(url, {
        headers: { 'Content-Type': 'application/json' },
        data: {},
      })
      break
    case 'PUT':
      res = await request.put(url, {
        headers: { 'Content-Type': 'application/json' },
        data: {},
      })
      break
    case 'DELETE':
      res = await request.delete(url, { headers: { 'Content-Type': 'application/json' } })
      break
    default:
      throw new Error(`Unknown method: ${method}`)
  }
  shared.lastResponse = { status: res.status(), data: null }
})

// Status assertions are in assertions.steps.ts (shared across all features)

// ── Helper: send generic request ────────────────────────────────────

async function sendRequest(
  request: import('@playwright/test').APIRequestContext,
  method: string,
  path: string,
  nsec: string,
): Promise<{ status: number; data: unknown }> {
  // Strip /api prefix if present — api helpers add it
  const apiPath = path.startsWith('/api') ? path.slice(4) : path
  switch (method) {
    case 'GET':
      return apiGet(request, apiPath, nsec)
    case 'POST':
      return apiPost(request, apiPath, {}, nsec)
    case 'PATCH':
      return apiPatch(request, apiPath, {}, nsec)
    case 'PUT':
      return apiPut(request, apiPath, {}, nsec)
    case 'DELETE':
      return apiDelete(request, apiPath, nsec)
    default:
      throw new Error(`Unknown method: ${method}`)
  }
}
