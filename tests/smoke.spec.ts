import { test, expect } from '@playwright/test'
import { ADMIN_NSEC, TEST_PIN, Timeouts, TestIds } from './helpers'

test.describe('Smoke tests', () => {
  test('app loads with correct title', async ({ page }) => {
    await page.goto('/')
    // index.html has <title>Hotline</title>; config may change it at runtime
    await expect(page).toHaveTitle(/Hotline/i)
  })

  test('unauthenticated user is redirected to login', async ({ page }) => {
    await page.goto('/notes')
    // The root layout redirects to /login when not authenticated
    await page.waitForURL(/\/login/, { timeout: Timeouts.NAVIGATION })
  })

  test('login page renders with sign-in form', async ({ page }) => {
    await page.goto('/login')
    await page.waitForLoadState('domcontentloaded')
    // The login page title is "Sign in to {hotlineName}" — uses i18n auth.loginTitle
    // When no stored key exists, the nsec input should be visible
    const nsecInput = page.getByTestId(TestIds.NSEC_INPUT)
    await expect(nsecInput).toBeVisible({ timeout: Timeouts.ELEMENT })
  })

  test('rejects invalid nsec on login', async ({ page }) => {
    await page.goto('/login')
    await page.waitForLoadState('domcontentloaded')
    const nsecInput = page.getByTestId(TestIds.NSEC_INPUT)
    await expect(nsecInput).toBeVisible({ timeout: Timeouts.ELEMENT })
    await nsecInput.fill('invalid-key')
    // The login button text is "Log in" (from i18n auth.login)
    await page.getByRole('button', { name: /log in/i }).click()
    // Should show validation error (login page errors use role="alert")
    await expect(page.locator('[role="alert"]').first()).toBeVisible({ timeout: Timeouts.ELEMENT })
  })

  test('API health check responds', async ({ request }) => {
    const res = await request.get('/api/health')
    expect(res.ok()).toBeTruthy()
  })

  test('API config endpoint responds', async ({ request }) => {
    const res = await request.get('/api/config')
    expect(res.ok()).toBeTruthy()
    const data = await res.json()
    expect(data).toHaveProperty('hotlineName')
  })
})
