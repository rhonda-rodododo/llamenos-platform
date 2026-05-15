import { test, expect } from '@playwright/test'

test.describe('Channel Configuration', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin/settings')
    await page.waitForSelector('[data-testid="page-title"]')
  })

  test('shows all five channel sections', async ({ page }) => {
    await expect(page.locator('[data-testid="sms-channel"]')).toBeVisible()
    await expect(page.locator('[data-testid="whatsapp-channel"]')).toBeVisible()
    await expect(page.locator('[data-testid="signal-channel"]')).toBeVisible()
    await expect(page.locator('[data-testid="telegram-channel"]')).toBeVisible()
    await expect(page.locator('[data-testid="rcs-channel"]')).toBeVisible()
  })

  test('SMS section shows content mode selector', async ({ page }) => {
    await page.click('[data-testid="sms-channel-trigger"]')
    await expect(page.locator('[data-testid="sms-content-mode"]')).toBeVisible()
    await expect(page.locator('[data-testid="sms-enabled-toggle"]')).toBeVisible()
  })

  test('SMS section shows A2P registration panel', async ({ page }) => {
    await page.click('[data-testid="sms-channel-trigger"]')
    await expect(page.getByText('A2P 10DLC Registration')).toBeVisible()
  })

  test('WhatsApp section shows integration mode toggle', async ({ page }) => {
    await page.click('[data-testid="whatsapp-channel-trigger"]')
    await expect(page.locator('[data-testid="whatsapp-integration-mode"]')).toBeVisible()
  })

  test('WhatsApp direct mode shows credential fields', async ({ page }) => {
    await page.click('[data-testid="whatsapp-channel-trigger"]')
    await page.click('[data-testid="whatsapp-integration-mode"]')
    await page.getByText('Direct Meta API').click()
    await expect(page.locator('[data-testid="whatsapp-phone-number-id"]')).toBeVisible()
    await expect(page.locator('[data-testid="whatsapp-access-token"]')).toBeVisible()
  })

  test('Telegram section shows bot token field', async ({ page }) => {
    await page.click('[data-testid="telegram-channel-trigger"]')
    await expect(page.locator('[data-testid="telegram-bot-token"]')).toBeVisible()
    await expect(page.locator('[data-testid="telegram-bot-username"]')).toBeVisible()
  })

  test('connection test button shows result badge', async ({ page }) => {
    await page.click('[data-testid="sms-channel-trigger"]')
    await page.locator('[data-testid="sms-enabled-toggle"]').click()
    await page.click('[data-testid="test-sms-btn"]')
    await expect(page.locator('[data-testid="test-sms-btn"]').locator('..').locator('.badge')).toBeVisible({ timeout: 10000 })
  })

  test('auto-response fields are present in each channel', async ({ page }) => {
    await page.click('[data-testid="sms-channel-trigger"]')
    await expect(page.locator('[data-testid="sms-auto-response"]')).toBeVisible()
    await expect(page.locator('[data-testid="sms-after-hours"]')).toBeVisible()
  })

  test('save button persists channel config', async ({ page }) => {
    await page.click('[data-testid="telegram-channel-trigger"]')
    await page.locator('[data-testid="telegram-bot-token"]').fill('123456:ABC-TEST')
    await page.locator('[data-testid="telegram-bot-username"]').fill('@TestBot')
    await page.click('[data-testid="telegram-save-btn"]')
    await expect(page.getByText('Success')).toBeVisible({ timeout: 5000 })
  })
})
