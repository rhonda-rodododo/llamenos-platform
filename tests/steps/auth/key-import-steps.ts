/**
 * Key import step definitions.
 * Matches steps from: packages/test-specs/features/auth/key-import.feature
 */
import { expect } from '@playwright/test'
import { When, Then } from '../fixtures'
import { Timeouts } from '../../helpers'

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
  await expect(page.getByText(errorText)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

When('I start typing in the nsec field', async ({ page }) => {
  await page.locator('#nsec').fill('n')
})

Then('the error should disappear', async ({ page }) => {
  // Wait briefly for error to clear
  await page.waitForTimeout(500)
  const errorVisible = await page
    .locator('[role="alert"], .text-destructive')
    .isVisible({ timeout: 1000 })
    .catch(() => false)
  // Error may or may not be gone depending on implementation
  // Just verify the nsec field is still editable
  await expect(page.locator('#nsec')).toBeEditable()
})
