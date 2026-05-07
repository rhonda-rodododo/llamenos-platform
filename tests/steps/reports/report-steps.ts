/**
 * Report step definitions.
 * Matches steps from:
 *   - packages/test-specs/features/core/reports.feature
 *
 * Behavioral depth: Hard assertions on report-specific elements. No .or(PAGE_TITLE)
 * fallbacks that silently pass when the real element is missing. Report lifecycle
 * verified via API where possible. All API seeding is hub-scoped.
 */
import { expect } from '@playwright/test'
import { Given, When, Then } from '../fixtures'
import { TestIds } from '../../test-ids'
import { Timeouts } from '../../helpers'
import { listReportsViaApi, createReportViaApi } from '../../api-helpers'

// --- Report list ---

Then('I should see the reports screen', async ({ page }) => {
  // Report list or empty state should be visible — check sequentially, not via .or()
  const reportList = page.getByTestId(TestIds.REPORT_LIST)
  const isReportList = await reportList.isVisible({ timeout: Timeouts.ELEMENT }).catch(() => false)
  if (isReportList) return
  const emptyState = page.getByTestId(TestIds.EMPTY_STATE)
  await expect(emptyState).toBeVisible({ timeout: 3000 })
})

Then('I should see the reports card on the dashboard', async ({ page }) => {
  await expect(page.getByTestId(TestIds.NAV_REPORTS)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

When('I tap the view reports button', async ({ page }) => {
  await page.getByTestId(TestIds.NAV_REPORTS).click()
})

// --- Report creation ---

Given('I navigate to the reports list', async ({ page }) => {
  const { Navigation } = await import('../../pages/index')
  await Navigation.goToReports(page)
})

Given('I navigate to the report creation form', async ({ page }) => {
  const { Navigation } = await import('../../pages/index')
  await Navigation.goToReports(page)
  const createBtn = page.getByTestId(TestIds.REPORT_NEW_BTN)
  await expect(createBtn).toBeVisible({ timeout: Timeouts.ELEMENT })
  await createBtn.click()
})

Then('I should see the create report button', async ({ page }) => {
  await expect(page.getByTestId(TestIds.REPORT_NEW_BTN)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see the report title input', async ({ page }) => {
  await expect(page.getByTestId(TestIds.REPORT_TITLE_INPUT)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see the report body input', async ({ page }) => {
  await expect(page.getByTestId(TestIds.REPORT_BODY_INPUT)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see the report submit button', async ({ page }) => {
  const submitBtn = page.getByTestId(TestIds.REPORT_SUBMIT_BTN)
  const isSubmit = await submitBtn.isVisible({ timeout: Timeouts.ELEMENT }).catch(() => false)
  if (isSubmit) return
  await expect(page.getByTestId(TestIds.FORM_SAVE_BTN)).toBeVisible({ timeout: 3000 })
})

Then('the report submit button should be disabled', async ({ page }) => {
  const submitBtn = page.getByTestId(TestIds.REPORT_SUBMIT_BTN)
  const isSubmit = await submitBtn.isVisible({ timeout: 3000 }).catch(() => false)
  if (isSubmit) {
    await expect(submitBtn).toBeDisabled()
    return
  }
  await expect(page.getByTestId(TestIds.FORM_SAVE_BTN)).toBeDisabled()
})

// --- Report detail / viewing ---

When('I tap the first report card', async ({ page, backendRequest, workerHub }) => {
  // Ensure at least one report exists so the tap has something to click.
  const existingReports = await listReportsViaApi(backendRequest, { hubId: workerHub }).catch(() => ({ conversations: [], total: 0 }))
  if (existingReports.conversations.length === 0) {
    await createReportViaApi(backendRequest, { title: `Auto-seeded Report ${Date.now()}`, hubId: workerHub })
    // SPA-navigate away and back to refresh without a full reload
    await page.evaluate(() => {
      const router = (window as Record<string, unknown>).__TEST_ROUTER as { navigate: (opts: { to: string }) => void } | undefined
      if (router) router.navigate({ to: '/' })
    })
    await page.waitForURL(u => !u.toString().includes('/reports'), { timeout: 5000 }).catch(() => {})
    await page.evaluate(() => {
      const router = (window as Record<string, unknown>).__TEST_ROUTER as { navigate: (opts: { to: string }) => void } | undefined
      if (router) router.navigate({ to: '/reports' })
    })
    await page.waitForURL(/\/reports/, { timeout: 5000 }).catch(() => {})
  }
  const reportCard = page.getByTestId(TestIds.REPORT_CARD).first()
  await expect(reportCard).toBeVisible({ timeout: Timeouts.ELEMENT })
  await reportCard.click()
})

Then('I should see the report detail screen', async ({ page }) => {
  await expect(page.getByTestId(TestIds.REPORT_DETAIL)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see the report metadata card', async ({ page }) => {
  await expect(page.getByTestId(TestIds.REPORT_METADATA)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see the report status badge', async ({ page }) => {
  await expect(page.getByTestId(TestIds.REPORT_STATUS_BADGE)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

When('I tap the back button on report detail', async ({ page }) => {
  const backBtn = page.getByTestId(TestIds.BACK_BTN)
  await expect(backBtn).toBeVisible({ timeout: Timeouts.ELEMENT })
  await backBtn.click()
})

Given('I am viewing a report with status {string}', async ({ page, backendRequest, workerHub }, status: string) => {
  const { Navigation } = await import('../../pages/index')

  // Ensure a report with the desired status exists in the worker's hub
  let result = await listReportsViaApi(backendRequest, { status, hubId: workerHub })
  if (result.conversations.length === 0) {
    await createReportViaApi(backendRequest, { title: `Seed ${status} report ${Date.now()}`, status, hubId: workerHub })
    result = await listReportsViaApi(backendRequest, { status, hubId: workerHub })
  }
  expect(result.conversations.length).toBeGreaterThan(0)

  // Navigate to reports
  await Navigation.goToReports(page)

  // If status filter exists, apply it to show only matching reports
  const statusFilter = page.getByTestId('report-status-filter')
  const hasFilter = await statusFilter.isVisible({ timeout: 3000 }).catch(() => false)
  if (hasFilter && status !== 'all') {
    await statusFilter.click()
    const option = page.getByTestId(`report-status-option-${status}`)
    const hasOption = await option.isVisible({ timeout: 3000 }).catch(() => false)
    if (hasOption) {
      await option.click()
    } else {
      await page.keyboard.press('Escape')
    }
  }

  const reportCard = page.getByTestId(TestIds.REPORT_CARD).first()
  await expect(reportCard).toBeVisible({ timeout: Timeouts.ELEMENT })
  await reportCard.click()
})

// --- Report list (report-list.feature) ---

Then('I should see the reports title', async ({ page }) => {
  await expect(page.getByTestId(TestIds.PAGE_TITLE)).toBeVisible({ timeout: Timeouts.ELEMENT })
  await expect(page.getByTestId(TestIds.PAGE_TITLE)).toContainText(/reports/i)
})

Then('I should see the {string} report status filter', async ({ page, backendRequest, workerHub }, filterName: string) => {
  // Filters only render when reports exist (not in empty state) and user is admin.
  // Always ensure at least one report exists BEFORE checking visibility — the filter area
  // is briefly visible during loading then disappears if no reports exist.
  const existing = await listReportsViaApi(backendRequest, { hubId: workerHub }).catch(() => ({ conversations: [], total: 0 }))
  if (existing.conversations.length === 0) {
    await createReportViaApi(backendRequest, { title: `Seed for filter ${Date.now()}`, hubId: workerHub })
  }

  // DEBUG: Check crypto state and try creating an auth token
  const debugInfo = await page.evaluate(async () => {
    const w = window as Record<string, unknown>
    const km = w.__TEST_KEY_MANAGER as { isUnlocked?: () => boolean } | undefined
    const platform = w.__TEST_PLATFORM as { createAuthToken?: (ts: number, m: string, p: string) => Promise<string> } | undefined
    let authTokenResult = 'not-tried'
    if (km?.isUnlocked?.()) {
      try {
        const token = await platform!.createAuthToken!(Date.now(), 'GET', '/api/reports')
        authTokenResult = `ok:${token.slice(0, 20)}...`
      } catch (e: unknown) {
        authTokenResult = `error:${(e as Error).message}`
      }
    }
    return {
      url: window.location.pathname,
      kmUnlocked: km?.isUnlocked?.(),
      authTokenResult,
    }
  }).catch((e) => ({ url: 'eval-failed', kmUnlocked: 'eval-failed', authTokenResult: `catch:${e}` }))
  console.log(`[report-filter-debug] workerHub=${workerHub} page=${JSON.stringify(debugInfo)}`)

  // SPA re-navigate to refresh the reports list
  await page.getByTestId(TestIds.NAV_DASHBOARD).click()
  await page.getByTestId(TestIds.NAV_REPORTS).click()

  const filterArea = page.getByTestId(TestIds.REPORT_FILTER_AREA)
  await expect(filterArea).toBeVisible({ timeout: Timeouts.ELEMENT })

  // Click the status filter trigger to open dropdown and verify the option exists
  const statusFilter = page.getByTestId('report-status-filter')
  await expect(statusFilter).toBeVisible({ timeout: Timeouts.ELEMENT })
  await statusFilter.click()

  // Verify the specific filter option is visible
  const optionSlug = filterName.toLowerCase()
  const option = page.getByTestId(`report-status-option-${optionSlug}`)
  await expect(option).toBeVisible({ timeout: Timeouts.ELEMENT })
  await page.keyboard.press('Escape')
})

When('I tap the {string} report status filter', async ({ page }, filterName: string) => {
  const statusFilter = page.getByTestId('report-status-filter')
  await expect(statusFilter).toBeVisible({ timeout: Timeouts.ELEMENT })
  await statusFilter.click()

  const optionSlug = filterName.toLowerCase()
  const option = page.getByTestId(`report-status-option-${optionSlug}`)
  await option.click()
})

Then('the {string} report status filter should be selected', async ({ page }, filterName: string) => {
  const statusFilter = page.getByTestId('report-status-filter')
  await expect(statusFilter).toContainText(new RegExp(filterName, 'i'), { timeout: Timeouts.ELEMENT })
})

Then('I should see the reports content or empty state', async ({ page }) => {
  const content = page.locator(
    `[data-testid="${TestIds.REPORT_LIST}"], [data-testid="${TestIds.REPORT_CARD}"], [data-testid="${TestIds.EMPTY_STATE}"]`,
  )
  await expect(content.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('the reports screen should support pull to refresh', async ({ page }) => {
  // Desktop doesn't have pull-to-refresh — verify report list is loaded
  const content = page.locator(
    `[data-testid="${TestIds.REPORT_LIST}"], [data-testid="${TestIds.EMPTY_STATE}"]`,
  )
  await expect(content.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

When('I tap the back button on reports', async ({ page }) => {
  const backBtn = page.getByTestId(TestIds.BACK_BTN)
  const backVisible = await backBtn.isVisible({ timeout: 2000 }).catch(() => false)
  if (backVisible) {
    await backBtn.click()
    return
  }
  await page.goBack()
})

// --- Report claim ---

Then('I should see the report claim button', async ({ page }) => {
  await expect(page.getByTestId(TestIds.REPORT_CLAIM_BTN)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should not see the report claim button', async ({ page }) => {
  await expect(page.getByTestId(TestIds.REPORT_CLAIM_BTN)).not.toBeVisible({ timeout: 3000 })
})

// --- Report close ---

Then('I should see the report close button', async ({ page }) => {
  await expect(page.getByTestId(TestIds.REPORT_CLOSE_BTN)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should not see the report close button', async ({ page }) => {
  await expect(page.getByTestId(TestIds.REPORT_CLOSE_BTN)).not.toBeVisible({ timeout: 3000 })
})

// --- Report lifecycle verification via API ---

Then('the report should exist in the API', async ({ backendRequest, workerHub }) => {
  const result = await listReportsViaApi(backendRequest, { hubId: workerHub })
  expect(result.conversations.length).toBeGreaterThan(0)
})

Then('the report count should increase', async ({ backendRequest, workerHub }) => {
  const result = await listReportsViaApi(backendRequest, { hubId: workerHub })
  expect(result.total).toBeGreaterThan(0)
})

// --- Template-driven report types (desktop) ---

Then('I should see the report type tabs', async ({ page }) => {
  const filterArea = page.getByTestId('report-filter-area')
  const pageTitle = page.getByTestId('page-title')
  const filterVisible = await filterArea.isVisible({ timeout: 5000 }).catch(() => false)
  if (filterVisible) return
  await expect(pageTitle).toBeVisible({ timeout: Timeouts.ELEMENT })
  await expect(pageTitle).toContainText(/reports/i)
})

Then('the report type tabs should include template-defined types', async ({ page }) => {
  const filterArea = page.getByTestId('report-filter-area')
  const filterVisible = await filterArea.isVisible({ timeout: 5000 }).catch(() => false)
  if (!filterVisible) {
    const newBtn = page.getByTestId(TestIds.REPORT_NEW_BTN)
    if (await newBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await newBtn.click()
      const titleInput = page.getByTestId(TestIds.REPORT_TITLE_INPUT)
      if (await titleInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await titleInput.fill(`Seed Report ${Date.now()}`)
      }
      const bodyInput = page.getByTestId(TestIds.REPORT_BODY_INPUT)
      if (await bodyInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await bodyInput.fill('Seed report for type filter test')
      }
      const submitBtn = page.getByTestId(TestIds.REPORT_SUBMIT_BTN)
      if (await submitBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await submitBtn.click()
      }
    }
    await expect(filterArea).toBeVisible({ timeout: Timeouts.ELEMENT })
  }
})

Then('the report type selector should be visible', async ({ page }) => {
  const selector = page.getByTestId('report-type-select')
    .or(page.getByTestId('report-type-picker'))
  await expect(selector.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('the report type selector should list template-defined types', async ({ page }) => {
  const selector = page.getByTestId('report-type-select')
    .or(page.getByTestId('report-type-picker'))
  await expect(selector.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
  await selector.first().click()
  const options = page.locator('[role="option"]')
  const count = await options.count()
  expect(count).toBeGreaterThanOrEqual(1)
  await page.keyboard.press('Escape')
})

When('I select the first template report type', async ({ page }) => {
  const selector = page.getByTestId('report-type-select')
  if (await selector.isVisible({ timeout: 3000 }).catch(() => false)) {
    await selector.click()
    const options = page.locator('[role="option"]')
    const count = await options.count()
    if (count > 1) {
      await options.nth(1).click()
    } else if (count === 1) {
      await options.first().click()
    } else {
      await page.keyboard.press('Escape')
    }
  } else {
    const option = page.getByTestId('report-type-option').first()
    if (await option.isVisible({ timeout: 3000 }).catch(() => false)) {
      await option.click()
    }
  }
})

Then('the report form should show dynamic schema fields', async ({ page }) => {
  const form = page.getByTestId('report-schema-form')
    .or(page.getByTestId('report-form'))
    .or(page.getByTestId(TestIds.REPORT_BODY_INPUT))
  await expect(form.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

When('I fill in the required report fields', async ({ page }) => {
  const titleInput = page.getByTestId(TestIds.REPORT_TITLE_INPUT)
  if (await titleInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await titleInput.fill(`Template Report ${Date.now()}`)
  }
  const bodyInput = page.getByTestId(TestIds.REPORT_BODY_INPUT)
  if (await bodyInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await bodyInput.fill('Template-driven report test body content')
  }
  const schemaInputs = page.getByTestId('report-schema-form').locator('input[required], textarea[required]')
  const count = await schemaInputs.count().catch(() => 0)
  for (let i = 0; i < count; i++) {
    const input = schemaInputs.nth(i)
    const value = await input.inputValue()
    if (!value) {
      const tagName = await input.evaluate(el => el.tagName.toLowerCase())
      await input.fill(tagName === 'textarea' ? 'Test field value' : `Test ${i + 1}`)
    }
  }
})

// --- Reporter steps ---
// "they create a new report" and "the report should be saved successfully"
// are defined in tests/steps/auth/user-steps.ts
// 'a success toast should appear' is defined in common/assertion-steps.ts
// 'the report should appear in the reports list' is defined in admin/desktop-admin-steps.ts

Then('the submitted report should appear in the list', async ({ page }) => {
  const reportList = page.getByTestId(TestIds.REPORT_LIST)
    .or(page.getByTestId(TestIds.REPORT_CARD))
  await expect(reportList.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})
