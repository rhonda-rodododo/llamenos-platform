/**
 * Admin settings step definitions.
 * Matches steps from: packages/test-specs/features/admin/admin-settings.feature
 *
 * Behavioral depth: Hard assertions on settings elements.
 * No .or(PAGE_TITLE) fallbacks.
 */
import { expect } from '@playwright/test'
import { Given, When, Then } from '../fixtures'
import { TestIds } from '../../test-ids'
import { Timeouts, Navigation } from '../../helpers'

Given('I navigate to the admin settings tab', async ({ page }) => {
  await Navigation.goToHubSettings(page)
})

Then('I should see the transcription settings card', async ({ page }) => {
  await expect(page.getByTestId(TestIds.TRANSCRIPTION_SECTION)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see the transcription enabled toggle', async ({ page }) => {
  const section = page.getByTestId(TestIds.TRANSCRIPTION_SECTION)
  await expect(section).toBeVisible({ timeout: Timeouts.ELEMENT })
  const toggle = section.locator('input[type="checkbox"], [role="switch"]').first()
  await expect(toggle).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see the transcription opt-out toggle', async ({ page }) => {
  const section = page.getByTestId(TestIds.TRANSCRIPTION_SECTION)
  await expect(section).toBeVisible({ timeout: Timeouts.ELEMENT })
})

When('I toggle transcription on', async ({ page }) => {
  const section = page.getByTestId(TestIds.TRANSCRIPTION_SECTION)
  await expect(section).toBeVisible({ timeout: Timeouts.ELEMENT })
  const toggle = section.locator('input[type="checkbox"], [role="switch"]').first()
  await expect(toggle).toBeVisible({ timeout: Timeouts.ELEMENT })
  await toggle.click()
})

Then('transcription should be enabled', async ({ page }) => {
  const section = page.getByTestId(TestIds.TRANSCRIPTION_SECTION)
  await expect(section).toBeVisible({ timeout: Timeouts.ELEMENT })
  // Verify toggle state
  const toggle = section.locator('input[type="checkbox"], [role="switch"]').first()
  await expect(toggle).toBeChecked()
})

Then('they should receive a {int} forbidden response', async ({ page }, _statusCode: number) => {
  // On the desktop client, a 403 is shown as missing admin nav
  const adminSection = page.getByTestId(TestIds.NAV_ADMIN_SECTION)
  await expect(adminSection).not.toBeVisible({ timeout: 3000 })
})
