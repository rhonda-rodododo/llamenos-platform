/**
 * Login restore step definitions.
 * Matches steps from: packages/test-specs/features/desktop/auth/login-restore.feature
 * Covers fresh install view (nsec input, backup upload, errors),
 * stored key view (PIN input, recovery options),
 * and common login elements (language selector, theme toggles, security note).
 */
import { expect } from '@playwright/test'
import { Given, Then } from '../fixtures'
import { TestIds } from '../../test-ids'
import { Timeouts } from '../../helpers'

// --- Stored key setup ---

Given('I have a stored encrypted key', async ({ page }) => {
  await page.goto('/login')
  // Inject a fake encrypted key blob to trigger the PIN entry UI.
  // The Tauri store mock uses prefix `tauri-store:keys.json:` + STORE_KEY `llamenos-encrypted-device-keys`.
  await page.evaluate(() => {
    const data = JSON.stringify({
      salt: 'aa'.repeat(16),
      iterations: 600000,
      nonce: 'bb'.repeat(24),
      ciphertext: 'cc'.repeat(32),
      state: { signingPubkeyHex: 'dd'.repeat(32) },
    })
    // Stronghold mock stores as number[] (TextEncoder output), matching
    // the MockStrongholdStore.insert() format used by platform.ts getSecureStore()
    const encoded = Array.from(new TextEncoder().encode(data))
    localStorage.setItem('stronghold:llamenos:llamenos-encrypted-device-keys', JSON.stringify(encoded))
  })
})

// "I visit the login page" is defined in navigation-steps.ts
// For stored key tests, we need the page to reload after injecting the key
// The feature file uses "When I visit the login page" which is already defined

// --- Fresh install assertions ---

Then('I should see the backup file upload area', async ({ page }) => {
  await expect(page.locator('input[type="file"][accept=".json"]')).toBeAttached()
  // Keep as content assertion — this is verifying user-facing text for the upload area
  await expect(page.getByText(/select backup file/i)).toBeVisible()
})

// --- Stored key assertions ---

Then('I should see the PIN digit inputs', async ({ page }) => {
  // Login page does NOT have data-testid="page-title" — check for PIN input directly
  await expect(page.getByTestId(TestIds.PIN_INPUT)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

// --- Common elements ---

Then('I should see the language selector', async ({ page }) => {
  await expect(page.getByRole('combobox', { name: /switch to/i })).toBeVisible()
})

Then('I should see the theme toggle buttons', async ({ page }) => {
  // Fresh install has data-testid on theme buttons, stored key login does not.
  // Check for either testid-based or aria-label-based buttons — sequentially to avoid strict mode.
  const systemTestId = page.getByTestId(TestIds.THEME_SYSTEM)
  if (await systemTestId.isVisible({ timeout: Timeouts.ELEMENT }).catch(() => false)) {
    // TestId-based buttons exist — verify all three
    await expect(page.getByTestId(TestIds.THEME_LIGHT)).toBeVisible({ timeout: 2000 })
    await expect(page.getByTestId(TestIds.THEME_DARK)).toBeVisible({ timeout: 2000 })
    return
  }
  // Fallback to aria-label-based buttons
  await expect(page.locator('button[aria-label*="system" i], button[title*="system" i]').first()).toBeVisible({ timeout: 2000 })
  await expect(page.locator('button[aria-label*="light" i], button[title*="light" i]').first()).toBeVisible({ timeout: 2000 })
  await expect(page.locator('button[aria-label*="dark" i], button[title*="dark" i]').first()).toBeVisible({ timeout: 2000 })
})
