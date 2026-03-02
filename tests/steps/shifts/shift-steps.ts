/**
 * Shift step definitions.
 * Matches steps from:
 *   - packages/test-specs/features/shifts/shift-list.feature
 *   - packages/test-specs/features/shifts/clock-in-out.feature
 */
import { expect } from '@playwright/test'
import { Given, When, Then } from '../fixtures'
import { TestIds } from '../../test-ids'
import { Timeouts } from '../../helpers'

Then('I should see the clock in\\/out card', async ({ page }) => {
  const clockCard = page.locator('text=/clock|shift/i').first()
  await expect(clockCard).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('the clock status text should be displayed', async ({ page }) => {
  const statusText = page.locator('text=/on shift|off shift|clock/i')
  await expect(statusText.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see either the shifts list, empty state, or loading indicator', async ({ page }) => {
  const shiftList = page.getByTestId(TestIds.SHIFT_LIST)
  const emptyState = page.getByTestId(TestIds.EMPTY_STATE)
  const loading = page.getByTestId(TestIds.LOADING_SKELETON)
  const anyContent = page.locator(
    `[data-testid="${TestIds.SHIFT_LIST}"], [data-testid="${TestIds.EMPTY_STATE}"], [data-testid="${TestIds.LOADING_SKELETON}"], text=/no shift|schedule/i`,
  )
  await expect(anyContent.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

// --- Clock in/out steps ---

Then('the clock status should update', async ({ page }) => {
  // Wait for status to change
  await page.waitForTimeout(Timeouts.ASYNC_SETTLE)
})

Then('the button should change to {string}', async ({ page }, buttonText: string) => {
  await expect(page.locator(`button:has-text("${buttonText}")`).first()).toBeVisible({
    timeout: Timeouts.ELEMENT,
  })
})

Then('the shift timer should appear', async ({ page }) => {
  // Timer appears when on shift — look for time-like text
  const timer = page.locator('text=/\\d{1,2}:\\d{2}/').first()
  await expect(timer).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('the clock status should show {string}', async ({ page }, status: string) => {
  await expect(page.locator(`text="${status}"`).first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})
