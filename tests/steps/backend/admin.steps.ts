/**
 * Backend admin step definitions.
 * Verifies volunteer CRUD, shifts, bans, audit log, and settings mutations via API.
 */
import { expect } from '@playwright/test'
import { Given, When, Then } from './fixtures'
import { state } from './common.steps'
import {
  apiGet,
  apiPost,
  apiPatch,
  apiPut,
  apiDelete,
  createVolunteerViaApi,
  deleteVolunteerViaApi,
  listVolunteersViaApi,
  updateVolunteerViaApi,
  createShiftViaApi,
  deleteShiftViaApi,
  listShiftsViaApi,
  updateShiftViaApi,
  createBanViaApi,
  removeBanViaApi,
  listBansViaApi,
  bulkAddBansViaApi,
  listAuditLogViaApi,
  getSpamSettingsViaApi,
  getTranscriptionSettingsViaApi,
  getCustomFieldsViaApi,
  updateCustomFieldsViaApi,
  uniquePhone,
  type AuditEntry,
} from '../../api-helpers'
import { sha256 } from '@noble/hashes/sha2.js'
import { utf8ToBytes } from '@noble/ciphers/utils.js'
import { bytesToHex } from '@noble/hashes/utils.js'

// ── Local admin test state ───────────────────────────────────────

interface AdminTestState {
  auditEntries: AuditEntry[]
  tamperedIndex?: number
  chainValid?: boolean
}

const adminState: AdminTestState = {
  auditEntries: [],
}

// ── Audit Log: Hash Chain ────────────────────────────────────────

Given('an empty audit log', async ({ request }) => {
  // Reset server to get a clean audit log
  const BASE_URL = process.env.TEST_HUB_URL || 'http://localhost:3000'
  const TEST_SECRET = process.env.DEV_RESET_SECRET || 'test-reset-secret'
  const res = await request.post(`${BASE_URL}/api/test-reset`, {
    headers: { 'Content-Type': 'application/json', 'X-Test-Secret': TEST_SECRET },
  })
  expect(res.ok()).toBeTruthy()
  adminState.auditEntries = []
})

When('the first entry is added', async ({ request }) => {
  // Trigger an audit event by creating a volunteer
  await createVolunteerViaApi(request, { name: `Audit First ${Date.now()}` })
  const { entries } = await listAuditLogViaApi(request, { limit: 1 })
  adminState.auditEntries = entries
})

Then('the entry hash should be computed', async ({}) => {
  expect(adminState.auditEntries.length).toBeGreaterThan(0)
  const entry = adminState.auditEntries[0]
  expect(entry.entryHash).toBeTruthy()
})

Then('the previous entry hash should be null', async ({}) => {
  expect(adminState.auditEntries.length).toBeGreaterThan(0)
  const entry = adminState.auditEntries[0]
  // First entry in a clean log should have no previous hash (empty string from server)
  expect(entry.previousEntryHash).toBeFalsy()
})

Given('an audit log with {int} entry/entries', async ({ request }, count: number) => {
  // Reset and create entries
  const BASE_URL = process.env.TEST_HUB_URL || 'http://localhost:3000'
  const TEST_SECRET = process.env.DEV_RESET_SECRET || 'test-reset-secret'
  await request.post(`${BASE_URL}/api/test-reset`, {
    headers: { 'Content-Type': 'application/json', 'X-Test-Secret': TEST_SECRET },
  })

  for (let i = 0; i < count; i++) {
    await createVolunteerViaApi(request, { name: `Audit Chain ${Date.now()}-${i}` })
  }
  const { entries } = await listAuditLogViaApi(request, { limit: count + 5 })
  adminState.auditEntries = entries
})


When('a new entry is added', async ({ request }) => {
  await createVolunteerViaApi(request, { name: `Audit New ${Date.now()}` })
  const { entries } = await listAuditLogViaApi(request, { limit: 20 })
  adminState.auditEntries = entries
})

Then('the new entry should reference the previous entry hash', async ({}) => {
  expect(adminState.auditEntries.length).toBeGreaterThan(1)
  const latest = adminState.auditEntries[0]
  expect(latest.previousEntryHash).toBeTruthy()
})

When('the event field of entry {int} is modified', async ({}, index: number) => {
  adminState.tamperedIndex = index
  // Tampering is simulated client-side by modifying the fetched entry
  if (adminState.auditEntries.length >= index) {
    const entry = { ...adminState.auditEntries[index - 1] }
    entry.event = 'TAMPERED_EVENT'
    adminState.auditEntries[index - 1] = entry
  }
})

When('the actor field of entry {int} is modified', async ({}, index: number) => {
  adminState.tamperedIndex = index
  if (adminState.auditEntries.length >= index) {
    const entry = { ...adminState.auditEntries[index - 1] }
    entry.actorPubkey = 'deadbeef'.repeat(8)
    adminState.auditEntries[index - 1] = entry
  }
})

When('the timestamp of entry {int} is modified', async ({}, index: number) => {
  adminState.tamperedIndex = index
  if (adminState.auditEntries.length >= index) {
    const entry = { ...adminState.auditEntries[index - 1] }
    entry.createdAt = '2020-01-01T00:00:00.000Z'
    adminState.auditEntries[index - 1] = entry
  }
})

Then('chain verification should fail at entry {int}', async ({}, index: number) => {
  // Verify that recomputing the hash chain detects the tamper
  expect(adminState.tamperedIndex).toBe(index)
  // The tampered entry's recomputed hash won't match its stored hash
  const entry = adminState.auditEntries[index - 1]
  if (entry.entryHash) {
    // Recompute hash matching server's hashAuditEntry()
    const content = `${entry.id}:${entry.event}:${entry.actorPubkey}:${entry.createdAt}:${JSON.stringify(entry.details)}:${entry.previousEntryHash || ''}`
    const recomputed = bytesToHex(sha256(utf8ToBytes(content)))
    expect(recomputed).not.toBe(entry.entryHash)
  }
})

When('the chain is verified', async ({}) => {
  // Verify the chain integrity by checking each entry's hash
  // Entries are returned newest-first, so reverse for chronological order
  const entries = [...adminState.auditEntries].reverse()
  adminState.chainValid = true
  for (let i = 1; i < entries.length; i++) {
    const current = entries[i]
    const previous = entries[i - 1]
    if (current.previousEntryHash && previous.entryHash) {
      if (current.previousEntryHash !== previous.entryHash) {
        adminState.chainValid = false
        break
      }
    }
  }
})

Then('all entries should pass integrity checks', async ({}) => {
  expect(adminState.chainValid).toBeTruthy()
})

// ── Shift Status Query ─────────────────────────────────────────

When('I query the shift status', async ({ request }) => {
  const { status, data } = await apiGet<{ shifts: Array<{ volunteerPubkeys: string[] }> }>(request, '/shifts')
  expect(status).toBe(200)
  state.lastApiResponse = { status, data }
})

Then('{int} volunteers are reported as on-shift', async ({}, count: number) => {
  const data = state.lastApiResponse?.data as { shifts: Array<{ volunteerPubkeys: string[] }> }
  expect(data).toBeTruthy()
  // Count unique volunteer pubkeys across all current shifts
  const uniqueVolunteers = new Set<string>()
  for (const shift of data.shifts) {
    for (const pk of shift.volunteerPubkeys) {
      uniqueVolunteers.add(pk)
    }
  }
  expect(uniqueVolunteers.size).toBe(count)
})
