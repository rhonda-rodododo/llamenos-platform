/**
 * Screen Pop step definitions for Epic 326.
 *
 * Covers caller identification via identifier hash,
 * records-by-contact listing, and interaction count updates.
 * Reuses "case management is enabled" from entity-schema.steps.ts
 * and "the server is reset" from common.steps.ts.
 *
 * Step names are prefixed "screen-pop" to avoid collisions with
 * the similar CMS contact steps in cms.steps.ts.
 */
import { expect } from '@playwright/test'
import { Given, When, Then, Before, getState, setState } from './fixtures'
import {
  createContactViaApi,
  createRecordViaApi,
  createEntityTypeViaApi,
  listEntityTypesViaApi,
  linkContactToRecordViaApi,
  updateRecordViaApi,
  identifyCallerViaApi,
  lookupContactViaApi,
  listRecordsByContactViaApi,
} from '../../api-helpers'
import type { CallerIdentificationResult } from '../../api-helpers'

// ── Local State ────────────────────────────────────────────────────

interface ScreenPopState {
  lastContact?: Record<string, unknown>
  identificationResult?: CallerIdentificationResult
  lookupResult?: { contact: Record<string, unknown> | null }
  contactRecords?: { records: Record<string, unknown>[]; total: number }
  entityTypeId?: string
}

const SCREEN_POP_KEY = 'screen_pop'

function getScreenPopState(world: Record<string, unknown>): ScreenPopState {
  return getState<ScreenPopState>(world, SCREEN_POP_KEY)
}


Before({ tags: '@telephony' }, async ({ world }) => {
  const sp = {}
  setState(world, SCREEN_POP_KEY, sp)
})

// ── Helpers ────────────────────────────────────────────────────────

async function resolveOrCreateEntityType(
  request: import('@playwright/test').APIRequestContext,
): Promise<string> {
  if (getScreenPopState(world).entityTypeId) return getScreenPopState(world).entityTypeId

  const types = await listEntityTypesViaApi(request)
  const existing = types.find(t => t.name === 'screen_pop_case')
  if (existing) {
    getScreenPopState(world).entityTypeId = existing.id as string
    return getScreenPopState(world).entityTypeId
  }

  const created = await createEntityTypeViaApi(request, {
    name: 'screen_pop_case',
    category: 'case',
  })
  getScreenPopState(world).entityTypeId = created.id as string
  return getScreenPopState(world).entityTypeId
}

// ── Given Steps ────────────────────────────────────────────────────

Given('a screen-pop contact exists with identifier hash {string}', async ({ request, world }, hash: string) => {
  getScreenPopState(world).lastContact = await createContactViaApi(request, { identifierHashes: [hash] })
})

Given('{int} open records are linked to the contact', async ({ request, world }, count: number) => {
  const entityTypeId = await resolveOrCreateEntityType(request)
  const contactId = getScreenPopState(world).lastContact!.id as string

  for (let i = 0; i < count; i++) {
    const record = await createRecordViaApi(request, entityTypeId, {
      statusHash: 'status_open',
    })
    await linkContactToRecordViaApi(request, record.id as string, contactId, 'subject')
  }
})

Given('{int} closed record is linked to the contact', async ({ request, world }, count: number) => {
  const entityTypeId = await resolveOrCreateEntityType(request)
  const contactId = getScreenPopState(world).lastContact!.id as string

  for (let i = 0; i < count; i++) {
    const record = await createRecordViaApi(request, entityTypeId, {
      statusHash: 'status_closed',
    })
    await linkContactToRecordViaApi(request, record.id as string, contactId, 'subject')
    // Close the record by setting closedAt
    await updateRecordViaApi(request, record.id as string, {
      closedAt: new Date().toISOString(),
    })
  }
})

// ── When Steps ─────────────────────────────────────────────────────

When('a call arrives from identifier hash {string}', async ({ request, world }, hash: string) => {
  getScreenPopState(world).identificationResult = await identifyCallerViaApi(request, hash)
})

When('the admin looks up identifier hash {string}', async ({ request, world }, hash: string) => {
  getScreenPopState(world).lookupResult = await lookupContactViaApi(request, hash)
})

When('the admin lists records for the contact', async ({ request, world }) => {
  const contactId = getScreenPopState(world).lastContact!.id as string
  getScreenPopState(world).contactRecords = await listRecordsByContactViaApi(request, contactId)
})

// ── Then Steps ─────────────────────────────────────────────────────

Then('the contact identification should return the matching contact', async () => {
  expect(getScreenPopState(world).identificationResult).toBeTruthy()
  expect(getScreenPopState(world).identificationResult!.contact).not.toBeNull()
  if (getScreenPopState(world).lastContact) {
    expect(getScreenPopState(world).identificationResult!.contact!.id).toBe(getScreenPopState(world).lastContact.id)
  }
})

Then('the contact identification should return no match', async () => {
  expect(getScreenPopState(world).identificationResult).toBeTruthy()
  expect(getScreenPopState(world).identificationResult!.contact).toBeNull()
  expect(getScreenPopState(world).identificationResult!.activeCaseCount).toBe(0)
})

Then('the lookup result should include the contact', async () => {
  expect(getScreenPopState(world).lookupResult).toBeTruthy()
  expect(getScreenPopState(world).lookupResult!.contact).not.toBeNull()
  expect(getScreenPopState(world).lookupResult!.contact!.id).toBe(getScreenPopState(world).lastContact!.id)
})

Then('the contact record list should have {int} records', async ({ world }, count: number) => {
  expect(getScreenPopState(world).contactRecords).toBeTruthy()
  expect(getScreenPopState(world).contactRecords!.records.length).toBe(count)
})

Then('no closed records should be included', async () => {
  expect(getScreenPopState(world).contactRecords).toBeTruthy()
  for (const record of getScreenPopState(world).contactRecords!.records) {
    expect(record.closedAt).toBeFalsy()
  }
})

Then('the contact interactionCount should be {int}', async ({ request, world }, count: number) => {
  // Re-fetch the contact via its identifier hash to get updated interaction count
  const identifierHashes = getScreenPopState(world).lastContact!.identifierHashes as string[] | undefined
  if (!identifierHashes || identifierHashes.length === 0) {
    throw new Error('No identifier hashes on contact')
  }
  const result = await lookupContactViaApi(request, identifierHashes[0])
  expect(result.contact).not.toBeNull()
  expect(result.contact!.interactionCount).toBe(count)
})
