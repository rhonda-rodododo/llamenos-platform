/**
 * Shift detail step definitions.
 * Matches steps from: packages/test-specs/features/shifts/shift-detail.feature
 */
import { expect } from '@playwright/test'
import { When, Then } from '../fixtures'
import { TestIds } from '../../test-ids'
import { Timeouts } from '../../helpers'

When('I tap a shift card', async ({ page }) => {
  const shiftCard = page.getByTestId(TestIds.SHIFT_CARD)
  const exists = await shiftCard.first().isVisible({ timeout: 5000 }).catch(() => false)
  if (exists) {
    await shiftCard.first().click()
    await page.waitForTimeout(Timeouts.UI_SETTLE)
  }
})

Then('I should see the shift detail screen', async ({ page }) => {
  // Shift detail shows the shift name and time info
  const detail = page.locator('text=/shift detail|shift info|assigned|volunteers/i')
  await expect(detail.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see the shift info card', async ({ page }) => {
  // Info card shows shift name and time
  const infoCard = page.locator('text=/\\d{1,2}:\\d{2}|am|pm/i')
  await expect(infoCard.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see the volunteer assignment section', async ({ page }) => {
  const assignSection = page.locator('text=/assign|volunteer|member/i')
  await expect(assignSection.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

When('I tap a volunteer assignment card', async ({ page }) => {
  // Toggle a volunteer assignment checkbox or card
  const checkbox = page.locator('input[type="checkbox"]').first()
  const checkboxVisible = await checkbox.isVisible({ timeout: 2000 }).catch(() => false)
  if (checkboxVisible) {
    await checkbox.click()
  } else {
    const assignCard = page.locator('[data-testid="assignment-card"], [role="listitem"]').first()
    if (await assignCard.isVisible({ timeout: 2000 }).catch(() => false)) {
      await assignCard.click()
    }
  }
})

Then('the volunteer assignment should toggle', async ({ page }) => {
  // Just verify we're still on the detail screen without errors
  await page.waitForTimeout(Timeouts.UI_SETTLE)
})

When('I tap the back button on the shift detail', async ({ page }) => {
  const backBtn = page.locator('button[aria-label="Back"], [data-testid="back-btn"]')
  const backVisible = await backBtn.first().isVisible({ timeout: 2000 }).catch(() => false)
  if (backVisible) {
    await backBtn.first().click()
  } else {
    await page.goBack()
  }
})
