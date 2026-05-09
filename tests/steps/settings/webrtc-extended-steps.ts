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
  // The WebRTC toggle is within the telephony-provider settings section
  const telephonySection = page.getByTestId(TestIds.TELEPHONY_PROVIDER)
  const hasSect = await telephonySection.isVisible({ timeout: 5000 }).catch(() => false)
  if (hasSect) {
    const toggle = telephonySection.getByRole('switch').first()
    const hasToggle = await toggle.isVisible({ timeout: 3000 }).catch(() => false)
    if (hasToggle) {
      await toggle.click()
      return
    }
  }
  // Fallback: try label-based lookup
  const labelToggle = page.getByLabel(/webrtc|browser calling/i).first()
  const hasLabel = await labelToggle.isVisible({ timeout: 3000 }).catch(() => false)
  if (hasLabel) {
    await labelToggle.click()
  }
})

When('I switch the provider to {string}', async ({ page }, provider: string) => {
  const select = page.locator('select').first()
  await select.selectOption(provider)
})

When('I fill in Twilio credentials with WebRTC config', async ({ page }) => {
  // Fill Account SID (may use placeholder or testid)
  const sidInput = page.getByTestId(TestIds.ACCOUNT_SID)
  if (await sidInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await sidInput.fill('ACwebrtctest123')
  }
  const tokenInput = page.getByTestId(TestIds.AUTH_TOKEN)
  if (await tokenInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await tokenInput.fill('webrtc-auth-token')
  }

  // Fill provider phone number (required for save button to be enabled)
  const phoneInput = page.locator('input[type="tel"]').first()
  if (await phoneInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await phoneInput.fill('+12121234567')
    await phoneInput.blur()
  }

  // Enable WebRTC toggle
  const telephonySection = page.getByTestId(TestIds.TELEPHONY_PROVIDER)
  const hasSect = await telephonySection.isVisible({ timeout: 3000 }).catch(() => false)
  if (hasSect) {
    const toggle = telephonySection.getByRole('switch').first()
    const hasToggle = await toggle.isVisible({ timeout: 3000 }).catch(() => false)
    if (hasToggle) await toggle.click()
  }

  const apiKeySid = page.getByTestId(TestIds.API_KEY_SID)
  if (await apiKeySid.isVisible({ timeout: 3000 }).catch(() => false)) {
    await apiKeySid.fill('SKtestkey123')
  }
  const twimlSid = page.getByTestId(TestIds.TWIML_APP_SID)
  if (await twimlSid.isVisible({ timeout: 3000 }).catch(() => false)) {
    await twimlSid.fill('APtestapp456')
  }
})

Then('the WebRTC API key fields should be populated', async ({ page }) => {
  await expect(page.getByTestId(TestIds.API_KEY_SID)).toHaveValue('SKtestkey123')
  await expect(page.getByTestId(TestIds.TWIML_APP_SID)).toHaveValue('APtestapp456')
})
