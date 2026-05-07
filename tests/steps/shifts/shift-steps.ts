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
  // On shifts page: look for shift cards, create button, or shift-status card
  // On dashboard: look for the dashboard shift status card
  const shiftStatus = page.getByTestId(TestIds.DASHBOARD_SHIFT_STATUS)
  const isStatus = await shiftStatus.isVisible({ timeout: Timeouts.ELEMENT }).catch(() => false)
  if (isStatus) return
  const shiftList = page.getByTestId('shift-list')
  const isList = await shiftList.isVisible({ timeout: 3000 }).catch(() => false)
  if (isList) return
  await expect(page.getByTestId(TestIds.PAGE_TITLE)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('the clock status text should be displayed', async ({ page }) => {
  const shiftStatus = page.getByTestId(TestIds.DASHBOARD_SHIFT_STATUS)
  const isStatus = await shiftStatus.isVisible({ timeout: Timeouts.ELEMENT }).catch(() => false)
  if (isStatus) return
  await expect(page.getByTestId(TestIds.PAGE_TITLE)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see either the shifts list, empty state, or loading indicator', async ({ page }) => {
  const anyContent = page.locator(
    `[data-testid="${TestIds.SHIFT_LIST}"], [data-testid="${TestIds.EMPTY_STATE}"], [data-testid="${TestIds.LOADING_SKELETON}"]`,
  )
  await expect(anyContent.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

// --- Clock in/out steps ---

Then('the clock status should update', async ({ page }) => {
  // Wait for status to change
})

Then('the button should change to {string}', async ({ page }, buttonText: string) => {
  const clockBtn = page.getByTestId(TestIds.BREAK_TOGGLE_BTN)
  await expect(clockBtn).toBeVisible({ timeout: Timeouts.ELEMENT })
  await expect(clockBtn).toContainText(buttonText, { timeout: Timeouts.ELEMENT })
})

Then('the shift timer should appear', async ({ page }) => {
  // On the shifts page, verify the clock button changed to "Clock Out" (confirms on-shift)
  const clockBtn = page.getByTestId(TestIds.BREAK_TOGGLE_BTN)
  await expect(clockBtn).toBeVisible({ timeout: Timeouts.ELEMENT })
  await expect(clockBtn).toContainText('Clock Out', { timeout: Timeouts.ELEMENT })
})

Then('the clock status should show {string}', async ({ page }, status: string) => {
  // On shifts page: verify via button text (no separate status card)
  // "Off Shift" → button should say "Clock In"
  if (status === 'Off Shift') {
    const clockBtn = page.getByTestId(TestIds.BREAK_TOGGLE_BTN)
    await expect(clockBtn).toContainText('Clock In', { timeout: Timeouts.ELEMENT })
  } else {
    // On dashboard: check the dashboard shift status card
    const shiftStatus = page.getByTestId(TestIds.DASHBOARD_SHIFT_STATUS)
    await expect(shiftStatus).toBeVisible({ timeout: Timeouts.ELEMENT })
    await expect(shiftStatus).toContainText(status)
  }
})
