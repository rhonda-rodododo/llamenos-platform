import { test, expect } from '@playwright/test'

test('app loads and shows login page', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/Llámenos/i)
  await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible()
})

test('shows recovery view with nsec input when no stored key', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible()
  await expect(page.locator('#nsec')).toBeVisible()
  await expect(page.getByRole('button', { name: /log in/i })).toBeVisible()
})

test('rejects invalid nsec', async ({ page }) => {
  await page.goto('/login')
  await page.locator('#nsec').fill('invalid-key')
  await page.getByRole('button', { name: /log in/i }).click()
  await expect(page.getByText(/invalid/i)).toBeVisible()
})

test('redirects unauthenticated users to login', async ({ page }) => {
  await page.goto('/notes')
  await expect(page).toHaveURL(/\/login/)
  await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible()
})
