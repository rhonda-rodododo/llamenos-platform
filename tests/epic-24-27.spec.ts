import { test, expect } from '@playwright/test'
import { loginAsAdmin, resetTestState } from './helpers'

test.describe('Epic 24: Shift & Call Status Awareness', () => {
  test.beforeAll(async ({ request }) => {
    await resetTestState(request)
  })

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('sidebar shows shift status indicator', async ({ page }) => {
    // The sidebar should show a shift status indicator (green or gray dot)
    const sidebar = page.locator('nav')
    // Either "until" (on shift) or "Next shift" or "No shifts assigned"
    await expect(
      sidebar.getByText(/until|next shift|no shifts assigned/i)
    ).toBeVisible()
  })

  test('dashboard shows calls today metric', async ({ page }) => {
    await expect(page.getByText(/calls today/i)).toBeVisible()
  })
})

test.describe('Epic 25: Command Palette Enhancements', () => {
  test.beforeAll(async ({ request }) => {
    await resetTestState(request)
  })

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('command palette opens with Ctrl+K', async ({ page }) => {
    await page.keyboard.press('Control+k')
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByPlaceholder(/type a command/i)).toBeVisible()
  })

  test('command palette shows search shortcuts when typing', async ({ page }) => {
    await page.keyboard.press('Control+k')
    await page.getByPlaceholder(/type a command/i).fill('test query')
    // Should show search notes action
    await expect(page.getByText(/search notes for/i)).toBeVisible()
    // Admin should also see search calls
    await expect(page.getByText(/search calls for/i)).toBeVisible()
  })

  test('command palette has quick note action', async ({ page }) => {
    await page.keyboard.press('Control+k')
    await expect(page.getByText(/new note/i).first()).toBeVisible()
  })

  test('command palette has keyboard shortcuts action', async ({ page }) => {
    await page.keyboard.press('Control+k')
    await expect(page.getByText(/keyboard shortcuts/i).first()).toBeVisible()
  })
})

test.describe('Epic 26: Custom IVR Audio Recording', () => {
  test.beforeAll(async ({ request }) => {
    await resetTestState(request)
  })

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('admin settings page shows voice prompts card', async ({ page }) => {
    await page.getByRole('link', { name: 'Hub Settings' }).click()
    await expect(page.getByRole('heading', { name: 'Hub Settings', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: /voice prompts/i })).toBeVisible()
  })

  test('voice prompts card shows prompt types', async ({ page }) => {
    await page.getByRole('link', { name: 'Hub Settings' }).click()
    await expect(page.getByRole('heading', { name: 'Hub Settings', exact: true })).toBeVisible()

    // Expand Voice Prompts section
    await page.getByRole('heading', { name: /voice prompts/i }).click()

    // Should show prompt type labels
    await expect(page.getByText('Greeting').first()).toBeVisible()
    await expect(page.getByText('Please Hold').first()).toBeVisible()
    await expect(page.getByText('Wait Message').first()).toBeVisible()
  })

  test('admin settings page shows IVR language menu card', async ({ page }) => {
    await page.getByRole('link', { name: 'Hub Settings' }).click()
    await expect(page.getByRole('heading', { name: 'Hub Settings', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: /ivr language menu/i })).toBeVisible()
  })
})

test.describe('Epic 27: Remaining Polish', () => {
  test.beforeAll(async ({ request }) => {
    await resetTestState(request)
  })

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('keyboard shortcuts dialog opens with ? key', async ({ page }) => {
    await page.keyboard.press('?')
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByText(/keyboard shortcuts/i).first()).toBeVisible()
    // Should list Ctrl+K shortcut
    await expect(page.getByText(/Ctrl\+K/)).toBeVisible()
  })

  test('keyboard shortcuts dialog closes on Escape', async ({ page }) => {
    await page.keyboard.press('?')
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).not.toBeVisible()
  })

  test('settings toggle shows confirmation dialog', async ({ page }) => {
    await page.getByRole('link', { name: 'Hub Settings' }).click()
    await expect(page.getByRole('heading', { name: 'Hub Settings', exact: true })).toBeVisible()

    // Expand Spam Mitigation section
    await page.getByRole('heading', { name: 'Spam Mitigation' }).click()

    // Find the voice CAPTCHA switch — use filter with both text and switch presence
    const captchaSection = page.locator('div').filter({ hasText: /voice captcha/i, has: page.getByRole('switch') }).last()
    const captchaSwitch = captchaSection.getByRole('switch')
    await captchaSwitch.click()

    // Should show confirmation dialog
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByText(/voice captcha/i).last()).toBeVisible()

    // Cancel should close dialog without changing
    await page.getByRole('dialog').getByRole('button', { name: /cancel/i }).click()
    await expect(page.getByRole('dialog')).not.toBeVisible()
  })

  test('settings confirmation dialog applies change on confirm', async ({ page }) => {
    await page.getByRole('link', { name: 'Hub Settings' }).click()
    await expect(page.getByRole('heading', { name: 'Hub Settings', exact: true })).toBeVisible()

    // Expand Spam Mitigation section
    await page.getByRole('heading', { name: 'Spam Mitigation' }).click()

    // Toggle rate limiting — use filter with both text and switch presence
    const rlSection = page.locator('div').filter({ hasText: /rate limiting/i, has: page.getByRole('switch') }).last()
    const rlSwitch = rlSection.getByRole('switch')
    const wasChecked = await rlSwitch.isChecked()

    await rlSwitch.click()
    // Confirm
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByRole('dialog').getByRole('button', { name: /confirm/i }).click()
    await expect(page.getByRole('dialog')).not.toBeVisible()

    // Switch should have toggled
    const nowChecked = await rlSwitch.isChecked()
    expect(nowChecked).not.toBe(wasChecked)

    // Toggle back to restore state
    await rlSwitch.click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByRole('dialog').getByRole('button', { name: /confirm/i }).click()
  })

  test('toast has dismiss button', async ({ page }) => {
    // Trigger a toast by saving profile
    await page.getByRole('link', { name: 'Settings', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Account Settings', exact: true })).toBeVisible()

    await page.getByRole('button', { name: /update profile/i }).click()

    // Wait for toast to appear
    const toast = page.locator('[role="status"]').first()
    await expect(toast).toBeVisible({ timeout: 5000 })

    // Toast should have a dismiss button
    const dismissBtn = toast.locator('button[aria-label="Dismiss"]')
    await expect(dismissBtn).toBeVisible()
    await dismissBtn.click()

    // Toast should disappear
    await expect(toast).not.toBeVisible()
  })
})
