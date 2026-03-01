import { test, expect } from '@playwright/test'
import { ADMIN_NSEC, TEST_PIN, Timeouts, loginAsAdmin } from './helpers'

test.describe('Authentication', () => {
  test('admin can log in with nsec and reach dashboard', async ({ page }) => {
    await loginAsAdmin(page)
    // loginAsAdmin asserts Dashboard heading is visible
  })

  test('unauthenticated access to /notes redirects to /login', async ({ page }) => {
    await page.goto('/notes')
    await page.waitForURL(/\/login/, { timeout: Timeouts.NAVIGATION })
  })

  test('unauthenticated access to /volunteers redirects to /login', async ({ page }) => {
    await page.goto('/volunteers')
    await page.waitForURL(/\/login/, { timeout: Timeouts.NAVIGATION })
  })

  test('unauthenticated access to /settings redirects to /login', async ({ page }) => {
    await page.goto('/settings')
    await page.waitForURL(/\/login/, { timeout: Timeouts.NAVIGATION })
  })

  test('logged-in user sees sidebar navigation', async ({ page }) => {
    await loginAsAdmin(page)
    // Check main nav items visible
    await expect(page.getByRole('link', { name: /dashboard/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /notes/i })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Settings', exact: true })).toBeVisible()
  })

  test('admin sees admin nav section', async ({ page }) => {
    await loginAsAdmin(page)
    // Admin should see admin-only nav items
    await expect(page.getByRole('link', { name: /volunteers/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /shifts/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /ban list/i })).toBeVisible()
  })
})
