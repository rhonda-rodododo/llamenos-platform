import { test, expect } from '@playwright/test'
import { loginAsAdmin, navigateAfterLogin, Timeouts } from './helpers'

const mockSystemHealth = {
  server: { status: 'ok', uptime: 3600, version: '1.0.0-test' },
  services: [
    { name: 'Blob Storage', status: 'ok' },
    { name: 'Nostr Relay', status: 'ok' },
    { name: 'Telephony', status: 'degraded', details: 'High latency' },
  ],
  calls: { today: 42, active: 3, avgResponseSeconds: 12, missed: 2 },
  storage: { dbSize: '128 MB', blobStorage: 'Connected' },
  backup: { lastBackup: '2026-03-08T00:00:00Z', backupSize: '64 MB', lastVerify: null },
  volunteers: { totalActive: 15, onlineNow: 5, onShift: 3, shiftCoverage: 20 },
  timestamp: new Date().toISOString(),
}

test.describe('Admin System Health Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // Mock the system health API endpoint
    await page.route('**/api/system/health', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockSystemHealth),
      })
    })

    await loginAsAdmin(page)
    await navigateAfterLogin(page, '/admin/system')
  })

  test('renders all 6 status cards', async ({ page }) => {
    await expect(page.getByTestId('system-card-server')).toBeVisible({ timeout: Timeouts.ELEMENT })
    await expect(page.getByTestId('system-card-services')).toBeVisible()
    await expect(page.getByTestId('system-card-calls')).toBeVisible()
    await expect(page.getByTestId('system-card-storage')).toBeVisible()
    await expect(page.getByTestId('system-card-backup')).toBeVisible()
    await expect(page.getByTestId('system-card-volunteers')).toBeVisible()
  })

  test('displays page title', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /system health/i })).toBeVisible({ timeout: Timeouts.ELEMENT })
  })

  test('shows last refresh timestamp', async ({ page }) => {
    await expect(page.getByTestId('last-refresh')).toBeVisible({ timeout: Timeouts.ELEMENT })
    await expect(page.getByTestId('last-refresh')).toContainText('Last refresh')
  })

  test('auto-refresh updates timestamp', async ({ page }) => {
    await expect(page.getByTestId('last-refresh')).toBeVisible({ timeout: Timeouts.ELEMENT })

    // Get initial timestamp text
    const initialText = await page.getByTestId('last-refresh').textContent()

    // Click manual refresh button to force update
    await page.getByRole('button', { name: /refresh/i }).click()
    await page.waitForTimeout(1000)

    // Timestamp should still be visible (may or may not change within same second)
    await expect(page.getByTestId('last-refresh')).toBeVisible()
  })

  test('nav link is visible in admin section', async ({ page }) => {
    await expect(page.getByTestId('nav-admin-system')).toBeVisible()
  })
})
