import { test, expect } from '@playwright/test'
import { Timeouts } from './helpers'

test.describe('Hub Onboarding Wizard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin/hub-communications')
  })

  test('renders onboarding wizard for unconfigured hub', async ({ page }) => {
    const wizard = page.getByTestId('hub-onboarding-wizard')
    await expect(wizard).toBeVisible({ timeout: Timeouts.ELEMENT })

    const progressbar = wizard.locator('[role="progressbar"]')
    await expect(progressbar).toBeVisible()
    await expect(progressbar).toHaveAttribute('aria-valuenow', '1')
    await expect(progressbar).toHaveAttribute('aria-valuemax', '6')
  })

  test('step 1: template selection renders template cards and scratch option', async ({ page }) => {
    const scratchCard = page.getByTestId('template-card-scratch')
    await expect(scratchCard).toBeVisible({ timeout: Timeouts.ELEMENT })
    await expect(scratchCard).toHaveAttribute('role', 'radio')
    await expect(scratchCard).toHaveAttribute('aria-checked', 'false')

    await scratchCard.click()
    await expect(scratchCard).toHaveAttribute('aria-checked', 'true')

    const nextBtn = page.getByTestId('hub-onboarding-next')
    await expect(nextBtn).toBeEnabled()
  })

  test('step 2: channel checklist toggles work and enable next button', async ({ page }) => {
    await page.getByTestId('template-card-scratch').click()
    await page.getByTestId('hub-onboarding-next').click()

    const checklist = page.getByTestId('channel-checklist')
    await expect(checklist).toBeVisible({ timeout: Timeouts.ELEMENT })

    const nextBtn = page.getByTestId('hub-onboarding-next')
    await expect(nextBtn).toBeDisabled()

    const voiceToggle = page.getByTestId('channel-toggle-voice')
    await voiceToggle.click()

    await expect(nextBtn).toBeEnabled()

    const progressbar = page.locator('[role="progressbar"]')
    await expect(progressbar).toHaveAttribute('aria-valuenow', '2')
  })

  test('step 3: provider connection step renders for voice channel', async ({ page }) => {
    await page.getByTestId('template-card-scratch').click()
    await page.getByTestId('hub-onboarding-next').click()

    await page.getByTestId('channel-toggle-voice').click()
    await page.getByTestId('hub-onboarding-next').click()

    await expect(page.getByText(/connect your provider/i)).toBeVisible({ timeout: Timeouts.ELEMENT })

    const progressbar = page.locator('[role="progressbar"]')
    await expect(progressbar).toHaveAttribute('aria-valuenow', '3')
  })

  test('navigation: back button goes to previous step', async ({ page }) => {
    await page.getByTestId('template-card-scratch').click()
    await page.getByTestId('hub-onboarding-next').click()

    await expect(page.getByTestId('channel-checklist')).toBeVisible({ timeout: Timeouts.ELEMENT })

    await page.getByTestId('hub-onboarding-back').click()
    await expect(page.getByTestId('template-card-scratch')).toBeVisible({ timeout: Timeouts.ELEMENT })

    const progressbar = page.locator('[role="progressbar"]')
    await expect(progressbar).toHaveAttribute('aria-valuenow', '1')
  })

  test('keyboard navigation: enter key selects template card', async ({ page }) => {
    const scratchCard = page.getByTestId('template-card-scratch')
    await scratchCard.focus()
    await page.keyboard.press('Enter')
    await expect(scratchCard).toHaveAttribute('aria-checked', 'true')
  })
})

test.describe('Hub Communications Settings', () => {
  test('settings page loads for configured hub', async ({ page }) => {
    await page.goto('/admin/hub-communications')

    const pageTitle = page.getByTestId('page-title')
    await expect(pageTitle).toBeVisible({ timeout: Timeouts.ELEMENT })
  })

  test('provider settings card renders when status available', async ({ page }) => {
    await page.goto('/admin/hub-communications')

    const settings = page.getByTestId('hub-provider-settings')
    await expect(settings).toBeVisible({ timeout: Timeouts.ELEMENT })
  })

  test('usage card renders when usage data available', async ({ page }) => {
    await page.goto('/admin/hub-communications')

    const usageCard = page.getByTestId('hub-usage-card')
    await expect(usageCard).toBeVisible({ timeout: Timeouts.ELEMENT })
  })
})
