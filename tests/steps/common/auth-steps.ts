/**
 * Common authentication step definitions shared across features.
 * Reuses existing helpers from tests/helpers.ts.
 */
import { expect } from '@playwright/test'
import { Given, When } from '../fixtures'
import {
  loginAsAdmin,
  loginAsVolunteer,
  enterPin,
  nsecToHex,
  ADMIN_NSEC,
  TEST_PIN,
  Timeouts,
  TestIds,
} from '../../helpers'

Given('the app is freshly installed', async ({ page }) => {
  // Clear all storage to simulate a fresh install
  await page.goto('/login')
  await page.evaluate(() => {
    localStorage.clear()
    sessionStorage.clear()
  })
})

Given('no identity exists on the device', async ({ page }) => {
  // Ensure no encrypted key exists in storage (clear both current and legacy key names)
  await page.evaluate(() => {
    localStorage.removeItem('llamenos:llamenos-encrypted-device-keys')
    localStorage.removeItem('llamenos:llamenos-encrypted-key')
    localStorage.removeItem('llamenos-encrypted-key')
    localStorage.removeItem('tauri-store:keys.json:llamenos-encrypted-device-keys')
    localStorage.removeItem('tauri-store:keys.json:llamenos-encrypted-key')
  })
})

Given('an identity exists with PIN {string}', async ({ page }, pin: string) => {
  // Pre-load the admin key encrypted with the given PIN using the test platform shim.
  // This simulates a returning user who has set up their identity and locked the app.
  const secretHex = nsecToHex(ADMIN_NSEC)

  await page.goto('/login')
  await page.evaluate(() => {
    sessionStorage.clear()
    localStorage.removeItem('llamenos:llamenos-encrypted-device-keys')
    localStorage.removeItem('llamenos:llamenos-encrypted-key')
    localStorage.removeItem('llamenos-encrypted-key')
  })
  await page.reload()
  await page.waitForLoadState('domcontentloaded')

  // Wait for __TEST_PLATFORM to be loaded (set asynchronously in main.tsx)
  await page.waitForFunction(() => !!(window as Record<string, unknown>).__TEST_PLATFORM, { timeout: 10000 })

  // Import key via test platform shim: persists encrypted keys then locks — leaving the
  // app in the "locked, PIN required" state that these scenarios test.
  await page.evaluate(async ({ secretHex, pin }) => {
    const platform = (window as Record<string, unknown>).__TEST_PLATFORM as {
      legacyImportNsec: (secretHex: string, pin: string, deviceId: string) => Promise<unknown>
      persistAndUnlockDeviceKeys: (encrypted: unknown, pin: string) => Promise<unknown>
      lockCrypto: () => Promise<void>
    }
    const encrypted = await platform.legacyImportNsec(secretHex, pin, crypto.randomUUID())
    await platform.persistAndUnlockDeviceKeys(encrypted, pin)
    await platform.lockCrypto()
  }, { secretHex, pin })
})

Given('I am logged in', async ({ page }) => {
  await loginAsAdmin(page)
})

Given('I am logged in as an admin', async ({ page }) => {
  await loginAsAdmin(page)
})

Given('I am authenticated', async ({ page }) => {
  await loginAsAdmin(page)
})

Given('I am authenticated and on the dashboard', async ({ page }) => {
  await loginAsAdmin(page)
  await expect(page.getByTestId(TestIds.PAGE_TITLE)).toBeVisible({ timeout: Timeouts.AUTH })
})

Given('I am authenticated and on the main screen', async ({ page }) => {
  await loginAsAdmin(page)
  await expect(page.getByTestId(TestIds.PAGE_TITLE)).toBeVisible({ timeout: Timeouts.AUTH })
})

Given('I am on the login screen', async ({ page }) => {
  await page.goto('/login')
  await page.waitForLoadState('domcontentloaded')
})

Given('I have a stored identity with PIN {string}', async ({ page }, pin: string) => {
  // Pre-load an encrypted key for the given PIN using the test platform shim.
  // Normalize to 6 digits (app uses 6-digit PINs; feature files may use 4-digit for readability).
  // Uses legacyImportNsec so the admin nsec is stored and locked — leaving the app in the
  // "locked, PIN required" state that PIN setup/unlock scenarios test.
  const normalizedPin = pin.padEnd(6, '0')
  const secretHex = nsecToHex(ADMIN_NSEC)

  await page.goto('/login')
  await page.evaluate(() => {
    localStorage.clear()
    sessionStorage.clear()
  })
  await page.reload()
  await page.waitForLoadState('domcontentloaded')

  // Wait for __TEST_PLATFORM to be loaded (set asynchronously in main.tsx)
  await page.waitForFunction(() => !!(window as Record<string, unknown>).__TEST_PLATFORM, { timeout: 10000 })

  await page.evaluate(async ({ secretHex, normalizedPin }) => {
    const platform = (window as Record<string, unknown>).__TEST_PLATFORM as {
      legacyImportNsec: (secretHex: string, pin: string, deviceId: string) => Promise<unknown>
      persistAndUnlockDeviceKeys: (encrypted: unknown, pin: string) => Promise<unknown>
      lockCrypto: () => Promise<void>
    }
    const encrypted = await platform.legacyImportNsec(secretHex, normalizedPin, crypto.randomUUID())
    await platform.persistAndUnlockDeviceKeys(encrypted, normalizedPin)
    await platform.lockCrypto()
  }, { secretHex, normalizedPin })
})

Given('the app is restarted', async ({ page }) => {
  // Reload the page to simulate an app restart.
  // Wait for 'load' (all scripts executed) rather than just 'domcontentloaded'
  // so that the Tauri IPC mock (sets Symbol.for('llamenos_test_invoke') at module load)
  // is guaranteed to be available before subsequent steps call page.waitForFunction.
  await page.reload()
  await page.waitForLoadState('load')
})

When('the app launches', async ({ page }) => {
  await page.goto('/login')
  await page.waitForLoadState('domcontentloaded')
})

When('I enter PIN {string}', async ({ page }, pin: string) => {
  // Normalize to 6 digits (app uses 6-digit PINs; feature files may use 4-digit for readability)
  const normalizedPin = pin.padEnd(6, '0')
  await enterPin(page, normalizedPin)
})
