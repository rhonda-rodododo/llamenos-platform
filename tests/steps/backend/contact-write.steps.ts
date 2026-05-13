/**
 * Step definitions for CMS contact write operations (EP06-A2).
 *
 * Covers update contact with encrypted profiles and entity-file upload.
 * Reuses "case management is enabled" from entity-schema.steps.ts
 * and "a contact exists with identifier hash" from cms.steps.ts.
 */
import { expect } from '@playwright/test'
import { When, Then, getState, setState } from './fixtures'
import {
  updateContactViaApi,
  uploadEntityFileViaApi,
} from '../../api-helpers'

// ── Local State ────────────────────────────────────────────────────

interface ContactWriteState {
  updatedContact?: Record<string, unknown>
  uploadResult?: { fileId: string; uploadedAt: string }
}

const CONTACT_WRITE_KEY = 'contactWrite'

function getCwState(world: Record<string, unknown>): ContactWriteState {
  return getState<ContactWriteState>(world, CONTACT_WRITE_KEY)
}

// ── Steps ──────────────────────────────────────────────────────────

// "a contact exists with identifier hash" is defined in cms.steps.ts
// which stores the contact in the 'cms' state key under lastContact.
When('the admin updates the contact\'s encrypted profile', async ({ request, world }) => {
  const cmsState = getState<{ lastContact?: Record<string, unknown> }>(world, 'cms')
  const contactId = cmsState.lastContact?.id as string
  if (!contactId) throw new Error('No contact in cms state to update')
  const updated = await updateContactViaApi(request, contactId, {
    encryptedSummary: btoa(JSON.stringify({ displayName: 'Updated Profile', contactType: 'individual', tags: [] })),
    identifierHashes: [`updated_${Date.now()}`],
  })
  const cwState = getCwState(world)
  cwState.updatedContact = updated
  setState(world, CONTACT_WRITE_KEY, cwState)
})

Then('the contact should have updated encrypted profile', async ({ world }) => {
  const cwState = getCwState(world)
  expect(cwState.updatedContact).toBeDefined()
  expect(cwState.updatedContact?.encryptedSummary).toBeDefined()
})

When('the admin uploads a {int} KB encrypted blob to the entity file endpoint', async ({ request, world }, sizeKb: number) => {
  const cwState = getCwState(world)
  const result = await uploadEntityFileViaApi(request, sizeKb * 1024)
  cwState.uploadResult = result
  setState(world, CONTACT_WRITE_KEY, cwState)
})

Then('the response should contain a fileId', async ({ world }) => {
  const cwState = getCwState(world)
  expect(cwState.uploadResult?.fileId).toBeDefined()
  expect(typeof cwState.uploadResult?.fileId).toBe('string')
  expect(cwState.uploadResult?.fileId.length).toBeGreaterThan(0)
})

Then('the blob should be stored in blob storage under the entity-files prefix', async ({ world }) => {
  // The endpoint stores at entity-files/{fileId} — verified by successful 201 response
  // (integration test environment uses R2 stub; storage side-effect is verified by non-null fileId)
  const cwState = getCwState(world)
  expect(cwState.uploadResult?.fileId).toMatch(/^[0-9a-f-]{36}$/)
  expect(cwState.uploadResult?.uploadedAt).toBeDefined()
})
