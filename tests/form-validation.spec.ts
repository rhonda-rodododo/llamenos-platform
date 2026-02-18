import { test, expect } from '@playwright/test'
import { loginAsAdmin, uniquePhone } from './helpers'

test.describe('Form validation', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('volunteer form rejects invalid phone', async ({ page }) => {
    await page.getByRole('link', { name: 'Volunteers' }).click()
    await page.getByRole('button', { name: /add volunteer/i }).click()

    await page.getByLabel('Name').fill('Test')
    // PhoneInput strips non-digits; use a too-short number that fails E.164 validation
    await page.getByLabel('Phone Number').fill('+123')
    await page.getByLabel('Phone Number').blur()
    await page.getByRole('button', { name: /save/i }).click()

    await expect(page.getByText(/invalid phone/i)).toBeVisible()
  })

  test('volunteer form rejects phone without plus prefix', async ({ page }) => {
    await page.getByRole('link', { name: 'Volunteers' }).click()
    await page.getByRole('button', { name: /add volunteer/i }).click()

    await page.getByLabel('Name').fill('Test')
    // PhoneInput auto-prepends +, so '1234' becomes '+1234' which is too short for E.164
    await page.getByLabel('Phone Number').fill('1234')
    await page.getByLabel('Phone Number').blur()
    await page.getByRole('button', { name: /save/i }).click()

    await expect(page.getByText(/invalid phone/i)).toBeVisible()
  })

  test('volunteer form accepts valid E.164 phone', async ({ page }) => {
    const phone = uniquePhone()
    await page.getByRole('link', { name: 'Volunteers' }).click()
    await page.getByRole('button', { name: /add volunteer/i }).click()

    await page.getByLabel('Name').fill('Valid Phone Test')
    await page.getByLabel('Phone Number').fill(phone)
    await page.getByLabel('Phone Number').blur()
    await page.getByRole('button', { name: /save/i }).click()

    // Should show nsec (success)
    await expect(page.getByText(/nsec1/)).toBeVisible({ timeout: 15000 })
  })

  test('ban form rejects invalid phone', async ({ page }) => {
    await page.getByRole('link', { name: 'Ban List' }).click()
    await page.getByRole('button', { name: /ban number/i }).click()

    // PhoneInput strips non-digits; use a too-short number
    await page.getByLabel('Phone Number').fill('+123')
    await page.getByLabel('Phone Number').blur()
    await page.getByLabel('Reason').fill('Test reason')
    await page.getByRole('button', { name: /save/i }).click()

    await expect(page.getByText(/invalid phone/i)).toBeVisible()
  })

  test('ban form rejects short phone numbers', async ({ page }) => {
    await page.getByRole('link', { name: 'Ban List' }).click()
    await page.getByRole('button', { name: /ban number/i }).click()

    await page.getByLabel('Phone Number').fill('+123')
    await page.getByLabel('Phone Number').blur()
    await page.getByLabel('Reason').fill('Test reason')
    await page.getByRole('button', { name: /save/i }).click()

    await expect(page.getByText(/invalid phone/i)).toBeVisible()
  })

  test('login rejects nsec without nsec prefix', async ({ page }) => {
    await page.getByRole('button', { name: /log out/i }).click()
    // After logout, encrypted key is still in localStorage so PIN view shows.
    // Click "Recovery options" to access the nsec input.
    await page.getByRole('button', { name: /recovery options/i }).click()
    await page.locator('#nsec').fill('npub1abc123')
    await page.getByRole('button', { name: /log in/i }).click()
    await expect(page.getByText(/invalid/i)).toBeVisible()
  })

  test('login rejects very short nsec', async ({ page }) => {
    await page.getByRole('button', { name: /log out/i }).click()
    await page.getByRole('button', { name: /recovery options/i }).click()
    await page.locator('#nsec').fill('nsec1short')
    await page.getByRole('button', { name: /log in/i }).click()
    await expect(page.getByText(/invalid/i)).toBeVisible()
  })

  test('bulk ban import validates phone format', async ({ page }) => {
    await page.getByRole('link', { name: 'Ban List' }).click()
    await page.getByRole('button', { name: /import/i }).click()

    await page.locator('textarea').fill('not-a-phone\n+invalid')
    await page.getByLabel('Reason').fill('Test reason')
    await page.getByRole('button', { name: /submit/i }).click()

    await expect(page.getByText(/invalid phone/i)).toBeVisible()
  })
})
