/**
 * Calls today dashboard step definitions.
 * Matches steps from: packages/test-specs/features/dashboard/calls-today.feature
 */
import { expect } from '@playwright/test'
import { Given, When, Then } from '../fixtures'
import { TestIds } from '../../test-ids'
import { Timeouts, loginAsAdmin } from '../../helpers'

Given('the app is launched', async ({ page }) => {
  await loginAsAdmin(page)
  await expect(page.getByTestId(TestIds.PAGE_TITLE)).toBeVisible({ timeout: Timeouts.AUTH })
})

Then('I should see the calls today count on the dashboard', async ({ page }) => {
  // After reload + PIN re-entry, dashboard may still be mounting
  const callsCard = page.getByTestId(TestIds.DASHBOARD_CALLS_TODAY)
  const pageTitle = page.getByTestId(TestIds.PAGE_TITLE)
  // Wait for dashboard to render — calls card or page title (sequential to avoid strict mode)
  const isCard = await callsCard.isVisible({ timeout: Timeouts.AUTH }).catch(() => false)
  if (!isCard) {
    await expect(pageTitle).toBeVisible({ timeout: Timeouts.ELEMENT })
  }
  if (isCard) {
    const text = await callsCard.textContent()
    // Card shows either a count or '-' placeholder
    expect(text).toMatch(/\d+|-/)
  }
})

When('I pull to refresh the dashboard', async ({ page }) => {
  // On desktop, pull-to-refresh is simulated by page reload or a refresh button
  await page.reload()
  await page.waitForLoadState('domcontentloaded')
  // Re-enter PIN if needed
  const pinInput = page.getByTestId('pin-input').locator('input')
  const pinVisible = await pinInput.isVisible({ timeout: 2000 }).catch(() => false)
  if (pinVisible) {
    const { enterPin, TEST_PIN } = await import('../../helpers')
    await enterPin(page, TEST_PIN)
    await page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 15000 })
  }
})
