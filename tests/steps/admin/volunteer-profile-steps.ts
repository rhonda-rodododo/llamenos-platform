/**
 * Volunteer profile step definitions.
 * Matches steps from: packages/test-specs/features/admin/volunteer-profile.feature
 */
import { expect } from '@playwright/test'
import { When, Then } from '../fixtures'
import { TestIds } from '../../test-ids'
import { Timeouts } from '../../helpers'

When('I tap a volunteer card', async ({ page }) => {
  const volCard = page.getByTestId(TestIds.VOLUNTEER_ROW).first()
  await expect(volCard).toBeVisible({ timeout: Timeouts.ELEMENT })
  await volCard.click()
  await page.waitForTimeout(Timeouts.ASYNC_SETTLE)
})

Then('I should see the volunteer detail screen', async ({ page }) => {
  await expect(page.getByTestId(TestIds.VOLUNTEER_NAME)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see the volunteer name', async ({ page }) => {
  await expect(page.getByTestId(TestIds.VOLUNTEER_NAME)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see the volunteer pubkey', async ({ page }) => {
  await expect(page.getByTestId(TestIds.VOLUNTEER_PUBKEY)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see the volunteer role badge', async ({ page }) => {
  await expect(page.getByTestId(TestIds.VOLUNTEER_ROLE_BADGE)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see the volunteer status badge', async ({ page }) => {
  await expect(page.getByTestId(TestIds.VOLUNTEER_STATUS_BADGE)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see the volunteer join date', async ({ page }) => {
  await expect(page.getByTestId(TestIds.VOLUNTEER_JOIN_DATE)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see the recent activity card', async ({ page }) => {
  await expect(page.getByTestId(TestIds.VOLUNTEER_ACTIVITY_CARD)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

When('I tap the back button on the volunteer detail', async ({ page }) => {
  const backBtn = page.getByTestId(TestIds.BACK_BTN)
  const backVisible = await backBtn.isVisible({ timeout: 2000 }).catch(() => false)
  if (backVisible) {
    await backBtn.click()
  } else {
    await page.goBack()
  }
})
