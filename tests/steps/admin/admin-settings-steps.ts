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
import { Timeouts, Navigation, navigateAfterLogin } from '../../helpers'
import { getTranscriptionSettingsViaApi } from '../../api-helpers'
import { expandSettingsSection } from '../common/ui-helpers'

Given('I navigate to the admin settings tab', async ({ page }) => {
  await Navigation.goToHubSettings(page)
})

Given('I navigate to the admin {string} section', async ({ page }, section: string) => {
  await navigateAfterLogin(page, `/admin/${section}`)
})

Then('I should see the transcription settings card', async ({ page }) => {
  await expect(page.getByTestId(TestIds.TRANSCRIPTION_SECTION)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see the transcription enabled toggle', async ({ page }) => {
  const section = await expandSettingsSection(page, TestIds.TRANSCRIPTION_SECTION)
  await expect(section.getByTestId('transcription-enabled-switch')).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see the transcription opt-out toggle', async ({ page }) => {
  const section = await expandSettingsSection(page, TestIds.TRANSCRIPTION_SECTION)
  await expect(section.getByTestId('transcription-optout-switch')).toBeVisible({ timeout: Timeouts.ELEMENT })
})

When('I toggle transcription on', async ({ page }) => {
  const section = await expandSettingsSection(page, TestIds.TRANSCRIPTION_SECTION)
  const toggle = section.getByTestId('transcription-enabled-switch')
  await expect(toggle).toBeVisible({ timeout: Timeouts.ELEMENT })
  // The admin settings page renders only after every settings request has settled, so
  // the switch already reflects the server state here. "Toggle on" is idempotent:
  // clicking an already-enabled switch would turn transcription OFF.
  if ((await toggle.getAttribute('aria-checked')) === 'true') return
  await toggle.click()
  const dialog = page.getByTestId(TestIds.CONFIRM_DIALOG)
  await expect(dialog).toBeVisible({ timeout: Timeouts.ELEMENT })
  const saved = page.waitForResponse(
    res => res.url().includes('/settings/transcription') && res.request().method() !== 'GET',
  )
  await dialog.getByTestId(TestIds.CONFIRM_DIALOG_OK).click()
  expect((await saved).ok(), 'transcription settings update succeeded').toBe(true)
})

Then('transcription should be enabled', async ({ page, backendRequest }) => {
  const section = page.getByTestId(TestIds.TRANSCRIPTION_SECTION)
  await expect(section.getByTestId('transcription-enabled-switch')).toBeChecked({ timeout: Timeouts.ELEMENT })
  const settings = await getTranscriptionSettingsViaApi(backendRequest)
  expect(settings.globalEnabled).toBe(true)
})

Then('they should receive a {int} forbidden response', async ({ rolesWorld }, statusCode: number) => {
  // The preceding When step made the API call and recorded its status.
  expect(rolesWorld.lastEndpointStatus).toBe(statusCode)
})
