/**
 * Entity Schema Management step definitions (Epic 315).
 *
 * Tests entity type CRUD, relationship type CRUD, case numbering,
 * permission enforcement, and case management feature toggle.
 */
import { expect } from '@playwright/test'
import { Given, When, Then, Before, getState, setState } from './fixtures'
import { getSharedState, setLastResponse } from './shared-state'
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
  apiPost,
  ADMIN_NSEC,
} from '../../api-helpers'

// ── State ───────────────────────────────────────────────────────────

interface EntitySchemaState {
  lastEntityType?: Record<string, unknown>
  lastRelationshipType?: Record<string, unknown>
  caseNumbers: string[]
}

const ENTITY_SCHEMA_KEY = 'entity_schema'

function getEntitySchemaState(world: Record<string, unknown>): EntitySchemaState {
  return getState<EntitySchemaState>(world, ENTITY_SCHEMA_KEY)
}


Before({ tags: '@cases or @contacts or @events or @evidence or @templates or @reports or @triage' }, async ({ world }) => {
  const state = { caseNumbers: [] }
  setState(world, ENTITY_SCHEMA_KEY, state)
})

// ── Given ───────────────────────────────────────────────────────────

Given('case management is enabled', async ({request, world}) => {
  await enableCaseManagementViaApi(request, true)
})

Given('an entity type {string} exists', async ({ request, world }, name: string) => {
  const types = await listEntityTypesViaApi(request)
  const existing = types.find(t => t.name === name)
  if (existing) {
    getEntitySchemaState(world).lastEntityType = existing
    return
  }
  const created = await createEntityTypeViaApi(request, { name, category: 'case' })
  getEntitySchemaState(world).lastEntityType = created
})

// ── When ────────────────────────────────────────────────────────────

When('the admin enables case management', async ({request, world}) => {
  await enableCaseManagementViaApi(request, true)
})

When('the admin creates an entity type named {string} with category {string}', async ({ request, world }, name: string, category: string) => {
  const result = await createEntityTypeViaApi(request, { name, category })
  getEntitySchemaState(world).lastEntityType = result
})

When('the admin creates an entity type with statuses {string} and fields {string}', async ({ request, world }, statusesStr: string, fieldsStr: string) => {
  const statuses = statusesStr.split(',').map((v, i) => ({
    value: v.trim(),
    label: v.trim().charAt(0).toUpperCase() + v.trim().slice(1),
    order: i,
  }))
  const fields = fieldsStr.split(',').filter(Boolean).map((f, i) => {
    const [fieldName, fieldType] = f.split(':')
    return { name: fieldName, label: fieldName, type: fieldType || 'text', order: i }
  })
  const result = await createEntityTypeViaApi(request, {
    name: `type_${Date.now()}`,
    category: 'case',
    statuses,
    fields,
  })
  getEntitySchemaState(world).lastEntityType = result
})

When('the admin adds a field {string} of type {string} to entity type {string}', async ({ request, world }, fieldName: string, fieldType: string, entityTypeName: string) => {
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
    visibleToUsers: true,
    editableByUsers: true,
    hubEditable: true,
  }

  const result = await updateEntityTypeViaApi(request, entityType!.id as string, {
    fields: [...existingFields, newField],
  })
  getEntitySchemaState(world).lastEntityType = result
})

When('the admin deletes entity type {string}', async ({request, world}, name: string) => {
  const types = await listEntityTypesViaApi(request)
  const entityType = types.find(t => t.name === name)
  expect(entityType).toBeTruthy()
  await deleteEntityTypeViaApi(request, entityType!.id as string)
})

When('the admin tries to create an entity type named {string}', async ({request, world}, name: string) => {
  try {
    await createEntityTypeViaApi(request, { name, category: 'case' })
    setLastResponse(world, { status: 201, data: null })
  } catch (e: unknown) {
    const msg = (e as Error).message
    const match = msg.match(/(\d{3})/)
    setLastResponse(world, { status: match ? parseInt(match[1]) : 500, data: null })
  }
})

When('the admin creates a relationship type from {string} to {string} with cardinality {string}', async ({ request, world }, source: string, target: string, cardinality: string) => {
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
  getEntitySchemaState(world).lastRelationshipType = result
})

When('a volunteer tries to create an entity type', async ({request, world}) => {
  const vol = await createVolunteerViaApi(request, { name: `vol-schema-${Date.now()}` })
  try {
    await createEntityTypeViaApi(request, { name: `forbidden_${Date.now()}` }, vol.nsec)
    setLastResponse(world, { status: 201, data: null })
  } catch (e: unknown) {
    const msg = (e as Error).message
    const match = msg.match(/(\d{3})/)
    setLastResponse(world, { status: match ? parseInt(match[1]) : 500, data: null })
  }
})

When('a case number is generated with prefix {string}', async ({ request, world }, prefix: string) => {
  const result = await generateCaseNumberViaApi(request, prefix)
  getEntitySchemaState(world).caseNumbers.push(result.number)
})

When('another case number is generated with prefix {string}', async ({ request, world }, prefix: string) => {
  const result = await generateCaseNumberViaApi(request, prefix)
  getEntitySchemaState(world).caseNumbers.push(result.number)
})

When('the admin lists all roles', async () => {
  // Roles are verified in the Then steps
})

// ── Then ────────────────────────────────────────────────────────────

Then('case management should be enabled', async ({request, world}) => {
  const result = await getCaseManagementEnabledViaApi(request)
  expect(result.enabled).toBe(true)
})

Then('the entity type {string} should exist', async ({ request, world }, name: string) => {
  const types = await listEntityTypesViaApi(request)
  const found = types.find(t => t.name === name)
  expect(found).toBeTruthy()
  getEntitySchemaState(world).lastEntityType = found
})

Then('it should have a generated UUID id', async () => {
  expect(getEntitySchemaState(world).lastEntityType).toBeTruthy()
  const id = getEntitySchemaState(world).lastEntityType!.id as string
  expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
})

Then('it should have category {string}', async ({ world }, category: string) => {
  expect(getEntitySchemaState(world).lastEntityType!.category).toBe(category)
})

Then('the created entity type should have {int} statuses', async ({ world }, count: number) => {
  const statuses = getEntitySchemaState(world).lastEntityType!.statuses as unknown[]
  expect(statuses.length).toBe(count)
})

Then('the created entity type should have {int} fields', async ({ world }, count: number) => {
  const fields = getEntitySchemaState(world).lastEntityType!.fields as unknown[]
  expect(fields.length).toBe(count)
})

Then('entity type {string} should have the field {string}', async ({request, world}, entityTypeName: string, fieldName: string) => {
  const types = await listEntityTypesViaApi(request)
  const entityType = types.find(t => t.name === entityTypeName)
  expect(entityType).toBeTruthy()
  const fields = entityType!.fields as Array<Record<string, unknown>>
  expect(fields.some(f => f.name === fieldName)).toBe(true)
})

Then('entity type {string} should not exist', async ({request, world}, name: string) => {
  const types = await listEntityTypesViaApi(request)
  expect(types.some(t => t.name === name)).toBe(false)
})

Then('the relationship type should exist', async () => {
  expect(getEntitySchemaState(world).lastRelationshipType).toBeTruthy()
  expect(getEntitySchemaState(world).lastRelationshipType!.id).toBeTruthy()
})

Then('the first case number should match {string}', async ({ world }, pattern: string) => {
  const year = new Date().getFullYear()
  const expected = pattern.replace('{year}', String(year))
  expect(getEntitySchemaState(world).caseNumbers[0]).toBe(expected)
})

Then('the second case number should match {string}', async ({ world }, pattern: string) => {
  const year = new Date().getFullYear()
  const expected = pattern.replace('{year}', String(year))
  expect(getEntitySchemaState(world).caseNumbers[1]).toBe(expected)
})

Then('the hub-admin role should include permission {string}', async ({ request }, permission: string) => {
  const roles = await listRolesViaApi(request)
  const hubAdmin = roles.find((r: Record<string, unknown>) => r.id === 'role-hub-admin' || r.slug === 'hub-admin')
  expect(hubAdmin).toBeTruthy()
  const perms = hubAdmin!.permissions as string[]
  const domain = permission.split(':')[0]
  const hasIt = perms.includes(permission) || perms.includes(`${domain}:*`) || perms.includes('*')
  expect(hasIt).toBe(true)
})

Then('the volunteer role should include permission {string}', async ({ request }, permission: string) => {
  const roles = await listRolesViaApi(request)
  const volunteer = roles.find((r: Record<string, unknown>) => r.id === 'role-volunteer' || r.slug === 'volunteer')
  expect(volunteer).toBeTruthy()
  const perms = volunteer!.permissions as string[]
  const domain = permission.split(':')[0]
  const hasIt = perms.includes(permission) || perms.includes(`${domain}:*`) || perms.includes('*')
  expect(hasIt).toBe(true)
})
