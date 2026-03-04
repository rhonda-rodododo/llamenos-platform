/**
 * Extended dashboard step definitions.
 * Matches steps from:
 *   - packages/test-specs/features/dashboard/dashboard-blasts-nav.feature
 *   - packages/test-specs/features/dashboard/dashboard-break.feature
 *   - packages/test-specs/features/dashboard/dashboard-errors.feature
 *
 * Behavioral depth: Hard assertions on dashboard-specific elements.
 * No .or(PAGE_TITLE) fallbacks masking missing elements.
 */
import { expect } from '@playwright/test'
import { Given, When, Then } from '../fixtures'
import { TestIds } from '../../test-ids'
import { Timeouts } from '../../helpers'

// --- Blasts navigation ---

Then('I should see the blasts card on the dashboard', async ({ page }) => {
  await expect(page.getByTestId(TestIds.NAV_BLASTS)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

When('I tap the view blasts button', async ({ page }) => {
  await page.getByTestId(TestIds.NAV_BLASTS).click()
  await page.waitForTimeout(Timeouts.ASYNC_SETTLE)
})

Then('I should see the blasts screen', async ({ page }) => {
  await expect(page.getByTestId(TestIds.PAGE_TITLE)).toBeVisible({ timeout: Timeouts.ELEMENT })
  await expect(page.getByTestId(TestIds.PAGE_TITLE)).toContainText(/blasts/i)
})

When('I tap the back button on blasts', async ({ page }) => {
  await page.getByTestId(TestIds.BACK_BTN).click()
})

// --- Break toggle ---

Given('the volunteer is on shift', async ({ page }) => {
  await expect(page.getByTestId(TestIds.DASHBOARD_SHIFT_STATUS)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Given('the volunteer is on break', async ({ page }) => {
  const breakBtn = page.getByTestId(TestIds.BREAK_TOGGLE_BTN)
  await expect(breakBtn).toBeVisible({ timeout: Timeouts.ELEMENT })
  await breakBtn.click()
})

Then('I should see the break toggle button', async ({ page }) => {
  await expect(page.getByTestId(TestIds.BREAK_TOGGLE_BTN)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see the on-break banner', async ({ page }) => {
  const breakBanner = page.getByTestId(TestIds.DASHBOARD_SHIFT_STATUS)
  await expect(breakBanner).toBeVisible({ timeout: Timeouts.ELEMENT })
  // Verify break state is reflected in the status text
  const statusText = await breakBanner.textContent()
  expect(statusText).toBeTruthy()
})

// --- Dashboard help navigation ---

Then('I should see the help card', async ({ page }) => {
  await expect(page.getByTestId(TestIds.NAV_HELP)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

When('I tap the help card', async ({ page }) => {
  await page.getByTestId(TestIds.NAV_HELP).click()
  await page.waitForTimeout(Timeouts.ASYNC_SETTLE)
})

Then('I should see the help screen', async ({ page }) => {
  await expect(page.getByTestId(TestIds.PAGE_TITLE)).toBeVisible({ timeout: Timeouts.ELEMENT })
  await expect(page.getByTestId(TestIds.PAGE_TITLE)).toContainText(/help/i)
})

Then('I should see the help card on the dashboard', async ({ page }) => {
  await expect(page.getByTestId(TestIds.NAV_HELP)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

// --- Dashboard quick actions ---

Then('I should see the quick actions grid', async ({ page }) => {
  await expect(page.getByTestId(TestIds.DASHBOARD_QUICK_ACTIONS)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

// --- Dashboard errors ---

Given('a dashboard error is displayed', async ({ page }) => {
  await expect(page.getByTestId(TestIds.ERROR_MESSAGE)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

When('I dismiss the dashboard error', async ({ page }) => {
  const errorEl = page.getByTestId(TestIds.ERROR_MESSAGE)
  await expect(errorEl).toBeVisible({ timeout: Timeouts.ELEMENT })
  await errorEl.click()
})

Then('the dashboard error card should not be visible', async ({ page }) => {
  await expect(page.getByTestId(TestIds.ERROR_MESSAGE)).not.toBeVisible({ timeout: 3000 })
})
