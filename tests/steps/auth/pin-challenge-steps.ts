/**
 * PIN challenge step definitions.
 * Matches steps from: packages/test-specs/features/desktop/auth/pin-challenge.feature
 * Covers phone unmask PIN re-verification, wrong PIN wipe, and cancel dialog.
 */
import { expect } from '@playwright/test'
import { When, Then } from '../fixtures'
import { enterPin, TEST_PIN } from '../../helpers'

When('I click the phone visibility toggle', async ({ page }) => {
  const toggleBtn = page.getByTestId('toggle-phone-visibility').first()
  const hasToggle = await toggleBtn.isVisible({ timeout: 5000 }).catch(() => false)
  if (!hasToggle) {
    // No volunteers with phones — skip remaining steps
    return
  }
  await toggleBtn.click()
})

Then('I should see the PIN challenge dialog', async ({ page }) => {
  const pinDialog = page.getByTestId('pin-challenge-dialog')
  await expect(pinDialog).toBeVisible({ timeout: 5000 })
})

When('I enter the correct PIN', async ({ page }) => {
  await enterPin(page, TEST_PIN)
})

Then('the PIN challenge dialog should close', async ({ page }) => {
  const pinDialog = page.getByTestId('pin-challenge-dialog')
  await expect(pinDialog).not.toBeVisible({ timeout: 5000 })
})

Then('I should see the unmasked phone number', async ({ page }) => {
  const phoneText = page.locator('p.font-mono').first()
  await expect(phoneText).toContainText('+')
})

When('I enter a wrong PIN three times', async ({ page }) => {
  await enterPin(page, '999999')
  const errorMsg = page.getByTestId('pin-challenge-error')
  await expect(errorMsg).toBeVisible({ timeout: 5000 })

  await enterPin(page, '888888')
  await expect(errorMsg).toBeVisible({ timeout: 5000 })

  await enterPin(page, '777777')
})

Then('I should still be on the volunteers page', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Volunteers' })).toBeVisible()
})
