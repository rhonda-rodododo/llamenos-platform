/**
 * Calls today dashboard step definitions.
 * Matches steps from: packages/test-specs/features/dashboard/calls-today.feature
 */
import { expect } from '@playwright/test'
import { Given, When, Then } from '../fixtures'
import { Timeouts, loginAsAdmin } from '../../helpers'

Given('the app is launched', async ({ page }) => {
  await loginAsAdmin(page)
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: Timeouts.AUTH })
})

Then('I should see the calls today count on the dashboard', async ({ page }) => {
  // The calls today count is displayed as a numeric value on the dashboard
  const callsCard = page.locator('text=/call/i').first()
  await expect(callsCard).toBeVisible({ timeout: Timeouts.ELEMENT })
  // Should have a numeric count
  await expect(page.locator('text=/\\d+/').first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

When('I pull to refresh the dashboard', async ({ page }) => {
  // On desktop, pull-to-refresh is simulated by page reload or a refresh button
  await page.reload()
  await page.waitForLoadState('domcontentloaded')
  // Re-enter PIN if needed
  const pinInput = page.locator('input[aria-label="PIN digit 1"]')
  const pinVisible = await pinInput.isVisible({ timeout: 2000 }).catch(() => false)
  if (pinVisible) {
    const { enterPin, TEST_PIN } = await import('../../helpers')
    await enterPin(page, TEST_PIN)
    await page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 15000 })
  }
})
