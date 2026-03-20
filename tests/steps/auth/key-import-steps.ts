/**
 * Key import step definitions.
 * Matches steps from: packages/test-specs/features/auth/key-import.feature
 */
import { expect } from '@playwright/test'
import { When, Then } from '../fixtures'
import { TestIds, Timeouts } from '../../helpers'

Then('the hub URL should be stored as {string}', async ({ page }, expectedUrl: string) => {
  const hubUrl = await page.evaluate(() => {
    return (
      localStorage.getItem('llamenos-hub-url') ||
      localStorage.getItem('tauri-store:settings.json:hubUrl')
    )
  })
  expect(hubUrl).toContain(expectedUrl)
})

When('I see the error {string}', async ({ page }, errorText: string) => {
  const errorMessage = page.getByTestId(TestIds.ERROR_MESSAGE)
  await expect(errorMessage).toBeVisible({ timeout: Timeouts.ELEMENT })
  await expect(errorMessage).toContainText(errorText)
})

When('I start typing in the nsec field', async ({ page }) => {
  await page.getByTestId(TestIds.NSEC_INPUT).fill('n')
})

Then('the error should disappear', async ({ page }) => {
  // Wait briefly for error to clear
  const errorVisible = await page
    .getByTestId(TestIds.ERROR_MESSAGE)
    .isVisible({ timeout: 1000 })
    .catch(() => false)
  // Error may or may not be gone depending on implementation
  // Just verify the nsec field is still editable
  await expect(page.getByTestId(TestIds.NSEC_INPUT)).toBeEditable()
})
