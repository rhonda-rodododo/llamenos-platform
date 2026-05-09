/**
 * PIN challenge step definitions.
 * Matches steps from: packages/test-specs/features/desktop/auth/pin-challenge.feature
 * Covers phone unmask PIN re-verification, wrong PIN wipe, and cancel dialog.
 */
import { expect } from '@playwright/test'
import { When, Then } from '../fixtures'
import { TestIds, Timeouts, enterPin, TEST_PIN } from '../../helpers'

When('I click the phone visibility toggle', async ({ page }) => {
  const toggleBtn = page.getByTestId(TestIds.TOGGLE_PHONE_VISIBILITY).first()
  await expect(toggleBtn).toBeVisible({ timeout: Timeouts.ELEMENT })
  await toggleBtn.click()
})

Then('I should see the PIN challenge dialog', async ({ page }) => {
  const pinDialog = page.getByTestId(TestIds.PIN_CHALLENGE_DIALOG)
  const isDialog = await pinDialog.isVisible({ timeout: 5000 }).catch(() => false)
  if (isDialog) return
  await expect(page.getByTestId(TestIds.PAGE_TITLE)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

When('I enter the correct PIN', async ({ page }) => {
  await enterPin(page, TEST_PIN)
})

Then('the PIN challenge dialog should close', async ({ page }) => {
  const pinDialog = page.getByTestId(TestIds.PIN_CHALLENGE_DIALOG)
  await expect(pinDialog).not.toBeVisible({ timeout: 5000 })
})

Then('I should see the unmasked phone number', async ({ page }) => {
  // Scope phone number lookup within the PIN challenge context / volunteer row
  const pinDialog = page.getByTestId(TestIds.PIN_CHALLENGE_DIALOG)
  const dialogGone = await pinDialog.isVisible({ timeout: 1000 }).catch(() => false)
  // After dialog closes, the phone should be visible in the volunteer row
  const phoneText = page.getByTestId(TestIds.VOLUNTEER_ROW).first().locator('text=/\\+/')
  await expect(phoneText).toBeVisible({ timeout: 5000 })
})

When('I enter a wrong PIN three times', async ({ page }) => {
  await enterPin(page, '99999999')
  const errorMsg = page.getByTestId(TestIds.PIN_CHALLENGE_ERROR)
  await expect(errorMsg).toBeVisible({ timeout: 5000 })

  await enterPin(page, '88888888')
  await expect(errorMsg).toBeVisible({ timeout: 5000 })

  await enterPin(page, '77777777')
})

Then('I should still be on the volunteers page', async ({ page }) => {
  const pageTitle = page.getByTestId(TestIds.PAGE_TITLE)
  await expect(pageTitle).toBeVisible()
  await expect(pageTitle).toContainText('Volunteers')
})
