/**
 * CMS step definitions for Epics 317–325.
 *
 * Covers templates, contacts, records, events, interactions,
 * and evidence. Reuses the existing "case management is enabled"
 * and "the server is reset" steps from entity-schema.steps.ts
 * and common.steps.ts respectively.
 */
import { expect } from '@playwright/test'
import { Given, When, Then, Before } from './fixtures'
import { shared } from './shared-state'
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

let cms: CmsState

Before({ tags: '@cases or @contacts or @events or @evidence or @templates or @reports' }, async () => {
  cms = {
    templateCatalog: [],
    contacts: [],
    entityTypeIds: new Map(),
    records: [],
    eventEntityTypeIds: new Map(),
  }
})

// ── Helper: resolve or create entity type by name ──────────────────

async function resolveEntityTypeId(
  request: import('@playwright/test').APIRequestContext,
  name: string,
): Promise<string> {
  const cached = cms.entityTypeIds.get(name)
  if (cached) return cached

  const types = await listEntityTypesViaApi(request)
  const existing = types.find(t => t.name === name)
  if (existing) {
    const id = existing.id as string
    cms.entityTypeIds.set(name, id)
    return id
  }

  const created = await createEntityTypeViaApi(request, { name, category: 'case' })
  const id = created.id as string
  cms.entityTypeIds.set(name, id)
  return id
}

async function resolveEventEntityTypeId(
  request: import('@playwright/test').APIRequestContext,
  name: string,
): Promise<string> {
  const cached = cms.eventEntityTypeIds.get(name)
  if (cached) return cached

  const types = await listEntityTypesViaApi(request)
  const existing = types.find(t => t.name === name)
  if (existing) {
    const id = existing.id as string
    cms.eventEntityTypeIds.set(name, id)
    return id
  }

  const created = await createEntityTypeViaApi(request, { name, category: 'event' })
  const id = created.id as string
  cms.eventEntityTypeIds.set(name, id)
  return id
}

// ============================================================
// TEMPLATE STEPS (Epic 317)
// ============================================================

When('the admin lists available templates', async ({ request }) => {
  cms.templateCatalog = await listTemplatesViaApi(request)
})

Then('the template catalog should have at least {int} templates', async ({}, count: number) => {
  expect(cms.templateCatalog.length).toBeGreaterThanOrEqual(count)
})

Then('each template should have an id, name, and description', async () => {
  for (const t of cms.templateCatalog) {
    expect(t.id).toBeTruthy()
    expect(t.name).toBeTruthy()
    expect(t.description).toBeTruthy()
  }
})

When('the admin gets details for template {string}', async ({ request }, templateId: string) => {
  cms.templateDetails = await getTemplateViaApi(request, templateId)
})

Then('the template should have entity types', async () => {
  expect(cms.templateDetails).toBeTruthy()
  const entityTypes = cms.templateDetails!.entityTypes as unknown[]
  expect(entityTypes.length).toBeGreaterThan(0)
})

Then('the template should have relationship types', async () => {
  expect(cms.templateDetails).toBeTruthy()
  const relTypes = cms.templateDetails!.relationshipTypes as unknown[]
  expect(relTypes.length).toBeGreaterThan(0)
})

When('the admin applies template {string}', async ({ request }, templateId: string) => {
  const result = await applyTemplateViaApi(request, templateId)
  if (result.status !== 201 && result.status !== 200) {
    shared.lastResponse = { status: result.status, data: result.data }
    return
  }
  cms.applyResult = result.data
})

Then('the template should be applied successfully', async () => {
  expect(cms.applyResult).toBeTruthy()
  expect(cms.applyResult!.applied).toBe(true)
})

Then('entity types from the template should exist', async ({ request }) => {
  const types = await listEntityTypesViaApi(request)
  expect(types.length).toBeGreaterThan(0)
})

Then('relationship types from the template should exist', async ({ request }) => {
  const { data } = await apiGet<{ relationshipTypes: unknown[] }>(request, '/settings/cms/relationship-types')
  expect(data.relationshipTypes.length).toBeGreaterThan(0)
})

Then('entity types from both templates should exist', async ({ request }) => {
  const types = await listEntityTypesViaApi(request)
  // jail-support creates arrest_case; street-medic creates medical_encounter
  const hasArrest = types.some(t => t.name === 'arrest_case')
  const hasPatient = types.some(t => t.name === 'medical_encounter')
  expect(hasArrest).toBe(true)
  expect(hasPatient).toBe(true)
})

When('a volunteer tries to apply template {string}', async ({ request }, templateId: string) => {
  const vol = await createVolunteerViaApi(request, { name: `vol-tmpl-${Date.now()}` })
  const result = await applyTemplateViaApi(request, templateId, vol.nsec)
  shared.lastResponse = { status: result.status, data: result.data }
})

// ============================================================
// CONTACT STEPS (Epic 318)
// ============================================================

When('the admin creates a contact with encrypted profile', async ({ request }) => {
  cms.lastContact = await createContactViaApi(request)
})

Then('the contact should have a generated UUID id', async () => {
  expect(cms.lastContact).toBeTruthy()
  const id = cms.lastContact!.id as string
  expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
})

Then('the contact should have an encrypted summary', async () => {
  expect(cms.lastContact!.encryptedSummary).toBeTruthy()
})

Given('{int} contacts exist', async ({ request }, count: number) => {
  for (let i = 0; i < count; i++) {
    const c = await createContactViaApi(request)
    cms.contacts.push(c)
  }
})

When('the admin lists contacts with limit {int}', async ({ request }, limit: number) => {
  cms.contactListResult = await listContactsViaApi(request, { page: 1, limit })
})

Then('the contact list should have {int} contacts', async ({}, count: number) => {
  expect(cms.contactListResult).toBeTruthy()
  expect(cms.contactListResult!.contacts.length).toBe(count)
})

Then('the contact list should indicate more pages', async () => {
  expect(cms.contactListResult!.hasMore).toBe(true)
})

Given('a contact exists with identifier hash {string}', async ({ request }, hash: string) => {
  cms.lastContact = await createContactViaApi(request, { identifierHashes: [hash] })
})

When('the admin looks up contact by identifier hash {string}', async ({ request }, hash: string) => {
  const result = await lookupContactViaApi(request, hash)
  cms.lookedUpContact = result.contact
})

Then('the looked-up contact should match the created contact', async () => {
  expect(cms.lookedUpContact).toBeTruthy()
  expect(cms.lookedUpContact!.id).toBe(cms.lastContact!.id)
})

Given('a contact exists', async ({ request }) => {
  cms.lastContact = await createContactViaApi(request)
})

When('the admin updates the contact encrypted summary', async ({ request }) => {
  const updated = await updateContactViaApi(
    request,
    cms.lastContact!.id as string,
    { encryptedSummary: 'dXBkYXRlZCBjb250YWN0' },
  )
  cms.lastContact = updated
})

Then('the contact should have the updated summary', async () => {
  expect(cms.lastContact!.encryptedSummary).toBe('dXBkYXRlZCBjb250YWN0')
})

When('the admin deletes the contact', async ({ request }) => {
  await deleteContactViaApi(request, cms.lastContact!.id as string)
})

Then('the contact should no longer exist', async ({ request }) => {
  const { status } = await apiGet(request, `/directory/${cms.lastContact!.id}`)
  expect(status).toBe(404)
})

Given('a volunteer exists with only contacts:view permission', async ({ request }) => {
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
  cms.volunteerNsec = vol.nsec
  cms.volunteerPubkey = vol.pubkey
})

When('the volunteer lists contacts', async ({ request }) => {
  try {
    cms.contactListResult = await listContactsViaApi(request, {}, cms.volunteerNsec!)
  } catch {
    // If it fails with an error, capture the status
    shared.lastResponse = { status: 403, data: null }
  }
})

Then('the contact list request should succeed', async () => {
  expect(cms.contactListResult).toBeTruthy()
})

When('the volunteer tries to create a contact', async ({ request }) => {
  try {
    await createContactViaApi(request, {}, cms.volunteerNsec!)
    shared.lastResponse = { status: 201, data: null }
  } catch (e: unknown) {
    const msg = (e as Error).message
    const match = msg.match(/(\d{3})/)
    shared.lastResponse = { status: match ? parseInt(match[1]) : 500, data: null }
  }
})

// ============================================================
// RECORD STEPS (Epic 319)
// ============================================================

// NOTE: "an entity type {string} exists" is defined in entity-schema.steps.ts.
// CMS steps use resolveEntityTypeId() internally to get the ID when needed.

When('the admin creates a record of type {string} with status hash {string}', async ({ request }, typeName: string, statusHash: string) => {
  const entityTypeId = await resolveEntityTypeId(request, typeName)
  cms.lastRecord = await createRecordViaApi(request, entityTypeId, { statusHash })
  cms.records.push(cms.lastRecord)
})

Then('the record should have a generated UUID id', async () => {
  expect(cms.lastRecord).toBeTruthy()
  const id = cms.lastRecord!.id as string
  expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
})

Then('the record should have entity type {string}', async ({ request }, typeName: string) => {
  const entityTypeId = await resolveEntityTypeId(request, typeName)
  expect(cms.lastRecord!.entityTypeId).toBe(entityTypeId)
})

Then('the record should have status hash {string}', async ({}, statusHash: string) => {
  expect(cms.lastRecord!.statusHash).toBe(statusHash)
})

Given('a record of type {string} exists', async ({ request }, typeName: string) => {
  const entityTypeId = await resolveEntityTypeId(request, typeName)
  cms.lastRecord = await createRecordViaApi(request, entityTypeId)
  cms.records.push(cms.lastRecord)
})

Given('a record of type {string} exists with status hash {string}', async ({ request }, typeName: string, statusHash: string) => {
  const entityTypeId = await resolveEntityTypeId(request, typeName)
  cms.lastRecord = await createRecordViaApi(request, entityTypeId, { statusHash })
  cms.records.push(cms.lastRecord)
})

When('the admin lists records filtered by entity type {string}', async ({ request }, typeName: string) => {
  const entityTypeId = await resolveEntityTypeId(request, typeName)
  cms.recordListResult = await listRecordsViaApi(request, { entityTypeId })
})

Then('all returned records should have entity type {string}', async ({ request }, typeName: string) => {
  const entityTypeId = await resolveEntityTypeId(request, typeName)
  expect(cms.recordListResult).toBeTruthy()
  for (const r of cms.recordListResult!.records) {
    expect(r.entityTypeId).toBe(entityTypeId)
  }
})

When('the admin links the contact to the record with role {string}', async ({ request }, role: string) => {
  await linkContactToRecordViaApi(
    request,
    cms.lastRecord!.id as string,
    cms.lastContact!.id as string,
    role,
  )
})

Then('the record should have {int} linked contact', async ({ request }, count: number) => {
  const result = await listRecordContactsViaApi(request, cms.lastRecord!.id as string)
  expect(result.contacts.length).toBe(count)
})

Then('the linked contact should have role {string}', async ({ request }, role: string) => {
  const result = await listRecordContactsViaApi(request, cms.lastRecord!.id as string)
  expect(result.contacts.some(c => c.role === role)).toBe(true)
})

Given('a volunteer exists for assignment', async ({ request }) => {
  const vol = await createVolunteerViaApi(request, { name: `vol-assign-${Date.now()}` })
  cms.volunteerNsec = vol.nsec
  cms.volunteerPubkey = vol.pubkey
})

When('the admin assigns the volunteer to the record', async ({ request }) => {
  await assignRecordViaApi(request, cms.lastRecord!.id as string, [cms.volunteerPubkey!])
})

Then('the record should include the volunteer in assignedTo', async ({ request }) => {
  const record = await getRecordViaApi(request, cms.lastRecord!.id as string)
  const assignedTo = record.assignedTo as string[]
  expect(assignedTo).toContain(cms.volunteerPubkey!)
})

Given('an entity type with number prefix {string} exists', async ({ request }, prefix: string) => {
  const name = `numbered_type_${Date.now()}`
  const created = await createEntityTypeViaApi(request, {
    name,
    category: 'case',
    numberPrefix: prefix,
  })
  cms.numberedEntityTypeId = created.id as string
  cms.entityTypeIds.set(name, created.id as string)
})

When('the admin creates a record of the numbered type', async ({ request }) => {
  cms.lastRecord = await createRecordViaApi(request, cms.numberedEntityTypeId!)
  cms.records.push(cms.lastRecord)
})

Then('the record should have a case number matching {string}', async ({}, pattern: string) => {
  const year = new Date().getFullYear()
  const expected = pattern.replace('{year}', String(year))
  expect(cms.lastRecord!.caseNumber).toBe(expected)
})

When('the admin creates another record of the numbered type', async ({ request }) => {
  cms.lastRecord = await createRecordViaApi(request, cms.numberedEntityTypeId!)
  cms.records.push(cms.lastRecord)
})

Then('the second record should have a case number matching {string}', async ({}, pattern: string) => {
  const year = new Date().getFullYear()
  const expected = pattern.replace('{year}', String(year))
  expect(cms.lastRecord!.caseNumber).toBe(expected)
})

When('the admin updates the record status hash to {string}', async ({ request }, statusHash: string) => {
  const updated = await updateRecordViaApi(
    request,
    cms.lastRecord!.id as string,
    { statusHash },
  )
  cms.lastRecord = updated
})

Given('a volunteer exists with cases:read-own and cases:create permissions', async ({ request }) => {
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
  cms.volunteerNsec = vol.nsec
  cms.volunteerPubkey = vol.pubkey
})

When('the volunteer lists records', async ({ request }) => {
  cms.recordListResult = await listRecordsViaApi(request, {}, cms.volunteerNsec!)
})

Then('the volunteer should see {int} records', async ({}, count: number) => {
  expect(cms.recordListResult).toBeTruthy()
  expect(cms.recordListResult!.records.length).toBe(count)
})

// ============================================================
// EVENT STEPS (Epic 320)
// ============================================================

Given('an event entity type {string} exists', async ({ request }, name: string) => {
  await resolveEventEntityTypeId(request, name)
})

When('the admin creates an event of type {string}', async ({ request }, typeName: string) => {
  const entityTypeId = await resolveEventEntityTypeId(request, typeName)
  cms.lastEvent = await createEventViaApi(request, entityTypeId)
})

Then('the event should have a generated UUID id', async () => {
  expect(cms.lastEvent).toBeTruthy()
  const id = cms.lastEvent!.id as string
  expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
})

Then('the event should have a start date', async () => {
  expect(cms.lastEvent!.startDate).toBeTruthy()
})

Given('an event of type {string} exists', async ({ request }, typeName: string) => {
  const entityTypeId = await resolveEventEntityTypeId(request, typeName)
  cms.lastEvent = await createEventViaApi(request, entityTypeId)
})

When('the admin links the record to the event', async ({ request }) => {
  await linkRecordToEventViaApi(
    request,
    cms.lastEvent!.id as string,
    cms.lastRecord!.id as string,
  )
})

Then('the event should have {int} linked record', async ({ request }, count: number) => {
  const result = await listEventRecordsViaApi(request, cms.lastEvent!.id as string)
  expect(result.links.length).toBe(count)
})

Given('a report exists', async ({ request }) => {
  const report = await createReportViaApi(request)
  cms.lastReportId = report.id
})

When('the admin links the report to the event', async ({ request }) => {
  await linkReportToEventViaApi(
    request,
    cms.lastEvent!.id as string,
    cms.lastReportId!,
  )
})

Then('the event should have {int} linked report', async ({ request }, count: number) => {
  const result = await listEventReportsViaApi(request, cms.lastEvent!.id as string)
  expect(result.links.length).toBe(count)
})

Given('{int} records of type {string} are linked to the event', async ({ request }, count: number, typeName: string) => {
  const entityTypeId = await resolveEntityTypeId(request, typeName)
  for (let i = 0; i < count; i++) {
    const record = await createRecordViaApi(request, entityTypeId)
    await linkRecordToEventViaApi(request, cms.lastEvent!.id as string, record.id as string)
    cms.records.push(record)
  }
})

When('the admin lists records linked to the event', async ({ request }) => {
  cms.eventRecordLinks = await listEventRecordsViaApi(request, cms.lastEvent!.id as string)
})

Then('{int} record links should be returned', async ({}, count: number) => {
  expect(cms.eventRecordLinks!.links.length).toBe(count)
})

// ============================================================
// INTERACTION STEPS (Epic 323)
// ============================================================

When('the admin creates a comment interaction on the record', async ({ request }) => {
  cms.lastInteraction = await createInteractionViaApi(
    request,
    cms.lastRecord!.id as string,
    {
      interactionType: 'comment',
      encryptedContent: 'dGVzdCBjb21tZW50',
      interactionTypeHash: 'comment_hash',
    },
  )
})

Then('the interaction should have type {string}', async ({}, interactionType: string) => {
  expect(cms.lastInteraction!.interactionType).toBe(interactionType)
})

Then('the interaction should have encrypted content', async () => {
  expect(cms.lastInteraction!.encryptedContent).toBeTruthy()
})

When('the admin updates the record status with change metadata', async ({ request }) => {
  await updateRecordViaApi(
    request,
    cms.lastRecord!.id as string,
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

Then('the record interactions should include a {string} entry', async ({ request }, interactionType: string) => {
  const result = await listInteractionsViaApi(request, cms.lastRecord!.id as string)
  const hasType = result.interactions.some(i => i.interactionType === interactionType)
  expect(hasType).toBe(true)
})

Given('{int} comment interactions exist on the record', async ({ request }, count: number) => {
  for (let i = 0; i < count; i++) {
    await createInteractionViaApi(
      request,
      cms.lastRecord!.id as string,
      {
        interactionType: 'comment',
        encryptedContent: `dGVzdCBjb21tZW50 ${i}`,
        interactionTypeHash: 'comment_hash',
      },
    )
  }
})

When('the admin lists interactions for the record', async ({ request }) => {
  cms.interactionListResult = await listInteractionsViaApi(request, cms.lastRecord!.id as string)
})

Then('{int} interactions should be returned', async ({}, count: number) => {
  expect(cms.interactionListResult!.interactions.length).toBe(count)
})

Then('the interactions should be in chronological order', async () => {
  const interactions = cms.interactionListResult!.interactions
  for (let i = 1; i < interactions.length; i++) {
    const prev = new Date(interactions[i - 1].createdAt as string).getTime()
    const curr = new Date(interactions[i].createdAt as string).getTime()
    expect(curr).toBeGreaterThanOrEqual(prev)
  }
})

// ============================================================
// EVIDENCE STEPS (Epic 325)
// ============================================================

When('the admin uploads evidence to the record', async ({ request }) => {
  cms.lastEvidence = await uploadEvidenceViaApi(request, cms.lastRecord!.id as string)
})

Then('the evidence should have a generated UUID id', async () => {
  expect(cms.lastEvidence).toBeTruthy()
  const id = cms.lastEvidence!.id as string
  expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
})

Then('the evidence should have classification {string}', async ({}, classification: string) => {
  expect(cms.lastEvidence!.classification).toBe(classification)
})

Then('the evidence should have an integrity hash', async () => {
  expect(cms.lastEvidence!.integrityHash).toBeTruthy()
})

Given('evidence exists on the record', async ({ request }) => {
  cms.lastEvidence = await uploadEvidenceViaApi(request, cms.lastRecord!.id as string)
})

When('the admin gets the custody chain for the evidence', async ({ request }) => {
  cms.custodyChain = await getEvidenceCustodyViaApi(request, cms.lastEvidence!.id as string)
})

Then('the custody chain should have at least {int} entry', async ({}, count: number) => {
  expect(cms.custodyChain!.custodyChain.length).toBeGreaterThanOrEqual(count)
})

Then('the first custody entry should have action {string}', async ({}, action: string) => {
  expect(cms.custodyChain!.custodyChain[0].action).toBe(action)
})

When('the admin verifies evidence integrity with the correct hash', async ({ request }) => {
  const originalHash = cms.lastEvidence!.integrityHash as string
  cms.verifyResult = await verifyEvidenceIntegrityViaApi(
    request,
    cms.lastEvidence!.id as string,
    originalHash,
  )
})

Then('the verification should return valid true', async () => {
  expect(cms.verifyResult!.valid).toBe(true)
})

When('the admin verifies evidence integrity with a wrong hash', async ({ request }) => {
  cms.verifyResult = await verifyEvidenceIntegrityViaApi(
    request,
    cms.lastEvidence!.id as string,
    'f'.repeat(64),
  )
})

Then('the verification should return valid false', async () => {
  expect(cms.verifyResult!.valid).toBe(false)
})
