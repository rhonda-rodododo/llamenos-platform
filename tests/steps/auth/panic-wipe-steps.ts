/**
 * Panic wipe step definitions.
 * Matches steps from: packages/test-specs/features/auth/panic-wipe.feature
 */
import { expect } from '@playwright/test'
import { When, Then } from '../fixtures'
import { TestIds } from '../../test-ids'
import { Timeouts } from '../../helpers'

When('I press Escape three times quickly', async ({ page }) => {
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
})

Then('the panic wipe overlay should appear', async ({ page }) => {
  await expect(page.getByTestId(TestIds.PANIC_WIPE_OVERLAY)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('all local storage should be cleared', async ({ page }) => {
  // Panic wipe clears storage and navigates to /login, potentially triggering
  // multiple navigations (SPA redirect chain). Wait for the URL to settle on
  // the login page, then wait for networkidle to ensure no further navigations.
  await page.waitForURL(/\/login/, { timeout: Timeouts.ELEMENT })
  await page.waitForLoadState('networkidle').catch(() => {})
  const count = await page.evaluate(() => localStorage.length)
  expect(count).toBe(0)
})

Then('all session storage should be cleared', async ({ page }) => {
  // Same as above — wait for the navigation chain to settle before evaluating.
  await page.waitForURL(/\/login/, { timeout: Timeouts.ELEMENT })
  await page.waitForLoadState('networkidle').catch(() => {})
  const count = await page.evaluate(() => sessionStorage.length)
  expect(count).toBe(0)
})

When('I press Escape twice then wait over one second', async ({ page }) => {
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  // Wait >1 second so the panic wipe window expires before the next Escape.
  // Use 2s in CI to account for event loop lag under heavy parallel load.
  await page.waitForTimeout(2000)
})

When('I press Escape once more', async ({ page }) => {
  await page.keyboard.press('Escape')
})

Then('the encrypted key should still be in storage', async ({ page }) => {
  const hasKey = await page.evaluate(() => {
    return (
      localStorage.getItem('stronghold:llamenos:llamenos-encrypted-device-keys') !== null ||
      localStorage.getItem('llamenos:llamenos-encrypted-device-keys') !== null
    )
  })
  expect(hasKey).toBe(true)
})
