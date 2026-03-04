/**
 * Transcription preferences step definitions.
 * Matches steps from: packages/test-specs/features/settings/transcription-preferences.feature
 *
 * Behavioral depth: Hard assertions on transcription section.
 */
import { expect } from '@playwright/test'
import { Given, When, Then } from '../fixtures'
import { TestIds } from '../../test-ids'
import { Timeouts } from '../../helpers'

Given('I expand the transcription section', async ({ page }) => {
  const section = page.getByTestId(TestIds.TRANSCRIPTION_SECTION)
  await expect(section).toBeVisible({ timeout: Timeouts.ELEMENT })
  await section.click()
})

Given('transcription opt-out is not allowed', async () => {
  // Precondition — admin has disabled opt-out; this is a config state
})

Then('I should see the transcription settings section', async ({ page }) => {
  await expect(page.getByTestId(TestIds.TRANSCRIPTION_SECTION)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see the transcription toggle', async ({ page }) => {
  const section = page.getByTestId(TestIds.TRANSCRIPTION_SECTION)
  await expect(section).toBeVisible({ timeout: Timeouts.ELEMENT })
  const toggle = section.locator('input[type="checkbox"], [role="switch"]').first()
  await expect(toggle).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see the transcription managed message', async ({ page }) => {
  const section = page.getByTestId(TestIds.TRANSCRIPTION_SECTION)
  await expect(section).toBeVisible({ timeout: Timeouts.ELEMENT })
  // When opt-out is not allowed, section should show a "managed by admin" message
  const managedText = section.getByText(/managed|disabled|admin/i)
  await expect(managedText.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})
