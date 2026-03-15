/**
 * Template-Defined Report Types step definitions (Epic 343).
 *
 * Tests CMS report type definitions created from templates and via manual CRUD.
 * Reuses "the server is reset", "case management is enabled", and template apply
 * steps from other step files.
 */
import { expect } from '@playwright/test'
import { Given, When, Then, Before } from './fixtures'
import { shared } from './shared-state'
import {
  listCmsReportTypesViaApi,
  getCmsReportTypeViaApi,
  createCmsReportTypeViaApi,
  updateCmsReportTypeViaApi,
  deleteCmsReportTypeViaApi,
  applyTemplateViaApi,
  apiPost,
} from '../../api-helpers'

// ── Local State ────────────────────────────────────────────────────

interface ReportTypeState {
  reportTypes: Array<Record<string, unknown>>
  lastReportType?: Record<string, unknown>
  lastReportTypeId?: string
}

let state: ReportTypeState

Before({ tags: '@cms' }, async () => {
  state = {
    reportTypes: [],
  }
})

// ── Helper: find report type by name from list ─────────────────────

async function findCmsReportTypeByName(
  request: import('@playwright/test').APIRequestContext,
  name: string,
): Promise<Record<string, unknown> | undefined> {
  const types = await listCmsReportTypesViaApi(request)
  return types.find(t => t.name === name)
}

// ============================================================
// TEMPLATE REPORT TYPE STEPS
// ============================================================

Then('CMS report type {string} should exist', async ({ request }, name: string) => {
  const rt = await findCmsReportTypeByName(request, name)
  expect(rt).toBeTruthy()
  state.lastReportType = rt
  state.lastReportTypeId = rt!.id as string
})

Then('CMS report type {string} should have {string} enabled', async ({ request }, name: string, flag: string) => {
  const rt = state.lastReportType?.name === name
    ? state.lastReportType
    : await findCmsReportTypeByName(request, name)
  expect(rt).toBeTruthy()
  expect(rt![flag]).toBe(true)
})

When('the admin lists CMS report types', async ({ request }) => {
  state.reportTypes = await listCmsReportTypesViaApi(request)
})

Then('{int} CMS report types should be returned', async ({}, count: number) => {
  expect(state.reportTypes.length).toBe(count)
})

When('the admin gets CMS report type {string}', async ({ request }, name: string) => {
  const rt = await findCmsReportTypeByName(request, name)
  expect(rt).toBeTruthy()
  state.lastReportType = await getCmsReportTypeViaApi(request, rt!.id as string)
  state.lastReportTypeId = rt!.id as string
})

Then('the CMS report type should have name {string}', async ({}, name: string) => {
  expect(state.lastReportType).toBeTruthy()
  expect(state.lastReportType!.name).toBe(name)
})

Then('the CMS report type should have {int} fields', async ({}, count: number) => {
  expect(state.lastReportType).toBeTruthy()
  const fields = state.lastReportType!.fields as unknown[]
  expect(fields.length).toBe(count)
})

Then('the CMS report type field {string} should have {string} enabled', async ({}, fieldName: string, flag: string) => {
  expect(state.lastReportType).toBeTruthy()
  const fields = state.lastReportType!.fields as Array<Record<string, unknown>>
  const field = fields.find(f => f.name === fieldName)
  expect(field).toBeTruthy()
  expect(field![flag]).toBe(true)
})

// ============================================================
// REPORT TYPE CRUD STEPS
// ============================================================

When('the admin creates a custom CMS report type {string}', async ({ request }, name: string) => {
  state.lastReportType = await createCmsReportTypeViaApi(request, { name })
  state.lastReportTypeId = state.lastReportType.id as string
})

Then('the CMS report type should be retrievable', async ({ request }) => {
  const rt = await getCmsReportTypeViaApi(request, state.lastReportTypeId!)
  expect(rt).toBeTruthy()
  expect(rt.id).toBe(state.lastReportTypeId)
})

When('the admin updates the CMS report type label to {string}', async ({ request }, label: string) => {
  state.lastReportType = await updateCmsReportTypeViaApi(
    request,
    state.lastReportTypeId!,
    { label },
  )
})

Then('the CMS report type label should be {string}', async ({}, label: string) => {
  expect(state.lastReportType!.label).toBe(label)
})

When('the admin archives the CMS report type', async ({ request }) => {
  await deleteCmsReportTypeViaApi(request, state.lastReportTypeId!)
})

Then('the CMS report type should be marked as archived', async ({ request }) => {
  const rt = await getCmsReportTypeViaApi(request, state.lastReportTypeId!)
  expect(rt.isArchived).toBe(true)
})

When('the admin tries to create a CMS report type {string}', async ({ request }, name: string) => {
  try {
    await createCmsReportTypeViaApi(request, { name })
    shared.lastResponse = { status: 201, data: null }
  } catch (e: unknown) {
    const msg = (e as Error).message
    const match = msg.match(/(\d{3})/)
    shared.lastResponse = { status: match ? parseInt(match[1]) : 500, data: null }
  }
})
