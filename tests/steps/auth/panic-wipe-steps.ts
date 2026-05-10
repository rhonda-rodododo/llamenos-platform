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
  // Panic wipe triggers navigation which may destroy the execution context;
  // wait for the new page to load before evaluating localStorage.
  await page.waitForLoadState('load')
  const count = await page.evaluate(() => localStorage.length)
  expect(count).toBe(0)
})

Then('all session storage should be cleared', async ({ page }) => {
  // Panic wipe triggers navigation which may destroy the execution context;
  // wait for the new page to load before evaluating sessionStorage.
  await page.waitForLoadState('load')
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
      localStorage.getItem('tauri-store:keys.json:llamenos-encrypted-device-keys') !== null ||
      localStorage.getItem('llamenos:llamenos-encrypted-device-keys') !== null ||
      localStorage.getItem('llamenos-encrypted-key') !== null ||
      localStorage.getItem('tauri-store:keys.json:llamenos-encrypted-key') !== null
    )
  })
  expect(hasKey).toBe(true)
})
