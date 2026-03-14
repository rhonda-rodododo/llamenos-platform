/**
 * Entity Schema Management step definitions (Epic 315).
 *
 * Tests entity type CRUD, relationship type CRUD, case numbering,
 * permission enforcement, and case management feature toggle.
 */
import { expect } from '@playwright/test'
import { Given, When, Then, Before } from './fixtures'
import { shared } from './shared-state'
import {
  enableCaseManagementViaApi,
  getCaseManagementEnabledViaApi,
  createEntityTypeViaApi,
  listEntityTypesViaApi,
  updateEntityTypeViaApi,
  deleteEntityTypeViaApi,
  createRelationshipTypeViaApi,
  generateCaseNumberViaApi,
  createVolunteerViaApi,
  listRolesViaApi,
  ADMIN_NSEC,
} from '../../api-helpers'

// ── State ───────────────────────────────────────────────────────────

interface EntitySchemaState {
  lastEntityType?: Record<string, unknown>
  lastEntityTypeId?: string
  lastRelationshipType?: Record<string, unknown>
  lastCaseNumber?: string
  lastResponseStatus?: number
  volunteerNsec?: string
  caseNumberCount: number
}

let state: EntitySchemaState

Before({ tags: '@cases' }, async () => {
  state = { caseNumberCount: 0 }
})

// ── Given ───────────────────────────────────────────────────────────

Given('case management is enabled', async ({ request }) => {
  await enableCaseManagementViaApi(request, true)
})

Given('an entity type {string} exists', async ({ request }, name: string) => {
  // Check if it already exists
  const types = await listEntityTypesViaApi(request)
  const existing = types.find(t => t.name === name)
  if (existing) {
    state.lastEntityType = existing
    state.lastEntityTypeId = existing.id as string
    return
  }
  const created = await createEntityTypeViaApi(request, { name, category: 'case' })
  state.lastEntityType = created
  state.lastEntityTypeId = created.id as string
})

// ── When ────────────────────────────────────────────────────────────

When('admin {string} enables case management', async ({ request }) => {
  await enableCaseManagementViaApi(request, true)
})

When('admin {string} creates an entity type {string} with category {string}', async ({ request }, _admin: string, name: string, category: string) => {
  const result = await createEntityTypeViaApi(request, { name, category })
  state.lastEntityType = result
  state.lastEntityTypeId = result.id as string
})

When('admin {string} creates an entity type {string} with:', async ({ request }, _admin: string, name: string, table) => {
  const row = table.rowsHash() as Record<string, string>
  const statusValues = (row.statuses ?? 'open,closed').split(',').map((v: string, i: number) => ({
    value: v.trim(),
    label: v.trim().charAt(0).toUpperCase() + v.trim().slice(1),
    order: i,
  }))
  const fields = (row.fields ?? '').split(',').filter(Boolean).map((f: string, i: number) => {
    const [fieldName, fieldType] = f.split(':')
    return { name: fieldName, label: fieldName, type: fieldType || 'text', order: i }
  })
  const result = await createEntityTypeViaApi(request, {
    name,
    category: 'case',
    statuses: statusValues,
    fields,
  })
  state.lastEntityType = result
  state.lastEntityTypeId = result.id as string
})

When('admin {string} adds a field {string} of type {string} to {string}', async ({ request }, _admin: string, fieldName: string, fieldType: string, entityTypeName: string) => {
  const types = await listEntityTypesViaApi(request)
  const entityType = types.find(t => t.name === entityTypeName)
  expect(entityType).toBeTruthy()

  const existingFields = (entityType!.fields as Array<Record<string, unknown>>) ?? []
  const newField = {
    name: fieldName,
    label: fieldName,
    type: fieldType,
    required: false,
    order: existingFields.length,
    indexable: false,
    indexType: 'none',
    accessLevel: 'all',
    visibleToVolunteers: true,
    editableByVolunteers: true,
    hubEditable: true,
  }

  const result = await updateEntityTypeViaApi(request, entityType!.id as string, {
    fields: [...existingFields, newField],
  })
  state.lastEntityType = result
})

When('admin {string} deletes the entity type {string}', async ({ request }, _admin: string, name: string) => {
  const types = await listEntityTypesViaApi(request)
  const entityType = types.find(t => t.name === name)
  expect(entityType).toBeTruthy()
  await deleteEntityTypeViaApi(request, entityType!.id as string)
})

When('admin {string} tries to create an entity type {string} with category {string}', async ({ request }, _admin: string, name: string, category: string) => {
  try {
    await createEntityTypeViaApi(request, { name, category })
    state.lastResponseStatus = 201
  } catch (e: unknown) {
    const msg = (e as Error).message
    const match = msg.match(/(\d{3})/)
    state.lastResponseStatus = match ? parseInt(match[1]) : 500
  }
})

When('admin {string} creates a relationship type linking {string} to {string} as {string}', async ({ request }, _admin: string, source: string, target: string, cardinality: string) => {
  // For "contact", use a special sentinel; for named types, look up the ID
  const types = await listEntityTypesViaApi(request)
  const sourceId = source === 'contact' ? 'contact' : (types.find(t => t.name === source)?.id as string)
  const targetId = target === 'contact' ? 'contact' : (types.find(t => t.name === target)?.id as string)
  expect(sourceId).toBeTruthy()
  expect(targetId).toBeTruthy()

  const result = await createRelationshipTypeViaApi(request, {
    sourceEntityTypeId: sourceId,
    targetEntityTypeId: targetId,
    cardinality,
  })
  state.lastRelationshipType = result
})

When('volunteer {string} tries to create an entity type', async ({ request }) => {
  const vol = await createVolunteerViaApi(request, { name: `vol-schema-${Date.now()}` })
  try {
    await createEntityTypeViaApi(request, { name: `forbidden_${Date.now()}` }, vol.nsec)
    state.lastResponseStatus = 201
  } catch (e: unknown) {
    const msg = (e as Error).message
    const match = msg.match(/(\d{3})/)
    state.lastResponseStatus = match ? parseInt(match[1]) : 500
  }
})

When('a case number is generated with prefix {string}', async ({ request }, prefix: string) => {
  const result = await generateCaseNumberViaApi(request, prefix)
  state.lastCaseNumber = result.number
  state.caseNumberCount++
})

When('another case number is generated with prefix {string}', async ({ request }, prefix: string) => {
  const result = await generateCaseNumberViaApi(request, prefix)
  state.lastCaseNumber = result.number
  state.caseNumberCount++
})

When('admin {string} lists roles', async ({ request }) => {
  // Roles are fetched in the Then step
})

// ── Then ────────────────────────────────────────────────────────────

Then('the hub should have case management enabled', async ({ request }) => {
  const result = await getCaseManagementEnabledViaApi(request)
  expect(result.enabled).toBe(true)
})

Then('the entity type {string} should exist', async ({ request }, name: string) => {
  const types = await listEntityTypesViaApi(request)
  const found = types.find(t => t.name === name)
  expect(found).toBeTruthy()
  state.lastEntityType = found
})

Then('the entity type should have a generated UUID id', async () => {
  expect(state.lastEntityType).toBeTruthy()
  const id = state.lastEntityType!.id as string
  expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
})

Then('the entity type should have category {string}', async () => {
  expect(state.lastEntityType!.category).toBe('case')
})

Then('the entity type should have {int} statuses', async ({}, count: number) => {
  const statuses = state.lastEntityType!.statuses as unknown[]
  expect(statuses.length).toBe(count)
})

Then('the entity type should have {int} fields', async ({}, count: number) => {
  const fields = state.lastEntityType!.fields as unknown[]
  expect(fields.length).toBe(count)
})

Then('the entity type {string} should have the field {string}', async ({ request }, entityTypeName: string, fieldName: string) => {
  const types = await listEntityTypesViaApi(request)
  const entityType = types.find(t => t.name === entityTypeName)
  expect(entityType).toBeTruthy()
  const fields = entityType!.fields as Array<Record<string, unknown>>
  expect(fields.some(f => f.name === fieldName)).toBe(true)
})

Then('the entity type {string} should not exist', async ({ request }, name: string) => {
  const types = await listEntityTypesViaApi(request)
  expect(types.some(t => t.name === name)).toBe(false)
})

Then('the relationship type should exist', async () => {
  expect(state.lastRelationshipType).toBeTruthy()
  expect(state.lastRelationshipType!.id).toBeTruthy()
})

Then('the response status should be {int}', async ({}, expectedStatus: number) => {
  expect(state.lastResponseStatus).toBe(expectedStatus)
})

Then('the case number should match pattern {string}', async ({}, pattern: string) => {
  const year = new Date().getFullYear()
  const expected = pattern
    .replace('{year}', String(year))
    .replace('0001', String(state.caseNumberCount).padStart(4, '0'))
  expect(state.lastCaseNumber).toBe(expected)
})

Then('the hub-admin role should include {string}', async ({ request }, permission: string) => {
  const roles = await listRolesViaApi(request)
  const hubAdmin = roles.find(r => r.id === 'role-hub-admin' || r.slug === 'hub-admin')
  expect(hubAdmin).toBeTruthy()
  const perms = hubAdmin!.permissions as string[]
  // Check for exact match or wildcard match
  const domain = permission.split(':')[0]
  const hasPermission = perms.includes(permission) || perms.includes(`${domain}:*`) || perms.includes('*')
  expect(hasPermission).toBe(true)
})

Then('the volunteer role should include {string}', async ({ request }, permission: string) => {
  const roles = await listRolesViaApi(request)
  const volunteer = roles.find(r => r.id === 'role-volunteer' || r.slug === 'volunteer')
  expect(volunteer).toBeTruthy()
  const perms = volunteer!.permissions as string[]
  const domain = permission.split(':')[0]
  const hasPermission = perms.includes(permission) || perms.includes(`${domain}:*`) || perms.includes('*')
  expect(hasPermission).toBe(true)
})
