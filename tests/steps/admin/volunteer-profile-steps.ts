/**
 * Volunteer profile step definitions.
 * Matches steps from: packages/test-specs/features/admin/volunteer-profile.feature
 */
import { expect } from '@playwright/test'
import { When, Then } from '../fixtures'
import { TestIds } from '../../test-ids'
import { Timeouts } from '../../helpers'

When('I tap a volunteer card', async ({ page }) => {
  const volRow = page.getByTestId(TestIds.VOLUNTEER_ROW).first()
  await expect(volRow).toBeVisible({ timeout: Timeouts.ELEMENT })
  // The row (UserRow in users.tsx) always wraps the volunteer name in a <Link> —
  // there is no clickable-row-without-a-link layout, so the old isVisible/catch
  // fallback to `volRow.click()` was dead code that just raced page load.
  const nameLink = volRow.getByRole('link').first()
  await expect(nameLink).toBeVisible({ timeout: Timeouts.ELEMENT })
  await nameLink.click()
  // Wait for profile page to load
  await page.waitForURL(/\/users\/[^/]+/, { timeout: Timeouts.NAVIGATION })
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
  // users_.$pubkey.tsx always renders `back-btn` — the browser-history fallback was
  // dead code that only masked the timeout-ignoring isVisible() probe.
  const backBtn = page.getByTestId(TestIds.BACK_BTN)
  await expect(backBtn).toBeVisible({ timeout: Timeouts.ELEMENT })
  await backBtn.click()
})
