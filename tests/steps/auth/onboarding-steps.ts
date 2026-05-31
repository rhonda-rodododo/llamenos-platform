/**
 * Onboarding step definitions.
 * Matches steps from: packages/test-specs/features/auth/onboarding.feature
 */
import { expect } from '@playwright/test'
import { Then } from '../fixtures'
import { TestIds, Timeouts } from '../../helpers'

Then('I should see the onboarding screen', async ({ page }) => {
  // Onboarding shows the generated keypair — recovery key content is a valid content assertion
  await expect(page.locator('text=/backup|key|recovery/i').first()).toBeVisible({ timeout: Timeouts.AUTH })
})

Then('I should see my generated signing key', async ({ page }) => {
  // V3: signing key is hex, not bech32 nsec1
  await expect(page.locator('text=/[0-9a-f]{16}/').first()).toBeVisible({ timeout: Timeouts.ELEMENT })
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

Then('the displayed signing key should start with {string}', async ({ page }, prefix: string) => {
  // V3: signing key is hex, not bech32
  const keyText = page.locator('text=/[0-9a-f]{16}/').first()
  await expect(keyText).toBeVisible({ timeout: Timeouts.ELEMENT })
  const text = await keyText.textContent()
  expect(text).toContain(prefix)
})

Then('the displayed npub should start with {string}', async ({ page }, prefix: string) => {
  // npub display is a content assertion — text matcher is appropriate here
  const npubText = page.locator('text=/npub1/')
  await expect(npubText).toBeVisible({ timeout: Timeouts.ELEMENT })
  const text = await npubText.textContent()
  expect(text).toContain(prefix)
})

Then('the title should say {string}', async ({ page }, title: string) => {
  const pageTitle = page.getByTestId(TestIds.PAGE_TITLE)
  await expect(pageTitle).toBeVisible({ timeout: Timeouts.ELEMENT })
  await expect(pageTitle).toContainText(title)
})
