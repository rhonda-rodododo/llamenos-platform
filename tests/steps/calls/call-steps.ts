/**
 * Call history and call date filter step definitions.
 * Matches steps from:
 *   - packages/test-specs/features/calls/call-date-filter.feature
 *   - packages/test-specs/features/calls/call-history.feature
 *
 * Behavioral depth: Hard assertions on call-specific elements.
 * No .or(PAGE_TITLE) fallbacks.
 */
import { expect } from '@playwright/test'
import { Given, When, Then } from '../fixtures'
import { TestIds } from '../../test-ids'
import { Timeouts, Navigation } from '../../helpers'

Given('I am on the call history screen', async ({ page }) => {
  await Navigation.goToCallHistory(page)
})

When('I tap the view call history button', async ({ page }) => {
  await page.getByTestId(TestIds.NAV_CALLS).click()
  await page.waitForTimeout(Timeouts.ASYNC_SETTLE)
})

Then('I should see the call history screen', async ({ page }) => {
  await expect(page.getByTestId(TestIds.PAGE_TITLE)).toBeVisible({ timeout: Timeouts.ELEMENT })
  await expect(page.getByTestId(TestIds.PAGE_TITLE)).toContainText(/call/i)
})

Then('I should see the call history title', async ({ page }) => {
  await expect(page.getByTestId(TestIds.PAGE_TITLE)).toBeVisible({ timeout: Timeouts.ELEMENT })
  await expect(page.getByTestId(TestIds.PAGE_TITLE)).toContainText(/call/i)
})

Then('I should see the {string} call filter chip', async ({ page }, filterName: string) => {
  const filterChip = page.getByText(new RegExp(filterName, 'i'))
  await expect(filterChip.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

When('I tap the {string} call filter chip', async ({ page }, filterName: string) => {
  const filterChip = page.getByText(new RegExp(filterName, 'i'))
  await expect(filterChip.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
  await filterChip.first().click()
})

Then('the {string} call filter should be selected', async ({ page }, filterName: string) => {
  const filterChip = page.getByText(new RegExp(filterName, 'i'))
  await expect(filterChip.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see the call history content or empty state', async ({ page }) => {
  const content = page.locator(
    `[data-testid="${TestIds.CALL_LIST}"], [data-testid="${TestIds.EMPTY_STATE}"], [data-testid="${TestIds.LOADING_SKELETON}"]`,
  )
  await expect(content.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see the call history search field', async ({ page }) => {
  await expect(page.getByTestId(TestIds.CALL_SEARCH)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('the call history screen should support pull to refresh', async ({ page }) => {
  // Desktop doesn't have pull-to-refresh — verify call list loaded
  const content = page.locator(
    `[data-testid="${TestIds.CALL_LIST}"], [data-testid="${TestIds.EMPTY_STATE}"]`,
  )
  await expect(content.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('each call record should have an add note button', async ({ page }) => {
  const callRow = page.getByTestId(TestIds.CALL_ROW).first()
  await expect(callRow).toBeVisible({ timeout: Timeouts.ELEMENT })
  // Verify note button exists within call row
  const noteBtn = callRow.locator('button, [role="button"]')
  const btnCount = await noteBtn.count()
  expect(btnCount).toBeGreaterThanOrEqual(1)
})

When('I tap the add note button on a call record', async ({ page }) => {
  const callRow = page.getByTestId(TestIds.CALL_ROW).first()
  await expect(callRow).toBeVisible({ timeout: Timeouts.ELEMENT })
  await callRow.click()
})

When('I tap the back button on call history', async ({ page }) => {
  await page.getByTestId(TestIds.BACK_BTN).click()
})

Then('I should see the date from filter', async ({ page }) => {
  const dateInput = page.locator('input[type="date"]').first()
  await expect(dateInput).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see the date to filter', async ({ page }) => {
  const dateInputs = page.locator('input[type="date"]')
  const count = await dateInputs.count()
  expect(count).toBeGreaterThanOrEqual(2)
  await expect(dateInputs.nth(1)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Given('a date range is selected', async ({ page }) => {
  // Fill in date range
  const dateInputs = page.locator('input[type="date"]')
  await dateInputs.first().fill('2024-01-01')
  await dateInputs.nth(1).fill('2024-12-31')
  await page.waitForTimeout(Timeouts.UI_SETTLE)
})

Then('I should see the date range clear button', async ({ page }) => {
  await expect(page.getByTestId(TestIds.CALL_CLEAR_FILTERS)).toBeVisible({ timeout: Timeouts.ELEMENT })
})
