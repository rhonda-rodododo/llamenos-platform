import { test, expect } from '@playwright/test'
import { loginAsAdmin } from './helpers'

test.describe('Notification prompt banner', () => {
  test('shows notification banner when permission is default', async ({ page }) => {
    // Mock Notification API as 'default' permission
    await page.addInitScript(() => {
      Object.defineProperty(window, 'Notification', {
        value: { permission: 'default', requestPermission: () => Promise.resolve('default') },
        writable: true,
        configurable: true,
      })
    })

    await loginAsAdmin(page)

    // Notification banner should be visible
    await expect(page.getByText('Enable notifications to get alerted when calls come in.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Enable', exact: true })).toBeVisible()
  })

  test('hides notification banner when permission is granted', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'Notification', {
        value: { permission: 'granted', requestPermission: () => Promise.resolve('granted') },
        writable: true,
        configurable: true,
      })
    })

    await loginAsAdmin(page)

    // Banner should not appear
    await expect(page.getByText('Enable notifications to get alerted when calls come in.')).not.toBeVisible()
  })

  test('dismiss button hides notification banner permanently', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'Notification', {
        value: { permission: 'default', requestPermission: () => Promise.resolve('default') },
        writable: true,
        configurable: true,
      })
    })

    await loginAsAdmin(page)

    // Banner visible
    const banner = page.getByText('Enable notifications to get alerted when calls come in.')
    await expect(banner).toBeVisible()

    // Click dismiss (X button near the banner)
    const dismissBtn = banner.locator('..').locator('..').getByRole('button', { name: 'Close' })
    await dismissBtn.click()

    // Banner should be gone
    await expect(banner).not.toBeVisible()

    // Verify localStorage was set
    const dismissed = await page.evaluate(() => localStorage.getItem('llamenos-notification-prompt-dismissed'))
    expect(dismissed).toBe('true')
  })
})

test.describe('Settings notification permission status', () => {
  test('shows "Enabled" badge when notifications are granted', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'Notification', {
        value: { permission: 'granted', requestPermission: () => Promise.resolve('granted') },
        writable: true,
        configurable: true,
      })
    })

    await loginAsAdmin(page)
    await page.getByRole('link', { name: 'Settings', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Account Settings', exact: true })).toBeVisible()

    // Expand notifications section
    const notifSection = page.getByRole('heading', { name: 'Call Notifications' })
    await notifSection.click()

    // Should show the Enabled badge
    await expect(page.getByText('Notifications are enabled.')).toBeVisible()
    await expect(page.getByText('Enabled', { exact: true })).toBeVisible()
  })

  test('shows "Not enabled" badge and Enable button when permission is default', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'Notification', {
        value: { permission: 'default', requestPermission: () => Promise.resolve('granted') },
        writable: true,
        configurable: true,
      })
    })

    await loginAsAdmin(page)
    await page.getByRole('link', { name: 'Settings', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Account Settings', exact: true })).toBeVisible()

    // Expand notifications section
    const notifSection = page.getByRole('heading', { name: 'Call Notifications' })
    await notifSection.click()

    // Should show the Not enabled badge and Enable button
    await expect(page.getByText('Browser notifications have not been enabled yet.')).toBeVisible()
    await expect(page.getByText('Not enabled', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Enable Notifications' })).toBeVisible()
  })

  test('shows "Blocked" badge when notifications are denied', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'Notification', {
        value: { permission: 'denied', requestPermission: () => Promise.resolve('denied') },
        writable: true,
        configurable: true,
      })
    })

    await loginAsAdmin(page)
    await page.getByRole('link', { name: 'Settings', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Account Settings', exact: true })).toBeVisible()

    // Expand notifications section
    const notifSection = page.getByRole('heading', { name: 'Call Notifications' })
    await notifSection.click()

    // Should show the Blocked badge
    await expect(page.getByText("Notifications are blocked. Update your browser's site settings to enable them.")).toBeVisible()
    await expect(page.getByText('Blocked', { exact: true })).toBeVisible()
  })
})

test.describe('PWA install banner', () => {
  test('does not show PWA banner when beforeinstallprompt has not fired', async ({ page }) => {
    await loginAsAdmin(page)

    // PWA banner should not be visible (no beforeinstallprompt event)
    await expect(page.getByText('Install this app for quick access')).not.toBeVisible()
  })

  test('shows PWA banner when beforeinstallprompt fires', async ({ page }) => {
    await loginAsAdmin(page)

    // Dispatch beforeinstallprompt after login (hook listener is already attached)
    await page.evaluate(() => {
      const event = new Event('beforeinstallprompt')
      ;(event as any).prompt = () => Promise.resolve()
      ;(event as any).userChoice = Promise.resolve({ outcome: 'dismissed' })
      window.dispatchEvent(event)
    })

    // PWA banner should appear
    await expect(page.getByText('Install this app for quick access and a better experience.')).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole('button', { name: 'Install' })).toBeVisible()
  })

  test('dismiss button hides PWA banner permanently', async ({ page }) => {
    await loginAsAdmin(page)

    // Dispatch beforeinstallprompt
    await page.evaluate(() => {
      const event = new Event('beforeinstallprompt')
      ;(event as any).prompt = () => Promise.resolve()
      ;(event as any).userChoice = Promise.resolve({ outcome: 'dismissed' })
      window.dispatchEvent(event)
    })

    // Wait for banner
    const bannerText = page.getByText('Install this app for quick access and a better experience.')
    await expect(bannerText).toBeVisible({ timeout: 10000 })

    // Click dismiss
    const dismissBtn = bannerText.locator('..').locator('..').getByRole('button', { name: 'Close' })
    await dismissBtn.click()

    // Banner gone
    await expect(bannerText).not.toBeVisible()

    // localStorage set
    const dismissed = await page.evaluate(() => localStorage.getItem('llamenos-pwa-install-dismissed'))
    expect(dismissed).toBe('true')
  })
})
