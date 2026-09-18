/**
 * Volunteer profile step definitions.
 * Matches steps from: packages/test-specs/features/admin/volunteer-profile.feature
 */
import { expect } from '@playwright/test'
import { When, Then } from '../fixtures'
import { TestIds } from '../../test-ids'
import { Timeouts } from '../../helpers'

When('I tap a volunteer card', async ({ page }) => {
  // Any volunteer card will do ("a volunteer card"), but the step must land on THAT
  // volunteer's profile. The row (UserRow in users.tsx) always renders the name link, so
  // the old isVisible/catch fallback to `volRow.click()` was dead code that raced load.
  const volRow = page.getByTestId(TestIds.VOLUNTEER_ROW).first()
  await expect(volRow).toBeVisible({ timeout: Timeouts.ELEMENT })
  const volunteerId = await volRow.getAttribute('data-volunteer-id')
  expect(volunteerId, 'volunteer row carries data-volunteer-id').toBeTruthy()
  const nameLink = volRow.getByTestId(TestIds.VOLUNTEER_ROW_NAME_LINK)
  await expect(nameLink).toBeVisible({ timeout: Timeouts.ELEMENT })
  await nameLink.click()
  await page.waitForURL(new RegExp(`/users/${volunteerId}[0-9a-f]*(?:[?#]|$)`), { timeout: Timeouts.NAVIGATION })
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
