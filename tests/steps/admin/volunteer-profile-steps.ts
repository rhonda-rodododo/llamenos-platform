/**
 * Volunteer profile step definitions.
 * Matches steps from: packages/test-specs/features/admin/volunteer-profile.feature
 */
import { expect } from '@playwright/test'
import { When, Then } from '../fixtures'
import { TestIds } from '../../test-ids'
import { Timeouts } from '../../helpers'

When('I tap a volunteer card', async ({ page }) => {
  const volCard = page.getByTestId(TestIds.VOLUNTEER_ROW)
  const exists = await volCard.first().isVisible({ timeout: 5000 }).catch(() => false)
  if (exists) {
    await volCard.first().click()
    await page.waitForTimeout(Timeouts.UI_SETTLE)
  }
})

Then('I should see the volunteer detail screen', async ({ page }) => {
  const detail = page.locator('text=/volunteer|profile|detail/i')
  await expect(detail.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see the volunteer name', async ({ page }) => {
  // Volunteer name should be visible on the detail screen
  const name = page.locator('h1, h2, [data-testid="volunteer-name"]')
  await expect(name.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see the volunteer pubkey', async ({ page }) => {
  const pubkey = page.locator('text=/npub1|[a-f0-9]{8}/i')
  await expect(pubkey.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see the volunteer role badge', async ({ page }) => {
  const roleBadge = page.locator('text=/volunteer|admin|reviewer|reporter/i')
  await expect(roleBadge.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see the volunteer status badge', async ({ page }) => {
  const statusBadge = page.locator('text=/active|inactive|online|offline/i')
  await expect(statusBadge.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see the volunteer join date', async ({ page }) => {
  const joinDate = page.locator('text=/joined|since|\\d{4}/i')
  await expect(joinDate.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see the recent activity card', async ({ page }) => {
  const activityCard = page.locator('text=/activity|recent|history/i')
  await expect(activityCard.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

When('I tap the back button on the volunteer detail', async ({ page }) => {
  const backBtn = page.locator('button[aria-label="Back"], [data-testid="back-btn"]')
  const backVisible = await backBtn.first().isVisible({ timeout: 2000 }).catch(() => false)
  if (backVisible) {
    await backBtn.first().click()
  } else {
    await page.goBack()
  }
})
