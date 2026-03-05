/**
 * Extended WebRTC settings step definitions.
 * Matches additional steps from: packages/test-specs/features/desktop/settings/webrtc-settings.feature
 * not covered by desktop-admin-steps.ts or interaction-steps.ts
 *
 * Reused from common steps:
 *   - "I expand the {string} section" (interaction-steps.ts)
 *   - "I should see/not see {string}" (interaction-steps.ts)
 *   - "I should see a success message" (interaction-steps.ts)
 *   - "I click {string}" (interaction-steps.ts)
 *   - "I reload and re-authenticate" (interaction-steps.ts)
 *   - "I navigate to the {string} page" (navigation-steps.ts)
 *   - "I navigate to {string}" (navigation-steps.ts)
 */
import { expect } from '@playwright/test'
import { When, Then } from '../fixtures'
import { TestIds } from '../../test-ids'

Then('the {string} option should be selected', async ({ page }, optionText: string) => {
  const option = page.locator('button').filter({ hasText: optionText })
  await expect(option).toHaveClass(/border-primary/)
})

Then('I should see a message that browser calling is not available', async ({ page }) => {
  await expect(page.getByText(/browser calling is not available/i)).toBeVisible()
})

Then('the {string} option should be disabled', async ({ page }, optionText: string) => {
  const option = page.locator('button').filter({ hasText: optionText })
  await expect(option).toBeDisabled()
})

When('I enable the WebRTC toggle', async ({ page }) => {
  const webrtcSection = page.locator('[data-settings-section]').filter({ hasText: /WebRTC/ })
    .or(page.locator('div').filter({ hasText: /WebRTC Configuration/ }).filter({ has: page.getByRole('switch') }).last())
  const toggle = webrtcSection.getByRole('switch')
  await toggle.click()
})

When('I switch the provider to {string}', async ({ page }, provider: string) => {
  const select = page.locator('select').first()
  await select.selectOption(provider)
})

When('I fill in Twilio credentials with WebRTC config', async ({ page }) => {
  await page.getByTestId(TestIds.ACCOUNT_SID).fill('ACwebrtctest123')
  await page.getByTestId(TestIds.AUTH_TOKEN).fill('webrtc-auth-token')

  // Enable WebRTC
  const webrtcSection = page.locator('[data-settings-section]').filter({ hasText: /WebRTC/ })
    .or(page.locator('div').filter({ hasText: /WebRTC Configuration/ }).filter({ has: page.getByRole('switch') }).last())
  const toggle = webrtcSection.getByRole('switch')
  await toggle.click()

  await page.getByTestId(TestIds.API_KEY_SID).fill('SKtestkey123')
  await page.getByTestId(TestIds.TWIML_APP_SID).fill('APtestapp456')
})

Then('the WebRTC API key fields should be populated', async ({ page }) => {
  await expect(page.getByTestId(TestIds.API_KEY_SID)).toHaveValue('SKtestkey123')
  await expect(page.getByTestId(TestIds.TWIML_APP_SID)).toHaveValue('APtestapp456')
})
