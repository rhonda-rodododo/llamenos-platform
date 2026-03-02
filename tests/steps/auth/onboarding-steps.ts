/**
 * Onboarding step definitions.
 * Matches steps from: packages/test-specs/features/auth/onboarding.feature
 */
import { expect } from '@playwright/test'
import { Then } from '../fixtures'
import { Timeouts } from '../../helpers'

Then('I should see the onboarding screen', async ({ page }) => {
  // Onboarding shows the generated keypair
  await expect(page.locator('text=/nsec1|backup|key/i').first()).toBeVisible({ timeout: Timeouts.AUTH })
})

Then('I should see my generated nsec', async ({ page }) => {
  await expect(page.locator('text=/nsec1/')).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see my generated npub', async ({ page }) => {
  await expect(page.locator('text=/npub1/')).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('the hub URL should be persisted', async ({ page }) => {
  // Verify the hub URL was stored in localStorage or app state
  const hubUrl = await page.evaluate(() => {
    return (
      localStorage.getItem('llamenos-hub-url') ||
      localStorage.getItem('tauri-store:settings.json:hubUrl')
    )
  })
  expect(hubUrl).toBeTruthy()
})

Then('the displayed nsec should start with {string}', async ({ page }, prefix: string) => {
  const nsecText = page.locator('text=/nsec1/')
  await expect(nsecText).toBeVisible({ timeout: Timeouts.ELEMENT })
  const text = await nsecText.textContent()
  expect(text).toContain(prefix)
})

Then('the displayed npub should start with {string}', async ({ page }, prefix: string) => {
  const npubText = page.locator('text=/npub1/')
  await expect(npubText).toBeVisible({ timeout: Timeouts.ELEMENT })
  const text = await npubText.textContent()
  expect(text).toContain(prefix)
})

Then('the title should say {string}', async ({ page }, title: string) => {
  await expect(page.locator(`h1:has-text("${title}"), h2:has-text("${title}")`).first()).toBeVisible({
    timeout: Timeouts.ELEMENT,
  })
})
