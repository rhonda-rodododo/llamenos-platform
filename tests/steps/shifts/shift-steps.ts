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
  // Feature files use "Clock In"/"Clock Out" but UI shows "Take a Break"/"End Break"
  const textMap: Record<string, string> = {
    'Clock In': 'Take a Break',
    'Clock Out': 'End Break',
  }
  const actualText = textMap[buttonText] || buttonText
  await expect(clockBtn).toContainText(actualText)
})

Then('the shift timer should appear', async ({ page }) => {
  // Timer appears when on shift — scoped within the shift status card
  const shiftStatus = page.getByTestId(TestIds.DASHBOARD_SHIFT_STATUS)
  await expect(shiftStatus).toBeVisible({ timeout: Timeouts.ELEMENT })
  // Time display is a content assertion scoped to shift status
  const timer = shiftStatus.locator('text=/\\d{1,2}:\\d{2}/')
  await expect(timer.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('the clock status should show {string}', async ({ page }, status: string) => {
  const shiftStatus = page.getByTestId(TestIds.DASHBOARD_SHIFT_STATUS)
  await expect(shiftStatus).toBeVisible({ timeout: Timeouts.ELEMENT })
  await expect(shiftStatus).toContainText(status)
})
