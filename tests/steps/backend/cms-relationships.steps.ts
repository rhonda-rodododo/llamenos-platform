/**
 * CMS relationship & affinity group step definitions for Epic 322.
 *
 * Covers contact-to-contact relationships and affinity groups with
 * member roles. Reuses "case management is enabled" from
 * entity-schema.steps.ts and "the server is reset" from common.steps.ts.
 */
import { expect } from '@playwright/test'
import { Given, When, Then, Before, getState, setState } from './fixtures'
import {
  createContactViaApi,
  createRelationshipViaApi,
  listRelationshipsViaApi,
  deleteRelationshipViaApi,
  createAffinityGroupViaApi,
  addGroupMemberViaApi,
  removeGroupMemberViaApi,
  listGroupMembersViaApi,
  getAffinityGroupViaApi,
  type RelationshipResult,
  type GroupResult,
  type GroupMemberResult,
} from '../../api-helpers'

// ── Local State ────────────────────────────────────────────────────

interface RelState {
  /** Named contacts: step alias → contact record */
  contacts: Map<string, Record<string, unknown>>
  /** Last relationship created */
  lastRelationship?: RelationshipResult
  /** Last relationship list result */
  relationshipList?: RelationshipResult[]
  /** Last affinity group created */
  lastGroup?: GroupResult
  /** Last group member list */
  groupMembers?: GroupMemberResult[]
}

const CMS_RELATIONSHIPS_KEY = 'cms_relationships'

function getRelState(world: Record<string, unknown>): RelState {
  return getState<RelState>(world, CMS_RELATIONSHIPS_KEY)
}


Before({ tags: '@contacts' }, async ({ world }) => {
  const rel = {
    contacts: new Map(),
  }
  setState(world, CMS_RELATIONSHIPS_KEY, rel)
})

// ── Helpers ────────────────────────────────────────────────────────

async function ensureNamedContact(
  request: import('@playwright/test').APIRequestContext,
  alias: string,
): Promise<Record<string, unknown>> {
  const existing = getRelState(world).contacts.get(alias)
  if (existing) return existing
  const contact = await createContactViaApi(request, {
    identifierHashes: [`idhash_${alias}_${Date.now()}`],
  })
  getRelState(world).contacts.set(alias, contact)
  return contact
}

// ============================================================
// RELATIONSHIP STEPS
// ============================================================

Given('a contact {string} exists', async ({request, world}, alias: string) => {
  await ensureNamedContact(request, alias)
})

When(
  'the admin creates a {string} relationship from {string} to {string}',
  async ({ request, world }, relType: string, aliasA: string, aliasB: string) => {
    const a = getRelState(world).contacts.get(aliasA)
    const b = getRelState(world).contacts.get(aliasB)
    expect(a, `Contact "${aliasA}" not found`).toBeTruthy()
    expect(b, `Contact "${aliasB}" not found`).toBeTruthy()
    getRelState(world).lastRelationship = await createRelationshipViaApi(
      request,
      a!.id as string,
      b!.id as string,
      relType,
    )
  },
)

Then('the relationship should exist', async () => {
  expect(getRelState(world).lastRelationship).toBeTruthy()
  expect(getRelState(world).lastRelationship!.id).toBeTruthy()
})

Then(
  '{string} relationships should include {string}',
  async ({ request, world }, aliasA: string, aliasB: string) => {
    const a = getRelState(world).contacts.get(aliasA)
    const b = getRelState(world).contacts.get(aliasB)
    expect(a).toBeTruthy()
    expect(b).toBeTruthy()
    const result = await listRelationshipsViaApi(request, a!.id as string)
    const bId = b!.id as string
    const found = result.relationships.some(
      r => r.contactIdA === bId || r.contactIdB === bId,
    )
    expect(found, `Expected ${aliasB} in ${aliasA}'s relationships`).toBe(true)
  },
)

Given(
  'contacts {string} and {string} with a bidirectional {string} relationship',
  async ({ request, world }, aliasA: string, aliasB: string, relType: string) => {
    const a = await ensureNamedContact(request, aliasA)
    const b = await ensureNamedContact(request, aliasB)
    getRelState(world).lastRelationship = await createRelationshipViaApi(
      request,
      a.id as string,
      b.id as string,
      relType,
      'bidirectional',
    )
  },
)

When('listing relationships for {string}', async ({ request, world }, alias: string) => {
  const contact = getRelState(world).contacts.get(alias)
  expect(contact, `Contact "${alias}" not found`).toBeTruthy()
  const result = await listRelationshipsViaApi(request, contact!.id as string)
  getRelState(world).relationshipList = result.relationships
})

Then('{string} should appear in the results', async ({ world }, alias: string) => {
  const contact = getRelState(world).contacts.get(alias)
  expect(contact, `Contact "${alias}" not found`).toBeTruthy()
  const contactId = contact!.id as string
  expect(getRelState(world).relationshipList).toBeTruthy()
  const found = getRelState(world).relationshipList!.some(
    r => r.contactIdA === contactId || r.contactIdB === contactId,
  )
  expect(found, `Expected ${alias} in relationship results`).toBe(true)
})

Given(
  'contacts {string} and {string} with a relationship',
  async ({ request, world }, aliasA: string, aliasB: string) => {
    const a = await ensureNamedContact(request, aliasA)
    const b = await ensureNamedContact(request, aliasB)
    getRelState(world).lastRelationship = await createRelationshipViaApi(
      request,
      a.id as string,
      b.id as string,
      'support_contact',
    )
  },
)

When('the admin deletes the relationship', async ({ request, world }) => {
  expect(getRelState(world).lastRelationship).toBeTruthy()
  await deleteRelationshipViaApi(
    request,
    getRelState(world).lastRelationship!.contactIdA,
    getRelState(world).lastRelationship!.id,
  )
})

Then(
  'listing relationships for {string} should be empty',
  async ({ request, world }, alias: string) => {
    const contact = getRelState(world).contacts.get(alias)
    expect(contact, `Contact "${alias}" not found`).toBeTruthy()
    const result = await listRelationshipsViaApi(request, contact!.id as string)
    expect(result.relationships.length).toBe(0)
  },
)

// ============================================================
// AFFINITY GROUP STEPS
// ============================================================

When(
  'the admin creates an affinity group {string}',
  async ({ request, world }, name: string) => {
    // Groups require at least one member; create a placeholder contact
    const placeholder = await ensureNamedContact(request, `_group_seed_${Date.now()}`)
    getRelState(world).lastGroup = await createAffinityGroupViaApi(request, name, [
      { contactId: placeholder.id as string },
    ])
  },
)

Then(
  'the group should exist with name {string}',
  async ({ request, world }, _name: string) => {
    expect(getRelState(world).lastGroup).toBeTruthy()
    expect(getRelState(world).lastGroup!.id).toBeTruthy()
    // Verify via GET that the group persists
    const group = await getAffinityGroupViaApi(request, getRelState(world).lastGroup!.id)
    expect(group.id).toBe(getRelState(world).lastGroup!.id)
    // The encrypted details contain the name (base64-encoded JSON)
    const details = JSON.parse(atob(group.encryptedDetails))
    expect(details.name).toBe(_name)
  },
)

Given('an affinity group exists', async ({ request, world }) => {
  const seed = await ensureNamedContact(request, `_group_seed_${Date.now()}`)
  getRelState(world).lastGroup = await createAffinityGroupViaApi(request, `Test Group ${Date.now()}`, [
    { contactId: seed.id as string },
  ])
  // Remove the seed member so the group starts with known state
  await removeGroupMemberViaApi(request, getRelState(world).lastGroup.id, seed.id as string)
})

When(
  'the admin adds {string} to the group with role {string}',
  async ({ request, world }, alias: string, role: string) => {
    expect(getRelState(world).lastGroup).toBeTruthy()
    const contact = getRelState(world).contacts.get(alias)
    expect(contact, `Contact "${alias}" not found`).toBeTruthy()
    await addGroupMemberViaApi(request, getRelState(world).lastGroup!.id, contact!.id as string, role)
  },
)

Then('the group should have {int} member', async ({ request, world }, count: number) => {
  expect(getRelState(world).lastGroup).toBeTruthy()
  const result = await listGroupMembersViaApi(request, getRelState(world).lastGroup!.id)
  getRelState(world).groupMembers = result.members
  expect(result.members.length).toBe(count)
})

Then(
  '{string} should be in the group with role {string}',
  async ({ world }, alias: string, role: string) => {
    const contact = getRelState(world).contacts.get(alias)
    expect(contact, `Contact "${alias}" not found`).toBeTruthy()
    expect(getRelState(world).groupMembers).toBeTruthy()
    const member = getRelState(world).groupMembers!.find(m => m.contactId === contact!.id)
    expect(member, `Expected ${alias} in group members`).toBeTruthy()
    expect(member!.role).toBe(role)
  },
)

Given(
  'an affinity group with member {string} exists',
  async ({ request, world }, alias: string) => {
    const contact = await ensureNamedContact(request, alias)
    getRelState(world).lastGroup = await createAffinityGroupViaApi(
      request,
      `Group with ${alias} ${Date.now()}`,
      [{ contactId: contact.id as string }],
    )
  },
)

When('the admin removes {string} from the group', async ({ request, world }, alias: string) => {
  expect(getRelState(world).lastGroup).toBeTruthy()
  const contact = getRelState(world).contacts.get(alias)
  expect(contact, `Contact "${alias}" not found`).toBeTruthy()
  await removeGroupMemberViaApi(request, getRelState(world).lastGroup!.id, contact!.id as string)
})

Then('the group member count should be {int}', async ({ request, world }, count: number) => {
  expect(getRelState(world).lastGroup).toBeTruthy()
  const result = await listGroupMembersViaApi(request, getRelState(world).lastGroup!.id)
  expect(result.members.length).toBe(count)
})
