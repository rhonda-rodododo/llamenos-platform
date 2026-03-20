/**
 * Triage queue step definitions.
 * Matches steps from:
 *   - packages/test-specs/features/platform/desktop/cases/cms-triage.feature
 *
 * Covers: triage queue loading, status tabs, report content display,
 * inline case creation, conversion status tracking, linked cases.
 */
import { expect } from '@playwright/test'
import { Given, When, Then } from '../fixtures'
import { Timeouts, navigateAfterLogin } from '../../helpers'
import {
  enableCaseManagementViaApi,
  applyTemplateViaApi,
  listTemplatesViaApi,
  createCmsReportTypeViaApi,
  createReportViaApi,
  createRecordViaApi,
  listEntityTypesViaApi,
  createCaseFromReportViaApi,
} from '../../api-helpers'

// State is now in casesWorld fixture (casesWorld.triageReportTypeId, casesWorld.triageReportId)

// --- Given steps for triage data setup ---

Given('a CMS report type with case conversion exists', async ({ backendRequest: request, casesWorld }) => {
  const rt = await createCmsReportTypeViaApi(request, {
    name: `triage_type_${Date.now()}`,
    label: 'Triage Report',
    labelPlural: 'Triage Reports',
    allowCaseConversion: true,
  })
  casesWorld.triageReportTypeId = (rt as { id: string }).id
})

Given('a triage-eligible report exists', async ({ backendRequest: request, casesWorld }) => {
  const report = await createReportViaApi(request, {
    title: `Triage Report ${Date.now()}`,
    reportTypeId: casesWorld.triageReportTypeId,
  })
  casesWorld.triageReportId = report.id
})

Given('a triage-eligible report with a linked case exists', async ({ backendRequest: request, casesWorld }) => {
  const report = await createReportViaApi(request, {
    title: `Triage Linked ${Date.now()}`,
    reportTypeId: casesWorld.triageReportTypeId,
  })
  casesWorld.triageReportId = report.id

  // Create and link a case
  const entityTypes = await listEntityTypesViaApi(request)
  if (entityTypes.length > 0) {
    const etId = (entityTypes[0] as { id: string }).id
    await createCaseFromReportViaApi(request, casesWorld.triageReportId, etId)
  }
})

// --- When steps ---

When('I click the first triage report card', async ({ page }) => {
  const card = page.getByTestId('triage-report-card').first()
  await expect(card).toBeVisible({ timeout: Timeouts.ELEMENT })
  await card.click()
})

When('I click the {string} status tab', async ({ page }, tabLabel: string) => {
  // Map human-readable label to data-testid suffix
  const keyMap: Record<string, string> = {
    'Pending': 'pending',
    'In Progress': 'in_progress',
    'Completed': 'completed',
  }
  const key = keyMap[tabLabel] ?? tabLabel.toLowerCase().replace(/ /g, '_')
  await page.getByTestId(`triage-status-tab-${key}`).click()
})

When('I fill in the triage case title', async ({ page }) => {
  const input = page.getByTestId('triage-case-title-input')
  await expect(input).toBeVisible({ timeout: Timeouts.ELEMENT })
  await input.fill(`Triage Case ${Date.now()}`)
})

When('I click the triage create case button', async ({ page }) => {
  await page.getByTestId('triage-create-case-btn').click()
})

When('I click the mark in progress button', async ({ page }) => {
  await page.getByTestId('triage-mark-in-progress').click()
})

When('I click the mark completed button', async ({ page }) => {
  await page.getByTestId('triage-mark-completed').click()
})

When('I look at the navigation sidebar', async ({ page }) => {
  await expect(page.getByTestId('nav-sidebar')).toBeVisible({ timeout: Timeouts.ELEMENT })
})

// --- Then steps ---

Then('the pending status tab should be active', async ({ page }) => {
  const tab = page.getByTestId('triage-status-tab-pending')
  await expect(tab).toBeVisible({ timeout: Timeouts.ELEMENT })
  await expect(tab).toHaveClass(/bg-primary/)
})

Then('the in progress status tab should be active', async ({ page }) => {
  const tab = page.getByTestId('triage-status-tab-in_progress')
  await expect(tab).toBeVisible({ timeout: Timeouts.ELEMENT })
  await expect(tab).toHaveClass(/bg-primary/)
})

Then('the triage report content should be visible', async ({ page }) => {
  await expect(page.getByTestId('triage-report-content')).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('the report type label should be visible', async ({ page }) => {
  await expect(page.getByTestId('triage-report-type-label')).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('the triage case creation panel should be visible', async ({ page }) => {
  await expect(page.getByTestId('triage-create-case-panel')).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('the linked cases section should show at least one case', async ({ page }) => {
  const linked = page.getByTestId('triage-linked-cases')
  await expect(linked).toBeVisible({ timeout: Timeouts.ELEMENT })
  const card = page.getByTestId('triage-linked-case-card')
  await expect(card.first()).toBeVisible({ timeout: Timeouts.ELEMENT * 2 })
})

Then('the triage queue should show the no reports message', async ({ page }) => {
  const queue = page.getByTestId('triage-queue')
  await expect(queue).toBeVisible({ timeout: Timeouts.ELEMENT })
  // Look for the no-reports message text
  const noReports = page.getByText(/no reports in triage queue/i)
  await expect(noReports).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('the {string} nav link should be visible', async ({ page }, linkName: string) => {
  const testId = `nav-${linkName.toLowerCase()}`
  await expect(page.getByTestId(testId)).toBeVisible({ timeout: Timeouts.ELEMENT })
})
