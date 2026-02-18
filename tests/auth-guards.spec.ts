import { test, expect } from '@playwright/test'
import { TEST_PIN, enterPin, loginAsAdmin } from './helpers'

test.describe('Auth guards', () => {
  test('unauthenticated user is redirected to login from /', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/login/)
  })

  test('unauthenticated user is redirected from /notes', async ({ page }) => {
    await page.goto('/notes')
    await expect(page).toHaveURL(/\/login/)
  })

  test('unauthenticated user is redirected from /settings', async ({ page }) => {
    await page.goto('/settings')
    await expect(page).toHaveURL(/\/login/)
  })

  test('unauthenticated user is redirected from /admin/settings', async ({ page }) => {
    await page.goto('/admin/settings')
    await expect(page).toHaveURL(/\/login/)
  })

  test('session requires PIN re-entry after reload', async ({ page }) => {
    await loginAsAdmin(page)
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()

    // Reload clears in-memory keyManager; encrypted key persists in localStorage
    await page.reload()

    // Should be redirected to login since keyManager is no longer unlocked
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 })

    // Re-enter PIN to unlock the stored encrypted key
    await enterPin(page, TEST_PIN)

    // Should be back on the Dashboard
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 15000 })
  })

  test('logout clears session', async ({ page }) => {
    await loginAsAdmin(page)
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()

    // Logout
    await page.getByRole('button', { name: /log out/i }).click()
    await expect(page).toHaveURL(/\/login/)

    // Should not be able to access dashboard without re-authenticating
    await page.goto('/')
    await expect(page).toHaveURL(/\/login/)
  })

  test('API returns 401 for unauthenticated requests', async ({ page }) => {
    // Direct API call without auth
    const response = await page.request.get('/api/volunteers')
    expect(response.status()).toBe(401)
  })
})
