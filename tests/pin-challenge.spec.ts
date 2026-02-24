import { test, expect } from '@playwright/test'
import { loginAsAdmin, navigateAfterLogin, enterPin, TEST_PIN } from './helpers'

test.describe('PIN Challenge (Re-auth Step-up)', () => {
  test('phone unmask on volunteers page requires PIN', async ({ page }) => {
    await loginAsAdmin(page)
    await navigateAfterLogin(page, '/volunteers')

    // Wait for volunteers list to load
    await expect(page.getByRole('heading', { name: 'Volunteers' })).toBeVisible()

    // Find a volunteer row with a phone toggle button
    const toggleBtn = page.getByTestId('toggle-phone-visibility').first()
    const hasToggle = await toggleBtn.isVisible({ timeout: 5000 }).catch(() => false)
    if (!hasToggle) {
      // No volunteers with phones — skip test
      test.skip()
      return
    }

    // Click to unmask phone — should trigger PIN challenge
    await toggleBtn.click()

    // Verify PIN dialog appears
    const pinDialog = page.getByTestId('pin-challenge-dialog')
    await expect(pinDialog).toBeVisible({ timeout: 5000 })

    // Enter correct PIN
    await enterPin(page, TEST_PIN)

    // Dialog should close
    await expect(pinDialog).not.toBeVisible({ timeout: 5000 })

    // Phone should now be visible (unmasked — full E.164 format with +)
    const phoneText = page.locator('p.font-mono').first()
    await expect(phoneText).toContainText('+')
  })

  test('wrong PIN shows error, 3 failures wipes key', async ({ page }) => {
    await loginAsAdmin(page)
    await navigateAfterLogin(page, '/volunteers')

    await expect(page.getByRole('heading', { name: 'Volunteers' })).toBeVisible()

    const toggleBtn = page.getByTestId('toggle-phone-visibility').first()
    const hasToggle = await toggleBtn.isVisible({ timeout: 5000 }).catch(() => false)
    if (!hasToggle) {
      test.skip()
      return
    }

    // Click to unmask phone
    await toggleBtn.click()

    const pinDialog = page.getByTestId('pin-challenge-dialog')
    await expect(pinDialog).toBeVisible({ timeout: 5000 })

    // Enter wrong PIN
    await enterPin(page, '999999')

    // Should show error
    const errorMsg = page.getByTestId('pin-challenge-error')
    await expect(errorMsg).toBeVisible({ timeout: 5000 })

    // Enter wrong PIN again
    await enterPin(page, '888888')
    await expect(errorMsg).toBeVisible({ timeout: 5000 })

    // Third wrong PIN — should trigger wipe and close dialog
    await enterPin(page, '777777')

    // Dialog should close after max attempts
    await expect(pinDialog).not.toBeVisible({ timeout: 5000 })

    // Key should be wiped — redirected to login
    await page.waitForURL('**/login', { timeout: 10000 })
  })

  test('cancel PIN challenge closes dialog without action', async ({ page }) => {
    await loginAsAdmin(page)
    await navigateAfterLogin(page, '/volunteers')

    await expect(page.getByRole('heading', { name: 'Volunteers' })).toBeVisible()

    const toggleBtn = page.getByTestId('toggle-phone-visibility').first()
    const hasToggle = await toggleBtn.isVisible({ timeout: 5000 }).catch(() => false)
    if (!hasToggle) {
      test.skip()
      return
    }

    // Click to unmask phone
    await toggleBtn.click()

    const pinDialog = page.getByTestId('pin-challenge-dialog')
    await expect(pinDialog).toBeVisible({ timeout: 5000 })

    // Click cancel
    await page.getByRole('button', { name: /cancel/i }).click()

    // Dialog should close
    await expect(pinDialog).not.toBeVisible({ timeout: 5000 })

    // Should still be on volunteers page
    await expect(page.getByRole('heading', { name: 'Volunteers' })).toBeVisible()
  })
})
