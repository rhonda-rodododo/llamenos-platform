import { test, expect } from '@playwright/test'

test.describe('Login page — no stored key (recovery view)', () => {
  test('shows nsec input and Log in button', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible()
    await expect(page.locator('#nsec')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Log in', exact: true })).toBeVisible()
  })

  test('shows backup file upload area', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('input[type="file"][accept=".json"]')).toBeAttached()
    await expect(page.getByText(/select backup file/i)).toBeVisible()
  })

  test('invalid nsec shows error', async ({ page }) => {
    await page.goto('/login')
    await page.locator('#nsec').fill('not-a-valid-nsec')
    await page.getByRole('button', { name: 'Log in', exact: true }).click()
    await expect(page.getByText(/invalid/i)).toBeVisible({ timeout: 5000 })
  })

  test('empty nsec shows error', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('button', { name: 'Log in', exact: true }).click()
    await expect(page.getByText(/invalid/i)).toBeVisible({ timeout: 5000 })
  })
})

test.describe('Login page — stored key exists (PIN view)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
    // Inject a fake encrypted key blob to trigger the PIN entry UI
    await page.evaluate(() => {
      localStorage.setItem('llamenos-encrypted-key', JSON.stringify({
        salt: 'aa'.repeat(16),
        iterations: 600000,
        nonce: 'bb'.repeat(24),
        ciphertext: 'cc'.repeat(32),
        pubkey: 'dd'.repeat(8),
      }))
    })
    await page.reload()
  })

  test('shows PIN digit inputs', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible()
    for (let i = 1; i <= 6; i++) {
      await expect(page.locator(`input[aria-label="PIN digit ${i}"]`)).toBeVisible()
    }
  })

  test('shows Recovery options button', async ({ page }) => {
    await expect(page.getByRole('button', { name: /recovery options/i })).toBeVisible()
  })

  test('Recovery options button switches to recovery view', async ({ page }) => {
    await page.getByRole('button', { name: /recovery options/i }).click()

    // PIN digits should no longer be visible; nsec input should appear
    await expect(page.locator('#nsec')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Log in', exact: true })).toBeVisible()
  })
})

test.describe('Login page — common elements', () => {
  test('language selector is available', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('combobox', { name: /switch to/i })).toBeVisible()
  })

  test('theme toggles work', async ({ page }) => {
    await page.goto('/login')

    await expect(page.getByRole('button', { name: /system theme/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /light theme/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /dark theme/i })).toBeVisible()

    await page.getByRole('button', { name: /light theme/i }).click()
    await expect(page.getByRole('button', { name: /light theme/i })).toBeVisible()
  })

  test('security note is visible', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByText(/key never leaves your device/i)).toBeVisible()
  })
})
