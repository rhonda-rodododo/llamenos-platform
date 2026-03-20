/**
 * CMS step definitions for Epics 317–325.
 *
 * Covers templates, contacts, records, events, interactions,
 * and evidence. Reuses the existing "case management is enabled"
 * and "the server is reset" steps from entity-schema.steps.ts
 * and common.steps.ts respectively.
 */
import { expect } from '@playwright/test'
import { Given, When, Then, Before, getState, setState } from './fixtures'
import { getSharedState, setLastResponse } from './shared-state'
import {
  createEntityTypeViaApi,
  listEntityTypesViaApi,
  listTemplatesViaApi,
  getTemplateViaApi,
  applyTemplateViaApi,
  createContactViaApi,
  listContactsViaApi,
  lookupContactViaApi,
  updateContactViaApi,
  deleteContactViaApi,
  createRecordViaApi,
  listRecordsViaApi,
  getRecordViaApi,
  updateRecordViaApi,
  linkContactToRecordViaApi,
  listRecordContactsViaApi,
  assignRecordViaApi,
  createEventViaApi,
  linkRecordToEventViaApi,
  linkReportToEventViaApi,
  listEventRecordsViaApi,
  listEventReportsViaApi,
  createInteractionViaApi,
  listInteractionsViaApi,
  uploadEvidenceViaApi,
  getEvidenceCustodyViaApi,
  verifyEvidenceIntegrityViaApi,
  createVolunteerViaApi,
  createReportViaApi,
  createRoleViaApi,
  apiGet,
} from '../../api-helpers'

// ── Local State ────────────────────────────────────────────────────

interface CmsState {
  // Templates
  templateCatalog: Array<Record<string, unknown>>
  templateDetails?: Record<string, unknown>
  applyResult?: Record<string, unknown>
  // Contacts
  contacts: Array<Record<string, unknown>>
  lastContact?: Record<string, unknown>
  lookedUpContact?: Record<string, unknown> | null
  contactListResult?: { contacts: Record<string, unknown>[]; total: number; hasMore: boolean }
  // Records
  entityTypeIds: Map<string, string>
  records: Array<Record<string, unknown>>
  lastRecord?: Record<string, unknown>
  recordListResult?: { records: Record<string, unknown>[]; total: number; hasMore: boolean }
  numberedEntityTypeId?: string
  // Events
  eventEntityTypeIds: Map<string, string>
  lastEvent?: Record<string, unknown>
  eventRecordLinks?: { links: Record<string, unknown>[] }
  eventReportLinks?: { links: Record<string, unknown>[] }
  // Interactions
  lastInteraction?: Record<string, unknown>
  interactionListResult?: { interactions: Record<string, unknown>[]; total: number }
  // Evidence
  lastEvidence?: Record<string, unknown>
  custodyChain?: { custodyChain: Record<string, unknown>[]; total: number }
  verifyResult?: { valid: boolean; originalHash: string; currentHash: string }
  // Report
  lastReportId?: string
  // Volunteer for permission tests
  volunteerNsec?: string
  volunteerPubkey?: string
}

const CMS_KEY = 'cms'

function getCmsState(world: Record<string, unknown>): CmsState {
  return getState<CmsState>(world, CMS_KEY)
}


Before({ tags: '@cases or @contacts or @events or @evidence or @templates or @reports' }, async ({ world }) => {
  const cms = {
    templateCatalog: [],
    contacts: [],
    entityTypeIds: new Map(),
    records: [],
    eventEntityTypeIds: new Map(),
  }
  setState(world, CMS_KEY, cms)
})

// ── Helper: resolve or create entity type by name ──────────────────

async function resolveEntityTypeId(
  request: import('@playwright/test').APIRequestContext,
  name: string,
): Promise<string> {
  const cached = getCmsState(world).entityTypeIds.get(name)
  if (cached) return cached

  const types = await listEntityTypesViaApi(request)
  const existing = types.find(t => t.name === name)
  if (existing) {
    const id = existing.id as string
    getCmsState(world).entityTypeIds.set(name, id)
    return id
  }

  const created = await createEntityTypeViaApi(request, { name, category: 'case' })
  const id = created.id as string
  getCmsState(world).entityTypeIds.set(name, id)
  return id
}

async function resolveEventEntityTypeId(
  request: import('@playwright/test').APIRequestContext,
  name: string,
): Promise<string> {
  const cached = getCmsState(world).eventEntityTypeIds.get(name)
  if (cached) return cached

  const types = await listEntityTypesViaApi(request)
  const existing = types.find(t => t.name === name)
  if (existing) {
    const id = existing.id as string
    getCmsState(world).eventEntityTypeIds.set(name, id)
    return id
  }

  const created = await createEntityTypeViaApi(request, { name, category: 'event' })
  const id = created.id as string
  getCmsState(world).eventEntityTypeIds.set(name, id)
  return id
}

// ============================================================
// TEMPLATE STEPS (Epic 317)
// ============================================================

When('the admin lists available templates', async ({ request, world }) => {
  getCmsState(world).templateCatalog = await listTemplatesViaApi(request)
})

Then('the template catalog should have at least {int} templates', async ({ world }, count: number) => {
  expect(getCmsState(world).templateCatalog.length).toBeGreaterThanOrEqual(count)
})

Then('each template should have an id, name, and description', async () => {
  for (const t of getCmsState(world).templateCatalog) {
    expect(t.id).toBeTruthy()
    expect(t.name).toBeTruthy()
    expect(t.description).toBeTruthy()
  }
})

When('the admin gets details for template {string}', async ({ request, world }, templateId: string) => {
  getCmsState(world).templateDetails = await getTemplateViaApi(request, templateId)
})

Then('the template should have entity types', async () => {
  expect(getCmsState(world).templateDetails).toBeTruthy()
  const entityTypes = getCmsState(world).templateDetails!.entityTypes as unknown[]
  expect(entityTypes.length).toBeGreaterThan(0)
})

Then('the template should have relationship types', async () => {
  expect(getCmsState(world).templateDetails).toBeTruthy()
  const relTypes = getCmsState(world).templateDetails!.relationshipTypes as unknown[]
  expect(relTypes.length).toBeGreaterThan(0)
})

When('the admin applies template {string}', async ({ request, world }, templateId: string) => {
  const result = await applyTemplateViaApi(request, templateId)
  if (result.status !== 201 && result.status !== 200) {
    setLastResponse(world, { status: result.status, data: result.data })
    return
  }
  getCmsState(world).applyResult = result.data
})

Then('the template should be applied successfully', async () => {
  expect(getCmsState(world).applyResult).toBeTruthy()
  expect(getCmsState(world).applyResult!.applied).toBe(true)
})

Then('entity types from the template should exist', async ({request, world}) => {
  const types = await listEntityTypesViaApi(request)
  expect(types.length).toBeGreaterThan(0)
})

Then('relationship types from the template should exist', async ({request, world}) => {
  const { data } = await apiGet<{ relationshipTypes: unknown[] }>(request, '/settings/cms/relationship-types')
  expect(data.relationshipTypes.length).toBeGreaterThan(0)
})

Then('entity types from both templates should exist', async ({request, world}) => {
  const types = await listEntityTypesViaApi(request)
  // jail-support creates arrest_case; street-medic creates medical_encounter
  const hasArrest = types.some(t => t.name === 'arrest_case')
  const hasPatient = types.some(t => t.name === 'medical_encounter')
  expect(hasArrest).toBe(true)
  expect(hasPatient).toBe(true)
})

When('a volunteer tries to apply template {string}', async ({request, world}, templateId: string) => {
  const vol = await createVolunteerViaApi(request, { name: `vol-tmpl-${Date.now()}` })
  const result = await applyTemplateViaApi(request, templateId, vol.nsec)
  setLastResponse(world, { status: result.status, data: result.data })
})

// ============================================================
// CONTACT STEPS (Epic 318)
// ============================================================

When('the admin creates a contact with encrypted profile', async ({ request, world }) => {
  getCmsState(world).lastContact = await createContactViaApi(request)
})

Then('the contact should have a generated UUID id', async () => {
  expect(getCmsState(world).lastContact).toBeTruthy()
  const id = getCmsState(world).lastContact!.id as string
  expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
})

Then('the contact should have an encrypted summary', async () => {
  expect(getCmsState(world).lastContact!.encryptedSummary).toBeTruthy()
})

Given('{int} contacts exist', async ({ request, world }, count: number) => {
  for (let i = 0; i < count; i++) {
    const c = await createContactViaApi(request)
    getCmsState(world).contacts.push(c)
  }
})

When('the admin lists contacts with limit {int}', async ({ request, world }, limit: number) => {
  getCmsState(world).contactListResult = await listContactsViaApi(request, { page: 1, limit })
})

Then('the contact list should have {int} contacts', async ({ world }, count: number) => {
  expect(getCmsState(world).contactListResult).toBeTruthy()
  expect(getCmsState(world).contactListResult!.contacts.length).toBe(count)
})

Then('the contact list should indicate more pages', async () => {
  expect(getCmsState(world).contactListResult!.hasMore).toBe(true)
})

Given('a contact exists with identifier hash {string}', async ({ request, world }, hash: string) => {
  getCmsState(world).lastContact = await createContactViaApi(request, { identifierHashes: [hash] })
})

When('the admin looks up contact by identifier hash {string}', async ({ request, world }, hash: string) => {
  const result = await lookupContactViaApi(request, hash)
  getCmsState(world).lookedUpContact = result.contact
})

Then('the looked-up contact should match the created contact', async () => {
  expect(getCmsState(world).lookedUpContact).toBeTruthy()
  expect(getCmsState(world).lookedUpContact!.id).toBe(getCmsState(world).lastContact!.id)
})

Given('a contact exists', async ({ request, world }) => {
  getCmsState(world).lastContact = await createContactViaApi(request)
})

When('the admin updates the contact encrypted summary', async ({ request, world }) => {
  const updated = await updateContactViaApi(
    request,
    getCmsState(world).lastContact!.id as string,
    { encryptedSummary: 'dXBkYXRlZCBjb250YWN0' },
  )
  getCmsState(world).lastContact = updated
})

Then('the contact should have the updated summary', async () => {
  expect(getCmsState(world).lastContact!.encryptedSummary).toBe('dXBkYXRlZCBjb250YWN0')
})

When('the admin deletes the contact', async ({ request, world }) => {
  await deleteContactViaApi(request, getCmsState(world).lastContact!.id as string)
})

Then('the contact should no longer exist', async ({ request, world }) => {
  const { status } = await apiGet(request, `/directory/${getCmsState(world).lastContact!.id}`)
  expect(status).toBe(404)
})

Given('a volunteer exists with only contacts:view permission', async ({ request, world }) => {
  const role = await createRoleViaApi(request, {
    name: `Viewer ${Date.now()}`,
    slug: `viewer-${Date.now()}`,
    permissions: ['contacts:view'],
    description: 'Contacts view only',
  })
  const vol = await createVolunteerViaApi(request, {
    name: `vol-viewer-${Date.now()}`,
    roleIds: [role.id],
  })
  getCmsState(world).volunteerNsec = vol.nsec
  getCmsState(world).volunteerPubkey = vol.pubkey
})

When('the volunteer lists contacts', async ({ request, world }) => {
  try {
    getCmsState(world).contactListResult = await listContactsViaApi(request, {}, getCmsState(world).volunteerNsec!)
  } catch {
    // If it fails with an error, capture the status
    setLastResponse(world, { status: 403, data: null })
  }
})

Then('the contact list request should succeed', async () => {
  expect(getCmsState(world).contactListResult).toBeTruthy()
})

When('the volunteer tries to create a contact', async ({ request, world }) => {
  try {
    await createContactViaApi(request, {}, getCmsState(world).volunteerNsec!)
    setLastResponse(world, { status: 201, data: null })
  } catch (e: unknown) {
    const msg = (e as Error).message
    const match = msg.match(/(\d{3})/)
    setLastResponse(world, { status: match ? parseInt(match[1]) : 500, data: null })
  }
})

// ============================================================
// RECORD STEPS (Epic 319)
// ============================================================

// NOTE: "an entity type {string} exists" is defined in entity-schema.steps.ts.
// CMS steps use resolveEntityTypeId() internally to get the ID when needed.

When('the admin creates a record of type {string} with status hash {string}', async ({ request, world }, typeName: string, statusHash: string) => {
  const entityTypeId = await resolveEntityTypeId(request, typeName)
  getCmsState(world).lastRecord = await createRecordViaApi(request, entityTypeId, { statusHash })
  getCmsState(world).records.push(getCmsState(world).lastRecord)
})

Then('the record should have a generated UUID id', async () => {
  expect(getCmsState(world).lastRecord).toBeTruthy()
  const id = getCmsState(world).lastRecord!.id as string
  expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
})

Then('the record should have entity type {string}', async ({ request, world }, typeName: string) => {
  const entityTypeId = await resolveEntityTypeId(request, typeName)
  expect(getCmsState(world).lastRecord!.entityTypeId).toBe(entityTypeId)
})

Then('the record should have status hash {string}', async ({ world }, statusHash: string) => {
  expect(getCmsState(world).lastRecord!.statusHash).toBe(statusHash)
})

Given('a record of type {string} exists', async ({ request, world }, typeName: string) => {
  const entityTypeId = await resolveEntityTypeId(request, typeName)
  getCmsState(world).lastRecord = await createRecordViaApi(request, entityTypeId)
  getCmsState(world).records.push(getCmsState(world).lastRecord)
})

Given('a record of type {string} exists with status hash {string}', async ({ request, world }, typeName: string, statusHash: string) => {
  const entityTypeId = await resolveEntityTypeId(request, typeName)
  getCmsState(world).lastRecord = await createRecordViaApi(request, entityTypeId, { statusHash })
  getCmsState(world).records.push(getCmsState(world).lastRecord)
})

When('the admin lists records filtered by entity type {string}', async ({ request, world }, typeName: string) => {
  const entityTypeId = await resolveEntityTypeId(request, typeName)
  getCmsState(world).recordListResult = await listRecordsViaApi(request, { entityTypeId })
})

Then('all returned records should have entity type {string}', async ({ request, world }, typeName: string) => {
  const entityTypeId = await resolveEntityTypeId(request, typeName)
  expect(getCmsState(world).recordListResult).toBeTruthy()
  for (const r of getCmsState(world).recordListResult!.records) {
    expect(r.entityTypeId).toBe(entityTypeId)
  }
})

When('the admin links the contact to the record with role {string}', async ({ request, world }, role: string) => {
  await linkContactToRecordViaApi(
    request,
    getCmsState(world).lastRecord!.id as string,
    getCmsState(world).lastContact!.id as string,
    role,
  )
})

Then('the record should have {int} linked contact', async ({ request, world }, count: number) => {
  const result = await listRecordContactsViaApi(request, getCmsState(world).lastRecord!.id as string)
  expect(result.contacts.length).toBe(count)
})

Then('the linked contact should have role {string}', async ({ request, world }, role: string) => {
  const result = await listRecordContactsViaApi(request, getCmsState(world).lastRecord!.id as string)
  expect(result.contacts.some(c => c.role === role)).toBe(true)
})

Given('a volunteer exists for assignment', async ({ request, world }) => {
  const vol = await createVolunteerViaApi(request, { name: `vol-assign-${Date.now()}` })
  getCmsState(world).volunteerNsec = vol.nsec
  getCmsState(world).volunteerPubkey = vol.pubkey
})

When('the admin assigns the volunteer to the record', async ({ request, world }) => {
  await assignRecordViaApi(request, getCmsState(world).lastRecord!.id as string, [getCmsState(world).volunteerPubkey!])
})

Then('the record should include the volunteer in assignedTo', async ({ request, world }) => {
  const record = await getRecordViaApi(request, getCmsState(world).lastRecord!.id as string)
  const assignedTo = record.assignedTo as string[]
  expect(assignedTo).toContain(getCmsState(world).volunteerPubkey!)
})

Given('an entity type with number prefix {string} exists', async ({ request, world }, prefix: string) => {
  const name = `numbered_type_${Date.now()}`
  const created = await createEntityTypeViaApi(request, {
    name,
    category: 'case',
    numberPrefix: prefix,
  })
  getCmsState(world).numberedEntityTypeId = created.id as string
  getCmsState(world).entityTypeIds.set(name, created.id as string)
})

When('the admin creates a record of the numbered type', async ({ request, world }) => {
  getCmsState(world).lastRecord = await createRecordViaApi(request, getCmsState(world).numberedEntityTypeId!)
  getCmsState(world).records.push(getCmsState(world).lastRecord)
})

Then('the record should have a case number matching {string}', async ({ world }, pattern: string) => {
  const year = new Date().getFullYear()
  const expected = pattern.replace('{year}', String(year))
  expect(getCmsState(world).lastRecord!.caseNumber).toBe(expected)
})

When('the admin creates another record of the numbered type', async ({ request, world }) => {
  getCmsState(world).lastRecord = await createRecordViaApi(request, getCmsState(world).numberedEntityTypeId!)
  getCmsState(world).records.push(getCmsState(world).lastRecord)
})

Then('the second record should have a case number matching {string}', async ({ world }, pattern: string) => {
  const year = new Date().getFullYear()
  const expected = pattern.replace('{year}', String(year))
  expect(getCmsState(world).lastRecord!.caseNumber).toBe(expected)
})

When('the admin updates the record status hash to {string}', async ({ request, world }, statusHash: string) => {
  const updated = await updateRecordViaApi(
    request,
    getCmsState(world).lastRecord!.id as string,
    { statusHash },
  )
  getCmsState(world).lastRecord = updated
})

Given('a volunteer exists with cases:read-own and cases:create permissions', async ({ request, world }) => {
  const role = await createRoleViaApi(request, {
    name: `Scoped Vol ${Date.now()}`,
    slug: `scoped-vol-${Date.now()}`,
    permissions: ['cases:read-own', 'cases:create', 'cases:update-own'],
    description: 'Scoped record access',
  })
  const vol = await createVolunteerViaApi(request, {
    name: `vol-scoped-${Date.now()}`,
    roleIds: [role.id],
  })
  getCmsState(world).volunteerNsec = vol.nsec
  getCmsState(world).volunteerPubkey = vol.pubkey
})

When('the volunteer lists records', async ({ request, world }) => {
  getCmsState(world).recordListResult = await listRecordsViaApi(request, {}, getCmsState(world).volunteerNsec!)
})

Then('the volunteer should see {int} records', async ({ world }, count: number) => {
  expect(getCmsState(world).recordListResult).toBeTruthy()
  expect(getCmsState(world).recordListResult!.records.length).toBe(count)
})

// ============================================================
// EVENT STEPS (Epic 320)
// ============================================================

Given('an event entity type {string} exists', async ({request, world}, name: string) => {
  await resolveEventEntityTypeId(request, name)
})

When('the admin creates an event of type {string}', async ({ request, world }, typeName: string) => {
  const entityTypeId = await resolveEventEntityTypeId(request, typeName)
  getCmsState(world).lastEvent = await createEventViaApi(request, entityTypeId)
})

Then('the event should have a generated UUID id', async () => {
  expect(getCmsState(world).lastEvent).toBeTruthy()
  const id = getCmsState(world).lastEvent!.id as string
  expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
})

Then('the event should have a start date', async () => {
  expect(getCmsState(world).lastEvent!.startDate).toBeTruthy()
})

Given('an event of type {string} exists', async ({ request, world }, typeName: string) => {
  const entityTypeId = await resolveEventEntityTypeId(request, typeName)
  getCmsState(world).lastEvent = await createEventViaApi(request, entityTypeId)
})

When('the admin links the record to the event', async ({ request, world }) => {
  await linkRecordToEventViaApi(
    request,
    getCmsState(world).lastEvent!.id as string,
    getCmsState(world).lastRecord!.id as string,
  )
})

Then('the event should have {int} linked record', async ({ request, world }, count: number) => {
  const result = await listEventRecordsViaApi(request, getCmsState(world).lastEvent!.id as string)
  expect(result.links.length).toBe(count)
})

Given('a report exists', async ({ request, world }) => {
  const report = await createReportViaApi(request)
  getCmsState(world).lastReportId = report.id
})

When('the admin links the report to the event', async ({ request, world }) => {
  await linkReportToEventViaApi(
    request,
    getCmsState(world).lastEvent!.id as string,
    getCmsState(world).lastReportId!,
  )
})

Then('the event should have {int} linked report', async ({ request, world }, count: number) => {
  const result = await listEventReportsViaApi(request, getCmsState(world).lastEvent!.id as string)
  expect(result.links.length).toBe(count)
})

Given('{int} records of type {string} are linked to the event', async ({ request, world }, count: number, typeName: string) => {
  const entityTypeId = await resolveEntityTypeId(request, typeName)
  for (let i = 0; i < count; i++) {
    const record = await createRecordViaApi(request, entityTypeId)
    await linkRecordToEventViaApi(request, getCmsState(world).lastEvent!.id as string, record.id as string)
    getCmsState(world).records.push(record)
  }
})

When('the admin lists records linked to the event', async ({ request, world }) => {
  getCmsState(world).eventRecordLinks = await listEventRecordsViaApi(request, getCmsState(world).lastEvent!.id as string)
})

Then('{int} record links should be returned', async ({ world }, count: number) => {
  expect(getCmsState(world).eventRecordLinks!.links.length).toBe(count)
})

// ============================================================
// INTERACTION STEPS (Epic 323)
// ============================================================

When('the admin creates a comment interaction on the record', async ({ request, world }) => {
  getCmsState(world).lastInteraction = await createInteractionViaApi(
    request,
    getCmsState(world).lastRecord!.id as string,
    {
      interactionType: 'comment',
      encryptedContent: 'dGVzdCBjb21tZW50',
      interactionTypeHash: 'comment_hash',
    },
  )
})

Then('the interaction should have type {string}', async ({ world }, interactionType: string) => {
  expect(getCmsState(world).lastInteraction!.interactionType).toBe(interactionType)
})

Then('the interaction should have encrypted content', async () => {
  expect(getCmsState(world).lastInteraction!.encryptedContent).toBeTruthy()
})

When('the admin updates the record status with change metadata', async ({ request, world }) => {
  await updateRecordViaApi(
    request,
    getCmsState(world).lastRecord!.id as string,
    {
      statusHash: 'status_updated',
      statusChangeTypeHash: 'status_change_hash',
      statusChangeContent: 'dGVzdCBzdGF0dXMgY2hhbmdl',
      statusChangeEnvelopes: [{
        pubkey: 'a'.repeat(64),
        wrappedKey: 'b'.repeat(64),
        ephemeralPubkey: 'a'.repeat(64),
      }],
    },
  )
})

Then('the record interactions should include a {string} entry', async ({ request, world }, interactionType: string) => {
  const result = await listInteractionsViaApi(request, getCmsState(world).lastRecord!.id as string)
  const hasType = result.interactions.some(i => i.interactionType === interactionType)
  expect(hasType).toBe(true)
})

Given('{int} comment interactions exist on the record', async ({ request, world }, count: number) => {
  for (let i = 0; i < count; i++) {
    await createInteractionViaApi(
      request,
      getCmsState(world).lastRecord!.id as string,
      {
        interactionType: 'comment',
        encryptedContent: `dGVzdCBjb21tZW50 ${i}`,
        interactionTypeHash: 'comment_hash',
      },
    )
  }
})

When('the admin lists interactions for the record', async ({ request, world }) => {
  getCmsState(world).interactionListResult = await listInteractionsViaApi(request, getCmsState(world).lastRecord!.id as string)
})

Then('{int} interactions should be returned', async ({ world }, count: number) => {
  expect(getCmsState(world).interactionListResult!.interactions.length).toBe(count)
})

Then('the interactions should be in chronological order', async () => {
  const interactions = getCmsState(world).interactionListResult!.interactions
  for (let i = 1; i < interactions.length; i++) {
    const prev = new Date(interactions[i - 1].createdAt as string).getTime()
    const curr = new Date(interactions[i].createdAt as string).getTime()
    expect(curr).toBeGreaterThanOrEqual(prev)
  }
})

// ============================================================
// EVIDENCE STEPS (Epic 325)
// ============================================================

When('the admin uploads evidence to the record', async ({ request, world }) => {
  getCmsState(world).lastEvidence = await uploadEvidenceViaApi(request, getCmsState(world).lastRecord!.id as string)
})

Then('the evidence should have a generated UUID id', async () => {
  expect(getCmsState(world).lastEvidence).toBeTruthy()
  const id = getCmsState(world).lastEvidence!.id as string
  expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
})

Then('the evidence should have classification {string}', async ({ world }, classification: string) => {
  expect(getCmsState(world).lastEvidence!.classification).toBe(classification)
})

Then('the evidence should have an integrity hash', async () => {
  expect(getCmsState(world).lastEvidence!.integrityHash).toBeTruthy()
})

Given('evidence exists on the record', async ({ request, world }) => {
  getCmsState(world).lastEvidence = await uploadEvidenceViaApi(request, getCmsState(world).lastRecord!.id as string)
})

When('the admin gets the custody chain for the evidence', async ({ request, world }) => {
  getCmsState(world).custodyChain = await getEvidenceCustodyViaApi(request, getCmsState(world).lastEvidence!.id as string)
})

Then('the custody chain should have at least {int} entry', async ({ world }, count: number) => {
  expect(getCmsState(world).custodyChain!.custodyChain.length).toBeGreaterThanOrEqual(count)
})

Then('the first custody entry should have action {string}', async ({ world }, action: string) => {
  expect(getCmsState(world).custodyChain!.custodyChain[0].action).toBe(action)
})

When('the admin verifies evidence integrity with the correct hash', async ({ request, world }) => {
  const originalHash = getCmsState(world).lastEvidence!.integrityHash as string
  getCmsState(world).verifyResult = await verifyEvidenceIntegrityViaApi(
    request,
    getCmsState(world).lastEvidence!.id as string,
    originalHash,
  )
})

Then('the verification should return valid true', async () => {
  expect(getCmsState(world).verifyResult!.valid).toBe(true)
})

When('the admin verifies evidence integrity with a wrong hash', async ({ request, world }) => {
  getCmsState(world).verifyResult = await verifyEvidenceIntegrityViaApi(
    request,
    getCmsState(world).lastEvidence!.id as string,
    'f'.repeat(64),
  )
})

Then('the verification should return valid false', async () => {
  expect(getCmsState(world).verifyResult!.valid).toBe(false)
})
