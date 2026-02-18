import { test, expect } from '@playwright/test'
import { loginAsAdmin, loginAsVolunteer, createVolunteerAndGetNsec, uniquePhone, resetTestState, completeProfileSetup, navigateAfterLogin } from './helpers'

test.describe('Ban management', () => {
  test.beforeAll(async ({ request }) => {
    await resetTestState(request)
  })

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await page.getByRole('link', { name: 'Ban List' }).click()
    await expect(page.getByRole('heading', { name: /ban list/i })).toBeVisible()
  })

  test('page loads with heading and buttons', async ({ page }) => {
    await expect(page.getByRole('button', { name: /ban number/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /import ban/i })).toBeVisible()
  })

  test('empty state shows message', async ({ page }) => {
    await expect(page.getByText(/no banned numbers/i)).toBeVisible()
  })

  test('add ban with phone and reason', async ({ page }) => {
    const phone = uniquePhone()
    await page.getByRole('button', { name: /ban number/i }).click()

    await page.getByLabel(/phone number/i).fill(phone)
    await page.getByLabel(/phone number/i).blur()
    await page.getByLabel(/reason/i).fill('Spam caller')
    await page.getByRole('button', { name: /save/i }).click()

    // Ban should appear in the list
    await expect(page.getByText(phone)).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Spam caller')).toBeVisible()
  })

  test('ban shows date', async ({ page }) => {
    const phone = uniquePhone()
    await page.getByRole('button', { name: /ban number/i }).click()

    await page.getByLabel(/phone number/i).fill(phone)
    await page.getByLabel(/phone number/i).blur()
    await page.getByLabel(/reason/i).fill('Date check')
    await page.getByRole('button', { name: /save/i }).click()

    await expect(page.getByText(phone)).toBeVisible({ timeout: 10000 })

    // The ban row should contain a date
    const banRow = page.locator('.divide-y > div').filter({ hasText: phone })
    const text = await banRow.textContent()
    // Should contain today's date in some format (at least the year)
    expect(text).toContain(new Date().getFullYear().toString())
  })

  test('remove ban with confirmation', async ({ page }) => {
    const phone = uniquePhone()

    // Add a ban first
    await page.getByRole('button', { name: /ban number/i }).click()
    await page.getByLabel(/phone number/i).fill(phone)
    await page.getByLabel(/phone number/i).blur()
    await page.getByLabel(/reason/i).fill('To remove')
    await page.getByRole('button', { name: /save/i }).click()
    await expect(page.getByText(phone)).toBeVisible({ timeout: 10000 })

    // Click Remove on the ban row
    const banRow = page.locator('.divide-y > div').filter({ hasText: phone })
    await banRow.getByRole('button', { name: 'Remove' }).click()

    // Confirm dialog should appear
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByRole('dialog').getByRole('button', { name: /unban/i }).click()

    // Dialog should close and ban should be gone
    await expect(page.getByRole('dialog')).toBeHidden()
    await expect(page.locator('main').getByText(phone)).not.toBeVisible()
  })

  test('cancel ban removal', async ({ page }) => {
    const phone = uniquePhone()

    // Add a ban
    await page.getByRole('button', { name: /ban number/i }).click()
    await page.getByLabel(/phone number/i).fill(phone)
    await page.getByLabel(/phone number/i).blur()
    await page.getByLabel(/reason/i).fill('Keep this')
    await page.getByRole('button', { name: /save/i }).click()
    await expect(page.getByText(phone)).toBeVisible({ timeout: 10000 })

    // Click Remove
    const banRow = page.locator('.divide-y > div').filter({ hasText: phone })
    await banRow.getByRole('button', { name: 'Remove' }).click()

    // Cancel the dialog
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByRole('dialog').getByRole('button', { name: /cancel/i }).click()

    // Ban should still be there
    await expect(page.getByRole('dialog')).toBeHidden()
    await expect(page.getByText(phone)).toBeVisible()
  })

  test('cancel add ban form', async ({ page }) => {
    await page.getByRole('button', { name: /ban number/i }).click()
    await expect(page.getByLabel(/phone number/i)).toBeVisible()

    await page.getByRole('button', { name: /cancel/i }).click()
    await expect(page.getByLabel(/phone number/i)).not.toBeVisible()
  })

  test('phone validation rejects invalid numbers', async ({ page }) => {
    await page.getByRole('button', { name: /ban number/i }).click()

    // Use a too-short phone number
    await page.getByLabel(/phone number/i).fill('+12')
    await page.getByLabel(/phone number/i).blur()
    await page.getByLabel(/reason/i).fill('Bad phone')
    await page.getByRole('button', { name: /save/i }).click()

    // Should show validation error
    await expect(page.getByText(/invalid phone/i)).toBeVisible({ timeout: 5000 })
  })

  test('multiple bans display in list', async ({ page }) => {
    const phone1 = uniquePhone()
    const phone2 = uniquePhone()

    // Add first ban
    await page.getByRole('button', { name: /ban number/i }).click()
    await page.getByLabel(/phone number/i).fill(phone1)
    await page.getByLabel(/phone number/i).blur()
    await page.getByLabel(/reason/i).fill('First ban')
    await page.getByRole('button', { name: /save/i }).click()
    await expect(page.getByText(phone1)).toBeVisible({ timeout: 10000 })

    // Add second ban
    await page.getByRole('button', { name: /ban number/i }).click()
    await page.getByLabel(/phone number/i).fill(phone2)
    await page.getByLabel(/phone number/i).blur()
    await page.getByLabel(/reason/i).fill('Second ban')
    await page.getByRole('button', { name: /save/i }).click()
    await expect(page.getByText(phone2)).toBeVisible({ timeout: 10000 })

    // Both should be visible
    await expect(page.getByText(phone1)).toBeVisible()
    await expect(page.getByText(phone2)).toBeVisible()
    await expect(page.getByText('First ban')).toBeVisible()
    await expect(page.getByText('Second ban')).toBeVisible()
  })

  test('bulk import form opens and closes', async ({ page }) => {
    await page.getByRole('button', { name: /import ban/i }).click()
    // Bulk import form should be visible with textarea
    await expect(page.getByText(/paste phone numbers/i)).toBeVisible()

    await page.getByRole('button', { name: /cancel/i }).click()
    await expect(page.getByText(/paste phone numbers/i)).not.toBeVisible()
  })

  test('bulk import adds multiple bans', async ({ page }) => {
    const phone1 = uniquePhone()
    const phone2 = uniquePhone()

    await page.getByRole('button', { name: /import ban/i }).click()

    // Fill textarea with multiple phones
    const textarea = page.locator('textarea')
    await textarea.fill(`${phone1}\n${phone2}`)
    await page.getByLabel(/reason/i).fill('Bulk ban reason')
    await page.getByRole('button', { name: /submit/i }).click()

    // Both phones should appear in the list
    await expect(page.getByText(phone1)).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(phone2)).toBeVisible()
  })

  test('bulk import rejects invalid phones', async ({ page }) => {
    await page.getByRole('button', { name: /import ban/i }).click()

    const textarea = page.locator('textarea')
    await textarea.fill('+12\n+34')
    await page.getByLabel(/reason/i).fill('Bad bulk')
    await page.getByRole('button', { name: /submit/i }).click()

    // Should show validation error
    await expect(page.getByText(/invalid phone/i)).toBeVisible({ timeout: 5000 })
  })

  test('volunteer cannot access ban list', async ({ page }) => {
    // Create a volunteer
    const phone = uniquePhone()
    const name = `NoBanVol ${Date.now()}`
    await page.getByRole('link', { name: 'Volunteers' }).click()
    const nsec = await createVolunteerAndGetNsec(page, name, phone)
    await page.getByRole('button', { name: /close/i }).click()

    // Login as volunteer
    await page.getByRole('button', { name: /log out/i }).click()
    await loginAsVolunteer(page, nsec)
    await completeProfileSetup(page)

    // Navigate directly to bans page (SPA navigate to avoid full reload clearing keyManager)
    await navigateAfterLogin(page, '/bans')
    await expect(page.getByText(/access denied/i)).toBeVisible({ timeout: 10000 })
  })
})
