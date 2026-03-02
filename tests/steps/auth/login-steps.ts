/**
 * Login screen step definitions.
 * Matches steps from: packages/test-specs/features/auth/login.feature
 */
import { expect } from '@playwright/test'
import { Given, When, Then } from '../fixtures'
import { Timeouts } from '../../helpers'

Then('I should see the app title {string}', async ({ page }, title: string) => {
  await expect(page.locator('h1', { hasText: title })).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see the hub URL input field', async ({ page }) => {
  await expect(page.locator('input[placeholder*="hub"], input[name="hubUrl"], #hub-url')).toBeVisible({
    timeout: Timeouts.ELEMENT,
  })
})

Then('I should see the nsec import input field', async ({ page }) => {
  await expect(page.locator('#nsec, input[placeholder*="nsec"]')).toBeVisible({
    timeout: Timeouts.ELEMENT,
  })
})

When('I enter {string} in the hub URL field', async ({ page }, url: string) => {
  const hubInput = page.locator('input[placeholder*="hub"], input[name="hubUrl"], #hub-url')
  await hubInput.fill(url)
})

Then('the hub URL field should contain {string}', async ({ page }, expectedValue: string) => {
  const hubInput = page.locator('input[placeholder*="hub"], input[name="hubUrl"], #hub-url')
  await expect(hubInput).toHaveValue(expectedValue)
})

When('I enter {string} in the nsec field', async ({ page }, nsec: string) => {
  await page.locator('#nsec').fill(nsec)
})

When('I enter {string} in the nsec input', async ({ page }, nsec: string) => {
  await page.locator('#nsec').fill(nsec)
})

Then('the nsec field should be a password field', async ({ page }) => {
  const nsecInput = page.locator('#nsec')
  await expect(nsecInput).toHaveAttribute('type', 'password')
})

When('I enter a valid 63-character nsec', async ({ page }) => {
  // Generate a valid nsec for testing
  const { generateSecretKey, nip19 } = await import('nostr-tools')
  const sk = generateSecretKey()
  const nsec = nip19.nsecEncode(sk)
  await page.locator('#nsec').fill(nsec)
})

Then('I should see the PIN setup screen', async ({ page }) => {
  // After importing a key, user is redirected to PIN setup
  const pinInput = page.locator('input[aria-label="PIN digit 1"]')
  await expect(pinInput).toBeVisible({ timeout: Timeouts.AUTH })
})
