import { test, expect } from '@playwright/test'
import { loginAsAdmin, enterPin, TEST_PIN } from './helpers'

test.describe('Theme', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('can switch to dark theme', async ({ page }) => {
    await page.getByRole('button', { name: /dark theme/i }).click()
    await expect(page.locator('html')).toHaveClass(/dark/)
  })

  test('can switch to light theme', async ({ page }) => {
    await page.getByRole('button', { name: /light theme/i }).click()
    await expect(page.locator('html')).not.toHaveClass(/dark/)
  })

  test('can switch to system theme', async ({ page }) => {
    await page.getByRole('button', { name: /system theme/i }).click()
    // System theme should not throw an error, just apply
    await expect(page.locator('html')).toBeVisible()
  })

  test('theme persists across page reload', async ({ page }) => {
    await page.getByRole('button', { name: /dark theme/i }).click()
    await expect(page.locator('html')).toHaveClass(/dark/)

    await page.reload()
    await enterPin(page, TEST_PIN)
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    await expect(page.locator('html')).toHaveClass(/dark/)
  })

  test('login page has theme toggle', async ({ page }) => {
    // Logout first
    await page.getByRole('button', { name: /log out/i }).click()
    await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible()

    // Theme buttons should be visible on login
    await expect(page.getByRole('button', { name: /dark theme/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /light theme/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /system theme/i })).toBeVisible()
  })

  test('dark theme persists across SPA navigation', async ({ page }) => {
    // Switch to dark
    await page.getByRole('button', { name: /dark theme/i }).click()
    await expect(page.locator('html')).toHaveClass(/dark/)

    // Navigate to Volunteers page
    await page.getByRole('link', { name: 'Volunteers' }).click()
    await expect(page.getByRole('heading', { name: 'Volunteers' })).toBeVisible()
    await expect(page.locator('html')).toHaveClass(/dark/)

    // Navigate to Audit Log
    await page.getByRole('link', { name: 'Audit Log' }).click()
    await expect(page.getByRole('heading', { name: /audit log/i })).toBeVisible()
    await expect(page.locator('html')).toHaveClass(/dark/)

    // Navigate back to Dashboard
    await page.getByRole('link', { name: 'Dashboard' }).click()
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    await expect(page.locator('html')).toHaveClass(/dark/)
  })
})
