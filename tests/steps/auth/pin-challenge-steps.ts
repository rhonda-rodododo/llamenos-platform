/**
 * PIN challenge step definitions.
 * Matches steps from: packages/test-specs/features/platform/desktop/auth/pin-challenge.feature
 * Covers phone unmask PIN re-verification, wrong PIN error display, and cancel dialog.
 */
import { expect } from '@playwright/test'
import { When, Then } from '../fixtures'
import { TestIds, Timeouts, enterPin, TEST_PIN } from '../../helpers'
import { createUserViaApi, uniqueName, uniquePhone } from '../../api-helpers'
import { Navigation, VolunteerPage } from '../../pages'

When('I click the phone visibility toggle', async ({ page, backendRequest, workerHub, adminWorld }) => {
  // The Volunteers page lists the active hub's members only (#1044). This
  // scenario used to rely on whatever users other scenarios had left on the
  // server; it now brings its own hub member with a phone number to unmask.
  const phone = uniquePhone()
  const vol = await createUserViaApi(backendRequest, { name: uniqueName('PIN Unmask'), phone, hubId: workerHub })
  adminWorld.lastUserPubkey = vol.pubkey
  adminWorld.lastPhone = phone
  // Re-enter the page client-side so it refetches the list (a full reload
  // would re-lock the device key and land on the PIN sign-in screen).
  await Navigation.goToDashboard(page)
  await page.waitForURL((url) => url.pathname === '/', { timeout: Timeouts.NAVIGATION })
  await Navigation.goToVolunteers(page)
  const row = VolunteerPage.getRowById(page, vol.pubkey)
  const toggleBtn = row.getByTestId(TestIds.TOGGLE_PHONE_VISIBILITY)
  await expect(toggleBtn).toBeVisible({ timeout: Timeouts.ELEMENT })
  await toggleBtn.scrollIntoViewIfNeeded()
  await toggleBtn.click()
})

Then('I should see the PIN challenge dialog', async ({ page }) => {
  const pinDialog = page.getByTestId(TestIds.PIN_CHALLENGE_DIALOG)
  await expect(pinDialog).toBeVisible({ timeout: Timeouts.ELEMENT })
})

When('I enter the correct PIN', async ({ page }) => {
  await enterPin(page, TEST_PIN)
})

Then('the PIN challenge dialog should close', async ({ page }) => {
  const pinDialog = page.getByTestId(TestIds.PIN_CHALLENGE_DIALOG)
  await expect(pinDialog).not.toBeVisible({ timeout: 5000 })
})

Then('the PIN challenge dialog should remain open', async ({ page }) => {
  const pinDialog = page.getByTestId(TestIds.PIN_CHALLENGE_DIALOG)
  await expect(pinDialog).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see the unmasked phone number', async ({ page, adminWorld }) => {
  // After the dialog closes, that volunteer's row shows the full number
  const row = VolunteerPage.getRowById(page, adminWorld.lastUserPubkey)
  await expect(row).toContainText(adminWorld.lastPhone, { timeout: 5000 })
})

When('I enter a wrong PIN three times', async ({ page }) => {
  await enterPin(page, '99999999')
  const errorMsg = page.getByTestId(TestIds.PIN_CHALLENGE_ERROR)
  await expect(errorMsg).toBeVisible({ timeout: 5000 })

  await enterPin(page, '88888888')
  await expect(errorMsg).toBeVisible({ timeout: 5000 })

  await enterPin(page, '77777777')
  await expect(errorMsg).toBeVisible({ timeout: 5000 })
})

Then('I should see a wrong PIN error message', async ({ page }) => {
  const errorMsg = page.getByTestId(TestIds.PIN_CHALLENGE_ERROR)
  await expect(errorMsg).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should still be on the volunteers page', async ({ page }) => {
  const pageTitle = page.getByTestId(TestIds.PAGE_TITLE)
  await expect(pageTitle).toBeVisible()
  await expect(pageTitle).toContainText('Volunteers')
})
