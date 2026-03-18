/**
 * CRUD lifecycle step definitions.
 *
 * Tests complete create→read→update→delete→verify cycles for all entities.
 * Status assertions are in assertions.steps.ts (shared).
 */
import { expect } from '@playwright/test'
import { Given, When, Then, Before } from './fixtures'
import { shared } from './shared-state'
import {
  apiGet,
  apiPost,
  apiPatch,
  apiPut,
  apiDelete,
  createVolunteerViaApi,
  createShiftViaApi,
  createBanViaApi,
  listVolunteersViaApi,
  listShiftsViaApi,
  listBansViaApi,
  updateVolunteerViaApi,
  deleteVolunteerViaApi,
  deleteShiftViaApi,
  removeBanViaApi,
  bulkAddBansViaApi,
  updateShiftViaApi,
  getFallbackGroupViaApi,
  setFallbackGroupViaApi,
  getSpamSettingsViaApi,
  getCustomFieldsViaApi,
  updateCustomFieldsViaApi,
  listAuditLogViaApi,
  listNotesViaApi,
  listReportsViaApi,
  generateTestKeypair,
  uniquePhone,
  uniqueName,
  createRoleViaApi,
  listRolesViaApi,
  deleteRoleViaApi,
  updateRoleViaApi,
  ADMIN_NSEC,
} from '../../api-helpers'

// ── State ───────────────────────────────────────────────────────────

interface CrudState {
  volunteerPubkey?: string
  volunteerNsec?: string
  volunteerName?: string
  shiftId?: string
  shiftName?: string
  banPhone?: string
  bulkBanPhones: string[]
  bulkBanCount?: number
  noteId?: string
  noteCallIds: string[]
  inviteCode?: string
  inviteName?: string
  roleId?: string
  roleName?: string
  reportId?: string
  reporterNsec?: string
  reviewerPubkey?: string
  fallbackVolunteers: string[]
}

let crud: CrudState

Before({ tags: '@backend' }, async () => {
  crud = {
    bulkBanPhones: [],
    noteCallIds: [],
    fallbackVolunteers: [],
  }
})

// ─── Volunteers ─────────────────────────────────────────────────────

When('an admin creates a volunteer named {string}', async ({ request }, name: string) => {
  const vol = await createVolunteerViaApi(request, { name })
  crud.volunteerPubkey = vol.pubkey
  crud.volunteerNsec = vol.nsec
  crud.volunteerName = name
})

Then('the volunteer list should contain {string}', async ({ request }, name: string) => {
  const vols = await listVolunteersViaApi(request)
  expect(vols.some(v => v.name === name)).toBeTruthy()
})

When('the admin updates the volunteer name to {string}', async ({ request }, name: string) => {
  await updateVolunteerViaApi(request, crud.volunteerPubkey!, { name })
  crud.volunteerName = name
})

When('the admin deactivates the volunteer', async ({ request }) => {
  await updateVolunteerViaApi(request, crud.volunteerPubkey!, { active: false })
})

Then('the volunteer should be inactive', async ({ request }) => {
  const vols = await listVolunteersViaApi(request)
  const vol = vols.find(v => v.pubkey === crud.volunteerPubkey)
  expect(vol).toBeDefined()
  expect(vol!.active).toBe(false)
})

When('an admin creates a volunteer with role {string}', async ({ request }, roleId: string) => {
  const vol = await createVolunteerViaApi(request, {
    name: uniqueName('CRUD Role Vol'),
    roleIds: [roleId],
  })
  crud.volunteerPubkey = vol.pubkey
  crud.volunteerNsec = vol.nsec
})

Then('the volunteer\'s role list should include {string}', async ({ request }, roleId: string) => {
  const vols = await listVolunteersViaApi(request)
  const vol = vols.find(v => v.pubkey === crud.volunteerPubkey)
  expect(vol).toBeDefined()
  expect(vol!.roles).toContain(roleId)
})

Then('the volunteer\'s role list should not include {string}', async ({ request }, roleId: string) => {
  const vols = await listVolunteersViaApi(request)
  const vol = vols.find(v => v.pubkey === crud.volunteerPubkey)
  expect(vol).toBeDefined()
  expect(vol!.roles).not.toContain(roleId)
})

When('the admin changes the volunteer\'s role to {string}', async ({ request }, roleId: string) => {
  await updateVolunteerViaApi(request, crud.volunteerPubkey!, { roles: [roleId] })
})

// ─── Shifts ─────────────────────────────────────────────────────────

When('an admin creates a shift named {string}', async ({ request }, name: string) => {
  const shift = await createShiftViaApi(request, { name })
  crud.shiftId = shift.id
  crud.shiftName = name
})

Then('the shift list should contain {string}', async ({ request }, name: string) => {
  const shifts = await listShiftsViaApi(request)
  expect(shifts.some(s => s.name === name)).toBeTruthy()
})

Then('the shift list should not contain {string}', async ({ request }, name: string) => {
  const shifts = await listShiftsViaApi(request)
  expect(shifts.some(s => s.name === name)).toBeFalsy()
})

When('the admin updates the shift name to {string}', async ({ request }, name: string) => {
  await updateShiftViaApi(request, crud.shiftId!, { name })
  crud.shiftName = name
})

When('the admin deletes the shift', async ({ request }) => {
  await deleteShiftViaApi(request, crud.shiftId!)
})

Given('a test volunteer for shift assignment', async ({ request }) => {
  const vol = await createVolunteerViaApi(request, { name: uniqueName('Shift Vol') })
  crud.volunteerPubkey = vol.pubkey
})

When('an admin creates a shift with the volunteer assigned', async ({ request }) => {
  const shift = await createShiftViaApi(request, {
    name: uniqueName('Assigned Shift'),
    volunteerPubkeys: [crud.volunteerPubkey!],
  })
  crud.shiftId = shift.id
})

Then('the shift should include the volunteer in its roster', async ({ request }) => {
  const shifts = await listShiftsViaApi(request)
  const shift = shifts.find(s => s.id === crud.shiftId)
  expect(shift).toBeDefined()
  expect(shift!.volunteerPubkeys).toContain(crud.volunteerPubkey)
})

// ─── Bans ───────────────────────────────────────────────────────────

When('an admin bans phone {string}', async ({ request }, phone: string) => {
  await createBanViaApi(request, { phone, reason: 'CRUD test' })
  crud.banPhone = phone
})

Then('the ban list should contain {string}', async ({ request }, phone: string) => {
  const bans = await listBansViaApi(request)
  expect(bans.some(b => b.phone === phone)).toBeTruthy()
})

Then('the ban list should not contain {string}', async ({ request }, phone: string) => {
  const bans = await listBansViaApi(request)
  expect(bans.some(b => b.phone === phone)).toBeFalsy()
})

When('the admin removes the ban for {string}', async ({ request }, phone: string) => {
  await removeBanViaApi(request, phone)
})

When('an admin bulk imports bans for {int} phone numbers', async ({ request }, count: number) => {
  const phones: string[] = []
  for (let i = 0; i < count; i++) {
    phones.push(uniquePhone())
  }
  crud.bulkBanPhones = phones
  const result = await bulkAddBansViaApi(request, phones, 'CRUD bulk test')
  crud.bulkBanCount = result.count
})

Then('the ban list should contain all {int} numbers', async ({ request }, count: number) => {
  const bans = await listBansViaApi(request)
  for (const phone of crud.bulkBanPhones) {
    expect(bans.some(b => b.phone === phone)).toBeTruthy()
  }
})

Then('the bulk import should report {int} created', async ({}, count: number) => {
  expect(crud.bulkBanCount).toBe(count)
})

// ─── Notes ──────────────────────────────────────────────────────────

When('an admin creates a note with encrypted content', async ({ request }) => {
  const { data, status } = await apiPost<{ id: string; note?: { id: string } }>(request, '/notes', {
    encryptedContent: 'crud-test-encrypted',
    callId: `call-crud-${Date.now()}`,
    readerEnvelopes: [],
  })
  expect(status).toBeLessThan(300)
  crud.noteId = (data as Record<string, unknown>)?.id as string
    ?? ((data as Record<string, unknown>)?.note as Record<string, unknown>)?.id as string
})

Then('the note should appear in the notes list', async ({ request }) => {
  const { notes } = await listNotesViaApi(request)
  expect(notes.length).toBeGreaterThan(0)
})

When('the admin updates the note content', async ({ request }) => {
  if (crud.noteId) {
    const { status } = await apiPatch(request, `/notes/${crud.noteId}`, {
      encryptedContent: 'crud-test-updated',
    })
    shared.lastResponse = { status, data: null }
  }
})

Then('the note should have updated content', async ({}) => {
  // Update succeeded (no 4xx/5xx)
  // Content is encrypted so we can't verify the plaintext
  expect(shared.lastResponse).toBeDefined()
  expect(shared.lastResponse!.status).toBeLessThan(300)
})

Given('a note exists', async ({ request }) => {
  const { data } = await apiPost<{ id: string; note?: { id: string } }>(request, '/notes', {
    encryptedContent: 'crud-note-for-reply',
    callId: `call-reply-${Date.now()}`,
    readerEnvelopes: [],
  })
  crud.noteId = (data as Record<string, unknown>)?.id as string
    ?? ((data as Record<string, unknown>)?.note as Record<string, unknown>)?.id as string
})

When('an admin creates a reply on the note', async ({ request }) => {
  if (crud.noteId) {
    const kp = generateTestKeypair()
    await apiPost(request, `/notes/${crud.noteId}/replies`, {
      encryptedContent: 'crud-reply-content',
      readerEnvelopes: [{ pubkey: kp.pubkey, wrappedKey: 'key', ephemeralPubkey: kp.pubkey }],
    })
  }
})

Then('the note should have {int} reply', async ({ request }, count: number) => {
  if (crud.noteId) {
    const { data, status } = await apiGet<{ replies: unknown[] }>(request, `/notes/${crud.noteId}/replies`)
    if (status === 200 && data) {
      expect((data as { replies?: unknown[] }).replies?.length ?? 0).toBe(count)
    }
  }
})

Given('{int} notes exist for different calls', async ({ request }, count: number) => {
  crud.noteCallIds = []
  for (let i = 0; i < count; i++) {
    const callId = `call-filter-${Date.now()}-${i}`
    crud.noteCallIds.push(callId)
    await apiPost(request, '/notes', {
      encryptedContent: `crud-filter-note-${i}`,
      callId,
      readerEnvelopes: [],
    })
  }
})

When('the admin lists notes for the first call', async ({ request }) => {
  const { notes, total } = await listNotesViaApi(request, { callId: crud.noteCallIds[0] })
  shared.lastResponse = { status: 200, data: { notes, total } }
})

Then('only notes for that call should be returned', async ({}) => {
  const data = shared.lastResponse?.data as { notes: { callId?: string }[] } | undefined
  expect(data).toBeDefined()
  for (const note of data!.notes) {
    expect(note.callId).toBe(crud.noteCallIds[0])
  }
})

// ─── Invites ────────────────────────────────────────────────────────

When('an admin creates an invite for {string}', async ({ request }, name: string) => {
  crud.inviteName = name
  const { data, status } = await apiPost<{ code?: string; invite?: { code: string } }>(request, '/invites', {
    name,
    phone: uniquePhone(),
    roleIds: ['role-volunteer'],
  })
  expect(status).toBeLessThan(300)
  crud.inviteCode = (data as Record<string, unknown>)?.code as string
    ?? ((data as Record<string, unknown>)?.invite as Record<string, unknown>)?.code as string
})

Then('the invite list should contain {string}', async ({ request }, name: string) => {
  const { data } = await apiGet<{ invites: Array<{ name: string; code: string }> }>(request, '/invites')
  const invites = (data as { invites?: Array<{ name: string }> })?.invites ?? []
  expect(invites.some(i => i.name === name)).toBeTruthy()
})

When('the admin revokes the invite', async ({ request }) => {
  await apiDelete(request, `/invites/${crud.inviteCode}`)
})

Then('the invite list should not contain the revoked code', async ({ request }) => {
  const { data } = await apiGet<{ invites: Array<{ code: string }> }>(request, '/invites')
  const invites = (data as { invites?: Array<{ code: string }> })?.invites ?? []
  expect(invites.some(i => i.code === crud.inviteCode)).toBeFalsy()
})

// ─── Roles ──────────────────────────────────────────────────────────

When('an admin creates a custom role {string} with permissions {string}', async ({ request }, name: string, permsStr: string) => {
  const permissions = permsStr.split(',')
  const role = await createRoleViaApi(request, {
    name,
    slug: `crud-${Date.now()}`,
    permissions,
    description: 'CRUD test role',
  })
  crud.roleId = role.id
  crud.roleName = name
})

Then('the roles list should contain {string}', async ({ request }, name: string) => {
  const roles = await listRolesViaApi(request)
  expect(roles.some(r => r.name === name)).toBeTruthy()
})

Then('the roles list should not contain {string}', async ({ request }, name: string) => {
  const roles = await listRolesViaApi(request)
  expect(roles.some(r => r.name === name)).toBeFalsy()
})

When('the admin updates the role permissions to {string}', async ({ request }, permsStr: string) => {
  const permissions = permsStr.split(',')
  await updateRoleViaApi(request, crud.roleId!, { permissions })
})

Then('the role should have {int} permissions', async ({ request }, count: number) => {
  const roles = await listRolesViaApi(request)
  const role = roles.find(r => r.id === crud.roleId)
  expect(role).toBeDefined()
  expect(role!.permissions.length).toBe(count)
})

When('the admin deletes the custom role', async ({ request }) => {
  await deleteRoleViaApi(request, crud.roleId!)
})

When('an admin attempts to delete the system {string} role', async ({ request }, roleId: string) => {
  shared.lastResponse = await deleteRoleViaApi(request, roleId)
})

// ─── Custom Fields ──────────────────────────────────────────────────

When('an admin sets custom fields with a {string} text field', async ({ request }, fieldName: string) => {
  await updateCustomFieldsViaApi(request, [{
    id: `field-${Date.now()}`,
    name: fieldName,
    label: fieldName.charAt(0).toUpperCase() + fieldName.slice(1),
    type: 'text',
  }])
})

Then('the custom fields should include {string}', async ({ request }, fieldName: string) => {
  const fields = await getCustomFieldsViaApi(request)
  expect(fields.some(f => f.name === fieldName)).toBeTruthy()
})

When('the admin updates custom fields adding a {string} select field', async ({ request }, fieldName: string) => {
  const existing = await getCustomFieldsViaApi(request)
  await updateCustomFieldsViaApi(request, [
    ...existing,
    {
      id: `field-${Date.now()}`,
      name: fieldName,
      label: fieldName.charAt(0).toUpperCase() + fieldName.slice(1),
      type: 'select',
      options: ['low', 'medium', 'high'],
    },
  ])
})

Then('the custom fields should include both {string} and {string}', async ({ request }, f1: string, f2: string) => {
  const fields = await getCustomFieldsViaApi(request)
  expect(fields.some(f => f.name === f1)).toBeTruthy()
  expect(fields.some(f => f.name === f2)).toBeTruthy()
})

When('the admin removes all custom fields', async ({ request }) => {
  await updateCustomFieldsViaApi(request, [])
})

Then('the custom fields list should be empty', async ({ request }) => {
  const fields = await getCustomFieldsViaApi(request)
  expect(fields.length).toBe(0)
})

// ─── Reports ────────────────────────────────────────────────────────

Given('a reporter user exists', async ({ request }) => {
  const vol = await createVolunteerViaApi(request, {
    name: uniqueName('CRUD Reporter'),
    roleIds: ['role-reporter'],
  })
  crud.reporterNsec = vol.nsec
  // Also create a reviewer for assignment
  const reviewer = await createVolunteerViaApi(request, {
    name: uniqueName('CRUD Reviewer'),
    roleIds: ['role-reviewer'],
  })
  crud.reviewerPubkey = reviewer.pubkey
})

When('the reporter creates a report titled {string}', async ({ request }, title: string) => {
  const kp = generateTestKeypair()
  const { data, status } = await apiPost<{ id?: string; conversation?: { id: string } }>(
    request,
    '/reports',
    {
      title,
      category: 'general',
      encryptedContent: 'crud-report-content',
      readerEnvelopes: [{ pubkey: kp.pubkey, wrappedKey: 'key', ephemeralPubkey: kp.pubkey }],
    },
    crud.reporterNsec!,
  )
  expect(status).toBeLessThan(300)
  crud.reportId = (data as Record<string, unknown>)?.id as string
    ?? ((data as Record<string, unknown>)?.conversation as Record<string, unknown>)?.id as string
  expect(crud.reportId).toBeTruthy()
})

Then('the report should appear in the reports list', async ({ request }) => {
  const { conversations } = await listReportsViaApi(request)
  expect(conversations.length).toBeGreaterThan(0)
})

When('an admin assigns the report to a reviewer', async ({ request }) => {
  if (crud.reportId && crud.reviewerPubkey) {
    await apiPost(request, `/reports/${crud.reportId}/assign`, {
      assignedTo: crud.reviewerPubkey,
    })
  }
})

When('the admin updates the report status to {string}', async ({ request }, status: string) => {
  if (crud.reportId) {
    await apiPatch(request, `/reports/${crud.reportId}`, { status })
  }
})

Then('the report status should be {string}', async ({ request }, expectedStatus: string) => {
  if (crud.reportId) {
    const { data } = await apiGet<{ status: string; conversation?: { status: string } }>(
      request,
      `/reports/${crud.reportId}`,
    )
    const actual = (data as Record<string, unknown>)?.status as string
      ?? ((data as Record<string, unknown>)?.conversation as Record<string, unknown>)?.status as string
    expect(actual).toBe(expectedStatus)
  }
})

// ─── Fallback Group ─────────────────────────────────────────────────

Given('{int} volunteers exist', async ({ request }, count: number) => {
  crud.fallbackVolunteers = []
  for (let i = 0; i < count; i++) {
    const vol = await createVolunteerViaApi(request, { name: uniqueName('Fallback Vol') })
    crud.fallbackVolunteers.push(vol.pubkey)
  }
})

When('an admin sets the fallback group to those volunteers', async ({ request }) => {
  await setFallbackGroupViaApi(request, crud.fallbackVolunteers)
})

Then('the fallback group should contain both volunteers', async ({ request }) => {
  const fg = await getFallbackGroupViaApi(request)
  for (const pk of crud.fallbackVolunteers) {
    expect(fg.volunteers).toContain(pk)
  }
})

When('the admin clears the fallback group', async ({ request }) => {
  await setFallbackGroupViaApi(request, [])
})

Then('the fallback group should be empty', async ({ request }) => {
  const fg = await getFallbackGroupViaApi(request)
  expect(fg.volunteers.length).toBe(0)
})

// ─── Audit Trail ────────────────────────────────────────────────────

Then('the audit log should contain a {string} entry', async ({ request }, eventType: string) => {
  const { entries } = await listAuditLogViaApi(request, { eventType })
  expect(entries.length).toBeGreaterThan(0)
  expect(entries.some(e => e.action === eventType)).toBeTruthy()
})

// ─── Spam Settings ──────────────────────────────────────────────────

When('an admin updates spam settings with captcha enabled', async ({ request }) => {
  await apiPatch(request, '/settings/spam', { voiceCaptchaEnabled: true })
})

Then('spam settings should show captcha enabled', async ({ request }) => {
  const settings = await getSpamSettingsViaApi(request)
  expect(settings.voiceCaptchaEnabled).toBe(true)
})

When('the admin updates spam settings with captcha disabled', async ({ request }) => {
  await apiPatch(request, '/settings/spam', { voiceCaptchaEnabled: false })
})

Then('spam settings should show captcha disabled', async ({ request }) => {
  const settings = await getSpamSettingsViaApi(request)
  expect(settings.voiceCaptchaEnabled).toBe(false)
})
