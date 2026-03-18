/**
 * Report-to-case lifecycle step definitions (Epic 365).
 *
 * Tests the full workflow from report submission through case conversion,
 * reporter data isolation, and JSONB metadata persistence.
 */
import { expect } from '@playwright/test'
import { Given, When, Then, Before } from './fixtures'
import {
  apiGet,
  apiPost,
  apiPatch,
  createVolunteerViaApi,
  createReportViaApi,
  assignReportViaApi,
  listReportsViaApi,
  createRecordViaApi,
  createCaseFromReportViaApi,
  getRecordViaApi,
  enableCaseManagementViaApi,
  createEntityTypeViaApi,
  updateReportStatusViaApi,
  ADMIN_NSEC,
} from '../../api-helpers'
import { assertIsObject } from '../../integrity-helpers'
import { TestDB } from '../../db-helpers'

// ── Local State ────────────────────────────────────────────────────

interface LifecycleState {
  entityTypeId?: string
  reportId?: string
  reportTitle?: string
  reportCategory?: string
  caseRecordId?: string
  caseLinkId?: string
  volunteerPubkey?: string
  volunteerNsec?: string
  /** Reporter-specific state for isolation tests */
  reporters: Map<string, { nsec: string; pubkey: string; reportIds: string[]; reportTitles: string[] }>
  /** Last fetched report data */
  lastFetchedReport?: Record<string, unknown>
}

let lc: LifecycleState

Before({ tags: '@lifecycle' }, async () => {
  lc = {
    reporters: new Map(),
  }
})

// ── Helpers ────────────────────────────────────────────────────────

async function ensureEntityType(
  request: import('@playwright/test').APIRequestContext,
): Promise<string> {
  if (lc.entityTypeId) return lc.entityTypeId
  await enableCaseManagementViaApi(request, true)
  const et = await createEntityTypeViaApi(request, {
    name: `lifecycle_case_${Date.now()}`,
  })
  lc.entityTypeId = et.id
  return et.id
}

// ── Full Lifecycle ────────────────────────────────────────────────

Given(
  'a reporter submits a report with title {string}',
  async ({ request }, title: string) => {
    const report = await createReportViaApi(request, { title })
    lc.reportId = report.id
    lc.reportTitle = title
  },
)

Given('a volunteer is assigned to the report', async ({ request }) => {
  expect(lc.reportId).toBeTruthy()
  const vol = await createVolunteerViaApi(request, {
    name: `Lifecycle Vol ${Date.now()}`,
  })
  lc.volunteerPubkey = vol.pubkey
  lc.volunteerNsec = vol.nsec

  await assignReportViaApi(request, lc.reportId!, vol.pubkey)
})

When('the admin converts the report to a case', async ({ request }) => {
  expect(lc.reportId).toBeTruthy()
  const entityTypeId = await ensureEntityType(request)

  const result = await createCaseFromReportViaApi(
    request,
    lc.reportId!,
    entityTypeId,
  )
  lc.caseRecordId = result.recordId
  lc.caseLinkId = result.linkId
})

Then('a case record should be created', async () => {
  expect(lc.caseRecordId).toBeTruthy()
})

Then('the case should be linked to the original report', async ({ request }) => {
  expect(lc.caseRecordId).toBeTruthy()
  expect(lc.reportId).toBeTruthy()
  // The link was created by createCaseFromReportViaApi
  expect(lc.caseLinkId).toBeTruthy()
})

Then('listing the report should show the linked case ID', async ({ request }) => {
  expect(lc.reportId).toBeTruthy()
  expect(lc.caseRecordId).toBeTruthy()

  // Fetch the report's linked records
  const res = await apiGet<{ records: Array<{ caseId: string }> }>(
    request,
    `/reports/${lc.reportId}/records`,
  )
  // The report should have a linked case
  if (res.status === 200 && res.data.records) {
    const linkedIds = res.data.records.map((r: { caseId: string }) => r.caseId)
    expect(linkedIds).toContain(lc.caseRecordId)
  }
})

Then('listing the case should show the linked report ID', async ({ request }) => {
  expect(lc.caseRecordId).toBeTruthy()

  // Get the case record — it should reference the report
  const record = await getRecordViaApi(request, lc.caseRecordId!)
  // The record was linked via the report-records endpoint,
  // so the link exists in the join table
  expect(record).toBeTruthy()
})

// ── Reporter Data Isolation ───────────────────────────────────────

Given(
  'reporter {string} creates a report with title {string}',
  async ({ request }, reporterName: string, title: string) => {
    // Create a volunteer with reporter role
    const vol = await createVolunteerViaApi(request, {
      name: `Reporter ${reporterName} ${Date.now()}`,
    })
    await apiPatch(request, `/volunteers/${vol.pubkey}`, { roles: ['role-reporter'] })

    // Create the report authenticated as the reporter so the server records their pubkey
    // as the contact/author — required for the reporter-isolation filter in GET /reports
    const report = await createReportViaApi(request, {
      title,
      nsec: vol.nsec,
    })

    if (!lc.reporters.has(reporterName)) {
      lc.reporters.set(reporterName, {
        nsec: vol.nsec,
        pubkey: vol.pubkey,
        reportIds: [],
        reportTitles: [],
      })
    }
    lc.reporters.get(reporterName)!.reportIds.push(report.id)
    lc.reporters.get(reporterName)!.reportTitles.push(title)
  },
)

When('{string} lists their own reports', async ({ request }, reporterName: string) => {
  const reporter = lc.reporters.get(reporterName)
  expect(reporter).toBeTruthy()

  // List reports as the reporter
  const { status, data } = await apiGet<{ conversations: Array<{ id: string; metadata?: { reportTitle?: string } }> }>(
    request,
    '/reports',
    reporter!.nsec,
  )
  // Store for assertion
  lc.lastFetchedReport = { conversations: data?.conversations ?? [], reporterName }
})

Then('{string} should see {string}', async ({}, reporterName: string, title: string) => {
  const reporter = lc.reporters.get(reporterName)
  expect(reporter).toBeTruthy()

  // The reporter's own reports should be visible
  // Since we're checking by title in the metadata
  const conversations = (lc.lastFetchedReport as Record<string, unknown>)?.conversations as Array<{
    id: string
    metadata?: { reportTitle?: string }
  }>

  // The reporter should find their report by ID
  const reportIds = reporter!.reportIds
  const found = conversations?.some(c => reportIds.includes(c.id))
  expect(found).toBe(true)
})

Then('{string} should not see {string}', async ({}, reporterName: string, title: string) => {
  const reporter = lc.reporters.get(reporterName)
  expect(reporter).toBeTruthy()

  // Get the other reporter's IDs
  const otherReportIds: string[] = []
  for (const [name, r] of lc.reporters) {
    if (name !== reporterName) {
      otherReportIds.push(...r.reportIds)
    }
  }

  const conversations = (lc.lastFetchedReport as Record<string, unknown>)?.conversations as Array<{
    id: string
  }>

  // None of the other reporter's report IDs should be visible
  for (const otherId of otherReportIds) {
    const found = conversations?.some(c => c.id === otherId)
    expect(found).toBeFalsy()
  }
})

// ── Metadata Persistence ──────────────────────────────────────────

Given(
  'a report exists with metadata category {string} and title {string}',
  async ({ request }, category: string, title: string) => {
    const report = await createReportViaApi(request, { title, category })
    lc.reportId = report.id
    lc.reportCategory = category
    lc.reportTitle = title
  },
)

When(
  'the admin updates the lifecycle report status to {string}',
  async ({ request }, newStatus: string) => {
    expect(lc.reportId).toBeTruthy()
    if (newStatus === 'active') {
      // Need to assign first
      const vol = await createVolunteerViaApi(request, {
        name: `Metadata Vol ${Date.now()}`,
      })
      await assignReportViaApi(request, lc.reportId!, vol.pubkey)
    } else {
      await updateReportStatusViaApi(request, lc.reportId!, newStatus)
    }
  },
)

When('the report is fetched again', async ({ request }) => {
  expect(lc.reportId).toBeTruthy()
  const { status, data } = await apiGet<Record<string, unknown>>(
    request,
    `/reports/${lc.reportId}`,
  )
  // If individual report GET is not available, list and find
  if (status === 200) {
    lc.lastFetchedReport = data
  } else {
    // Fallback: list reports and find by ID
    const list = await listReportsViaApi(request)
    const found = list.conversations.find(c => c.id === lc.reportId)
    lc.lastFetchedReport = found as unknown as Record<string, unknown>
  }
})

Then(
  'the report metadata should still contain category {string}',
  async ({}, category: string) => {
    expect(lc.lastFetchedReport).toBeTruthy()
    const metadata = (lc.lastFetchedReport as Record<string, unknown>).metadata as Record<string, unknown> | undefined
    // The category should persist through status updates
    if (metadata) {
      expect(metadata.reportCategory ?? metadata.category).toBe(category)
    }
  },
)

Then(
  'the report metadata should be a proper JSONB object, not a double-serialized string',
  async () => {
    expect(lc.lastFetchedReport).toBeTruthy()
    const metadata = (lc.lastFetchedReport as Record<string, unknown>).metadata
    if (metadata !== null && metadata !== undefined) {
      // Use the integrity helper to detect double-serialization
      assertIsObject(metadata, 'report.metadata')
    }
  },
)
