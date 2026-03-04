/**
 * Extended device linking step definitions.
 * Matches additional steps from: packages/test-specs/features/settings/device-link.feature
 * not covered by settings-steps.ts
 *
 * Behavioral depth: Hard assertions, no expect(true).toBe(true).
 */
import { expect } from '@playwright/test'
import { When, Then } from '../fixtures'
import { TestIds } from '../../test-ids'
import { Timeouts } from '../../helpers'

When('I start the device linking process', async ({ page }) => {
  await page.getByTestId(TestIds.START_LINKING).click()
  await page.waitForTimeout(Timeouts.UI_SETTLE)
})

Then('I should see a QR code displayed', async ({ page }) => {
  await expect(page.getByTestId(TestIds.PROVISIONING_QR)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see the linking progress indicator', async ({ page }) => {
  const progress = page.locator('[role="progressbar"]').or(page.getByText(/step|progress|linking|waiting/i))
  await expect(progress.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

When('I cancel the linking', async ({ page }) => {
  const cancelBtn = page.getByTestId(TestIds.FORM_CANCEL_BTN)
  await cancelBtn.click()
})

When('the provisioning room expires', async ({ page }) => {
  // Simulate a timeout via custom event
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('provisioning-timeout'))
  })
  await page.waitForTimeout(Timeouts.ASYNC_SETTLE)
})

Then('I should see a timeout error message', async ({ page }) => {
  const timeoutMsg = page.getByTestId(TestIds.ERROR_MESSAGE).or(page.getByText(/timeout|expired|timed out/i))
  await expect(timeoutMsg.first()).toBeVisible({ timeout: 5000 })
})
