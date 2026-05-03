/**
 * Shift detail step definitions.
 * Matches steps from: packages/test-specs/features/shifts/shift-detail.feature
 *
 * Behavioral depth: Hard assertions, no .or() fallbacks or if(visible) guards.
 */
import { expect } from '@playwright/test'
import { When, Then } from '../fixtures'
import { TestIds } from '../../test-ids'
import { Timeouts } from '../../helpers'
import { listShiftsViaApi, createShiftViaApi } from '../../api-helpers'

When('I tap a shift card', async ({ page, request }) => {
  // Ensure at least one shift exists so the tap has something to click.
  const existingShifts = await listShiftsViaApi(request).catch(() => [])
  if (existingShifts.length === 0) {
    await createShiftViaApi(request, { name: `Auto-seeded Shift ${Date.now()}` })
    // SPA-navigate away and back to refresh the shift list, avoiding a full
    // page reload (which would trigger PIN re-entry)
    await page.evaluate(() => {
      const router = (window as any).__TEST_ROUTER
      if (router) {
        router.navigate({ to: '/' })
        setTimeout(() => router.navigate({ to: '/shifts' }), 100)
      }
    })
    await page.waitForURL(/\/shifts/, { timeout: Timeouts.ELEMENT })
  }
  const shiftCard = page.getByTestId(TestIds.SHIFT_CARD).first()
  await expect(shiftCard).toBeVisible({ timeout: Timeouts.ELEMENT })
  await shiftCard.click()
})

Then('I should see the shift detail screen', async ({ page }) => {
  // Shift detail shows shift info — verify page title or shift card is visible
  await expect(page.getByTestId(TestIds.PAGE_TITLE)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see the shift info card', async ({ page }) => {
  await expect(page.getByTestId(TestIds.SHIFT_CARD).first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see the volunteer assignment section', async ({ page }) => {
  await expect(page.getByTestId(TestIds.SHIFT_VOLUNTEER_COUNT).first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

When('I tap a volunteer assignment card', async ({ page }) => {
  const checkbox = page.locator('input[type="checkbox"]').first()
  await expect(checkbox).toBeVisible({ timeout: Timeouts.ELEMENT })
  const wasBefore = await checkbox.isChecked()
  await checkbox.click()
  // Store the expected state for verification
  await page.evaluate((prev) => {
    (window as Record<string, unknown>).__test_checkbox_was = prev
  }, wasBefore)
})

Then('the volunteer assignment should toggle', async ({ page }) => {
  const checkbox = page.locator('input[type="checkbox"]').first()
  const wasBefore = (await page.evaluate(() => (window as Record<string, unknown>).__test_checkbox_was)) as boolean
  // Verify the checkbox actually toggled
  const isNow = await checkbox.isChecked()
  expect(isNow).not.toBe(wasBefore)
})

When('I tap the back button on the shift detail', async ({ page }) => {
  const backBtn = page.getByTestId(TestIds.BACK_BTN)
  await expect(backBtn).toBeVisible({ timeout: Timeouts.ELEMENT })
  await backBtn.click()
})
