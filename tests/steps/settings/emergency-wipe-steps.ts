/**
 * Emergency wipe step definitions.
 * Matches steps from: packages/test-specs/features/settings/emergency-wipe.feature
 *
 * Behavioral depth: Hard assertions, no .or(PAGE_TITLE) fallbacks.
 */
import { expect } from '@playwright/test'
import { Given, When, Then } from '../fixtures'
import { TestIds } from '../../test-ids'
import { Timeouts } from '../../helpers'

Then('I should see the emergency wipe button', async ({ page }) => {
  await expect(page.getByTestId(TestIds.EMERGENCY_WIPE_BTN)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

When('I tap the emergency wipe button', async ({ page }) => {
  await page.getByTestId(TestIds.EMERGENCY_WIPE_BTN).click()
})

Then('I should see the emergency wipe confirmation dialog', async ({ page }) => {
  await expect(page.getByTestId(TestIds.CONFIRM_DIALOG)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('the dialog should warn about permanent data loss', async ({ page }) => {
  const dialog = page.getByTestId(TestIds.CONFIRM_DIALOG)
  await expect(dialog).toBeVisible({ timeout: Timeouts.ELEMENT })
  // Dialog content should warn about permanent/irreversible action
  const warningText = dialog.getByText(/permanent|irreversible|cannot be undone|data loss/i)
  await expect(warningText.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

When('I confirm the emergency wipe', async ({ page }) => {
  await page.getByTestId(TestIds.CONFIRM_DIALOG_OK).click()
})

Then('all local data should be erased', async ({ page }) => {
  // After wipe, should show panic overlay or redirect to login
  const wipeResult = page.locator(
    `[data-testid="${TestIds.PANIC_WIPE_OVERLAY}"], [data-testid="${TestIds.LOGIN_SUBMIT_BTN}"], [data-testid="${TestIds.GO_TO_SETUP_BTN}"]`,
  )
  await expect(wipeResult.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should be returned to the login screen', async ({ page }) => {
  const loginIndicator = page.locator(
    `[data-testid="${TestIds.LOGIN_SUBMIT_BTN}"], [data-testid="${TestIds.GO_TO_SETUP_BTN}"]`,
  )
  await expect(loginIndicator.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

When('I cancel the emergency wipe', async ({ page }) => {
  await page.getByTestId(TestIds.CONFIRM_DIALOG_CANCEL).click()
})

Then('the confirmation dialog should close', async ({ page }) => {
  await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 3000 })
})

Then('I should still be on the settings screen', async ({ page }) => {
  await expect(page.getByTestId(TestIds.PAGE_TITLE)).toBeVisible({ timeout: Timeouts.ELEMENT })
  await expect(page.getByTestId(TestIds.PAGE_TITLE)).toContainText(/settings/i)
})
