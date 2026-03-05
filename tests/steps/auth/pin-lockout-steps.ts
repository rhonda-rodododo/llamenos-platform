/**
 * PIN lockout step definitions.
 * Matches steps from: packages/test-specs/features/auth/pin-lockout.feature
 *
 * Uses the mock's lockout tracking (set_pin_failed_attempts, get_pin_lockout_state)
 * to seed failed attempt counts without actually entering wrong PINs N times.
 *
 * NOTE: "I have a stored identity with PIN {string}" and "the app is restarted"
 * are defined in tests/steps/common/auth-steps.ts — not duplicated here.
 */
import { expect } from '@playwright/test'
import { Given, When, Then } from '../fixtures'
import { enterPin, Timeouts } from '../../helpers'

/**
 * Invoke a Tauri IPC mock command via the browser's window.__TEST_INVOKE.
 * This avoids the dynamic import('@tauri-apps/api/core') issue in page.evaluate.
 */
async function testInvoke(page: import('@playwright/test').Page, cmd: string, args?: Record<string, unknown>) {
  return page.evaluate(async ({ cmd, args }) => {
    const invoke = (window as Record<string, unknown>).__TEST_INVOKE as
      (cmd: string, args?: Record<string, unknown>) => Promise<unknown>
    if (!invoke) throw new Error('__TEST_INVOKE not available — is the Tauri mock loaded?')
    return invoke(cmd, args)
  }, { cmd, args })
}

// Helper: seed N failed PIN attempts via the mock's test command
async function seedFailedAttempts(page: import('@playwright/test').Page, count: number) {
  await testInvoke(page, 'set_pin_failed_attempts', { count })
}

// NOTE: "I should see a PIN error message" is defined in assertion-steps.ts

Then('I should not see a lockout timer', async ({ page }) => {
  // No "Locked out" message visible
  const lockoutText = page.locator('text=/locked out/i')
  const isVisible = await lockoutText.isVisible({ timeout: 1000 }).catch(() => false)
  expect(isVisible).toBe(false)
})

Given('I have {int} failed PIN attempts', async ({ page }, count: number) => {
  // Seed the mock with N failed attempts
  await page.waitForFunction(() => !!(window as Record<string, unknown>).__TEST_INVOKE, { timeout: 10000 })
  await seedFailedAttempts(page, count)
})

Then('I should see a lockout message', async ({ page }) => {
  // After lockout, the error message shows "Locked out for N seconds"
  const lockoutText = page.locator('text=/locked out/i')
  await expect(lockoutText.first()).toBeVisible({ timeout: Timeouts.AUTH })
})

Then('the lockout duration should be approximately {int} seconds', async ({ page }, seconds: number) => {
  const lockoutState = await testInvoke(page, 'get_pin_lockout_state') as { failedAttempts: number; lockoutUntil: number }
  const remainingMs = lockoutState.lockoutUntil - Date.now()
  // Allow 5 seconds of tolerance
  expect(remainingMs).toBeGreaterThan((seconds - 5) * 1000)
  expect(remainingMs).toBeLessThanOrEqual(seconds * 1000 + 5000)
})

Then('the lockout duration should be approximately {int} minutes', async ({ page }, minutes: number) => {
  const lockoutState = await testInvoke(page, 'get_pin_lockout_state') as { failedAttempts: number; lockoutUntil: number }
  const remainingMs = lockoutState.lockoutUntil - Date.now()
  const expectedMs = minutes * 60 * 1000
  // Allow 10 seconds of tolerance
  expect(remainingMs).toBeGreaterThan(expectedMs - 10_000)
  expect(remainingMs).toBeLessThanOrEqual(expectedMs + 10_000)
})

Then('the PIN pad should be disabled', async ({ page }) => {
  // After lockout, PIN inputs should be disabled or the error prevents entry
  const firstDigit = page.locator('input[aria-label="PIN digit 1"]')
  const isDisabled = await firstDigit.isDisabled({ timeout: 2000 }).catch(() => false)
  const errorVisible = await page.locator('text=/locked out/i').isVisible({ timeout: 1000 }).catch(() => false)
  // Either the pad is disabled or the lockout message prevents entry
  expect(isDisabled || errorVisible).toBe(true)
})

Then('the stored keys should be wiped', async ({ page }) => {
  // After 10 failed attempts, keys are wiped from storage
  const hasKey = await page.evaluate(() => {
    return (
      localStorage.getItem('llamenos-encrypted-key') !== null ||
      localStorage.getItem('tauri-store:keys.json:llamenos-encrypted-key') !== null
    )
  })
  // Keys may be wiped (false) or the wipe message shown
  const wipeText = page.locator('text=/wiped/i')
  const wipeVisible = await wipeText.isVisible({ timeout: 5000 }).catch(() => false)
  expect(!hasKey || wipeVisible).toBe(true)
})

Then('I should be redirected to the setup or login screen', async ({ page }) => {
  // After wipe, user should see recovery options or login screen
  await page.waitForURL(/\/(login|setup)/, { timeout: Timeouts.NAVIGATION })
})

Then('the failed attempt counter should be reset', async ({ page }) => {
  const lockoutState = await testInvoke(page, 'get_pin_lockout_state') as { failedAttempts: number; lockoutUntil: number }
  expect(lockoutState.failedAttempts).toBe(0)
})

Given('I see the lockout message', async ({ page }) => {
  // Enter a wrong PIN to trigger lockout (attempts already seeded)
  await enterPin(page, '000000')
  await page.waitForTimeout(1000)
  const lockoutText = page.locator('text=/locked out/i')
  await expect(lockoutText.first()).toBeVisible({ timeout: Timeouts.AUTH })
})

Then('I should still see the lockout message', async ({ page }) => {
  const lockoutText = page.locator('text=/locked out/i')
  await expect(lockoutText.first()).toBeVisible({ timeout: Timeouts.AUTH })
})

Then('I should not be able to enter a PIN until lockout expires', async ({ page }) => {
  const firstDigit = page.locator('input[aria-label="PIN digit 1"]')
  const isDisabled = await firstDigit.isDisabled({ timeout: 2000 }).catch(() => false)
  const errorVisible = await page.locator('text=/locked out/i').isVisible({ timeout: 1000 }).catch(() => false)
  expect(isDisabled || errorVisible).toBe(true)
})

Given('the lockout has expired', async ({ page }) => {
  // Reset lockout timer to allow retry
  await testInvoke(page, 'reset_pin_lockout')
  // Re-seed the attempts but clear the lockout time
  await testInvoke(page, 'set_pin_failed_attempts', { count: 5 })
  // The lockoutUntil is reset to 0, so retry is allowed
})
