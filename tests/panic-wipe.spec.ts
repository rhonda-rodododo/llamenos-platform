import { test, expect } from '@playwright/test'
import { loginAsAdmin, TEST_PIN } from './helpers'

test.describe('Panic Wipe (L-9)', () => {
  test('triple-Escape wipes storage and redirects to login', async ({ page }) => {
    await loginAsAdmin(page)

    // Verify we're on the dashboard and storage has data
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    const hasKeyBefore = await page.evaluate(() => !!localStorage.getItem('llamenos-encrypted-key'))
    expect(hasKeyBefore).toBe(true)

    // Triple-tap Escape within 1 second
    await page.keyboard.press('Escape')
    await page.waitForTimeout(100)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(100)
    await page.keyboard.press('Escape')

    // Should see the red flash overlay briefly
    const overlay = page.getByTestId('panic-wipe-overlay')
    await expect(overlay).toBeVisible({ timeout: 2000 })

    // Should redirect to /login
    await page.waitForURL('**/login', { timeout: 5000 })

    // Verify storage was cleared
    const hasKeyAfter = await page.evaluate(() => !!localStorage.getItem('llamenos-encrypted-key'))
    expect(hasKeyAfter).toBe(false)

    const localStorageLength = await page.evaluate(() => localStorage.length)
    expect(localStorageLength).toBe(0)

    const sessionStorageLength = await page.evaluate(() => sessionStorage.length)
    expect(sessionStorageLength).toBe(0)
  })

  test('two Escapes then pause does not trigger wipe', async ({ page }) => {
    await loginAsAdmin(page)
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()

    // Two Escapes, then wait > 1 second
    await page.keyboard.press('Escape')
    await page.waitForTimeout(100)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(1200) // Wait > 1 second window

    // Third Escape after window expired — should NOT trigger wipe
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)

    // Should still be on the dashboard
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()

    // Storage should still have the key
    const hasKey = await page.evaluate(() => !!localStorage.getItem('llamenos-encrypted-key'))
    expect(hasKey).toBe(true)
  })
})
