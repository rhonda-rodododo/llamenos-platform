import { test, expect } from '@playwright/test'
import { loginAsAdmin, navigateAfterLogin, resetTestState } from './helpers'

test.describe('Device linking — /link-device page', () => {
  test.beforeEach(async ({ page }) => {
    // Ensure no stored key so the page doesn't redirect to /login
    await page.addInitScript(() => localStorage.removeItem('llamenos-encrypted-key'))
  })

  test('shows start linking button on initial load', async ({ page }) => {
    await page.goto('/link-device')
    await expect(page.getByTestId('link-device-card')).toBeVisible({ timeout: 10000 })
    await expect(page.getByTestId('start-linking')).toBeVisible()
  })

  test('redirects to /login if user already has a stored key', async ({ page }) => {
    // Override the beforeEach — inject a fake encrypted key blob
    await page.addInitScript(() => {
      localStorage.setItem('llamenos-encrypted-key', JSON.stringify({
        salt: 'aa'.repeat(16),
        iterations: 600000,
        nonce: 'bb'.repeat(24),
        ciphertext: 'cc'.repeat(32),
        pubkey: 'dd'.repeat(8),
      }))
    })
    await page.goto('/link-device')
    await page.waitForURL(u => u.toString().includes('/login'), { timeout: 10000 })
  })

  test('shows QR code and short code after clicking start', async ({ page }) => {
    await page.goto('/link-device')
    await expect(page.getByTestId('start-linking')).toBeVisible({ timeout: 10000 })

    await page.getByTestId('start-linking').click()
    await expect(page.getByTestId('provisioning-qr')).toBeVisible({ timeout: 15000 })
    await expect(page.getByTestId('short-code')).toBeVisible()

    // Short code should be 8 uppercase hex characters
    const shortCode = await page.getByTestId('short-code').textContent()
    expect(shortCode).toBeTruthy()
    expect(shortCode!.trim()).toMatch(/^[A-F0-9]{8}$/)
  })

  test('has language selector and theme toggles', async ({ page }) => {
    await page.goto('/link-device')
    await expect(page.getByTestId('link-device-card')).toBeVisible({ timeout: 10000 })

    await expect(page.getByRole('combobox', { name: /switch to/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /light/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /dark/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /system/i })).toBeVisible()
  })
})

test.describe('Device linking — settings section', () => {
  test.beforeAll(async ({ request }) => {
    await resetTestState(request)
  })

  test('settings page has linked devices section with code input', async ({ page }) => {
    await loginAsAdmin(page)
    await navigateAfterLogin(page, '/settings?section=linked-devices')

    await expect(page.getByTestId('link-code-input')).toBeVisible({ timeout: 10000 })
    await expect(page.getByTestId('link-device-button')).toBeVisible()
  })

  test('link device button is disabled when code input is empty', async ({ page }) => {
    await loginAsAdmin(page)
    await navigateAfterLogin(page, '/settings?section=linked-devices')

    await expect(page.getByTestId('link-device-button')).toBeVisible({ timeout: 10000 })
    await expect(page.getByTestId('link-device-button')).toBeDisabled()
  })

  test('entering invalid JSON code shows error', async ({ page }) => {
    await loginAsAdmin(page)
    await navigateAfterLogin(page, '/settings?section=linked-devices')

    await page.getByTestId('link-code-input').fill('not-valid-json')
    await page.getByTestId('link-device-button').click()

    await expect(page.getByText(/invalid|expired|error/i)).toBeVisible({ timeout: 10000 })
  })
})

test.describe('Device linking — login page integration', () => {
  test('recovery view shows link-this-device button when no stored key', async ({ page }) => {
    await page.addInitScript(() => localStorage.removeItem('llamenos-encrypted-key'))
    await page.goto('/login')
    // No stored key → recovery view is default
    await expect(page.getByRole('link', { name: /link this device/i })).toBeVisible({ timeout: 10000 })
  })

  test('link-this-device button navigates to /link-device', async ({ page }) => {
    await page.addInitScript(() => localStorage.removeItem('llamenos-encrypted-key'))
    await page.goto('/login')
    await expect(page.getByRole('link', { name: /link this device/i })).toBeVisible({ timeout: 10000 })

    await page.getByRole('link', { name: /link this device/i }).click()
    await expect(page.getByTestId('link-device-card')).toBeVisible({ timeout: 10000 })
  })

  test('recovery options from PIN view shows link-this-device', async ({ page }) => {
    // Inject fake stored key for PIN view
    await page.addInitScript(() => {
      localStorage.setItem('llamenos-encrypted-key', JSON.stringify({
        salt: 'aa'.repeat(16),
        iterations: 600000,
        nonce: 'bb'.repeat(24),
        ciphertext: 'cc'.repeat(32),
        pubkey: 'dd'.repeat(8),
      }))
    })
    await page.goto('/login')

    // Switch to recovery view
    await page.getByRole('button', { name: /recovery options/i }).click()
    await expect(page.getByRole('link', { name: /link this device/i })).toBeVisible({ timeout: 5000 })
  })
})
