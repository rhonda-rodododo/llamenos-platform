/**
 * Extended telephony provider step definitions.
 * Matches additional steps from: packages/test-specs/features/desktop/calls/telephony-provider.feature
 * not covered by desktop-admin-steps.ts
 */
import { expect } from '@playwright/test'
import { When, Then } from '../fixtures'
import { Timeouts } from '../../helpers'

Then('the provider dropdown should have {int} options', async ({ page }, count: number) => {
  const select = page.locator('select').first()
  await expect(select).toBeVisible()
  const options = select.locator('option')
  await expect(options).toHaveCount(count)
})

Then(
  'the provider options should be Twilio, SignalWire, Vonage, Plivo, and Asterisk',
  async ({ page }) => {
    const select = page.locator('select').first()
    const options = select.locator('option')
    await expect(options.nth(0)).toHaveText('Twilio')
    await expect(options.nth(1)).toHaveText('SignalWire')
    await expect(options.nth(2)).toHaveText('Vonage')
    await expect(options.nth(3)).toHaveText('Plivo')
    await expect(options.nth(4)).toHaveText(/Asterisk/)
  },
)

// "the {string} button should be disabled" is defined in interaction-steps.ts

When('I fill in Twilio credentials with phone number', async ({ page }) => {
  await page.locator('input[type="tel"]').fill('+15551234567')
  await page.getByPlaceholder('AC...').fill('AC1234567890abcdef')
  const authTokenInput = page.locator('input[type="password"]').first()
  await authTokenInput.fill('test-auth-token-123')
})

Then('I should see {string} with {string}', async ({ page }, text1: string, text2: string) => {
  await expect(
    page.locator(`text=/${text1}.*${text2}|${text2}.*${text1}/i`).first(),
  ).toBeVisible({ timeout: Timeouts.ELEMENT })
})

When('I fill in Twilio credentials with a different phone number', async ({ page }) => {
  await page.locator('input[type="tel"]').fill('+15559876543')
  await page.getByPlaceholder('AC...').fill('AC9876543210abcdef')
  const authTokenInput = page.locator('input[type="password"]').first()
  await authTokenInput.fill('test-auth-token-456')
})

Then('the phone number field should be pre-filled', async ({ page }) => {
  await expect(page.locator('input[type="tel"]')).toHaveValue(/555\s*987\s*6543/)
})

Then('the Account SID field should be pre-filled', async ({ page }) => {
  await expect(page.getByPlaceholder('AC...')).toHaveValue('AC9876543210abcdef')
})

When('I fill in SignalWire credentials', async ({ page }) => {
  await page.locator('input[type="tel"]').fill('+15551112222')
  await page.getByPlaceholder('AC...').fill('SW-project-id-123')
  const authTokenInput = page.locator('input[type="password"]').first()
  await authTokenInput.fill('sw-auth-token-789')
  await page.getByPlaceholder('myspace').fill('myhotline')
})

When('I fill in fake Twilio credentials', async ({ page }) => {
  await page.locator('input[type="tel"]').fill('+15551234567')
  await page.getByPlaceholder('AC...').fill('ACfake123')
  const authTokenInput = page.locator('input[type="password"]').first()
  await authTokenInput.fill('fake-token')
})

Then('the provider dropdown should be visible', async ({ page }) => {
  await expect(page.locator('select').first()).toBeVisible({ timeout: 10000 })
})
