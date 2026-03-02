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
  const count = await page.evaluate(() => localStorage.length)
  expect(count).toBe(0)
})

Then('all session storage should be cleared', async ({ page }) => {
  const count = await page.evaluate(() => sessionStorage.length)
  expect(count).toBe(0)
})

When('I press Escape twice then wait over one second', async ({ page }) => {
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(1200)
})

When('I press Escape once more', async ({ page }) => {
  await page.keyboard.press('Escape')
})

Then('the encrypted key should still be in storage', async ({ page }) => {
  const hasKey = await page.evaluate(() => {
    return (
      localStorage.getItem('llamenos-encrypted-key') !== null ||
      localStorage.getItem('tauri-store:keys.json:llamenos-encrypted-key') !== null
    )
  })
  expect(hasKey).toBe(true)
})
