import { type Page, expect } from '@playwright/test'
import { TestIds } from '../test-ids'
import { Timeouts } from '../helpers'

export const DashboardPage = {
  async assertCardsVisible(page: Page): Promise<void> {
    await expect(page.getByTestId(TestIds.DASHBOARD_SHIFT_STATUS)).toBeVisible({ timeout: Timeouts.ELEMENT })
    await expect(page.getByTestId(TestIds.DASHBOARD_ACTIVE_CALLS)).toBeVisible({ timeout: Timeouts.ELEMENT })
    await expect(page.getByTestId(TestIds.DASHBOARD_CALLS_TODAY)).toBeVisible({ timeout: Timeouts.ELEMENT })
  },

  async assertShiftStatus(page: Page, option1: string, option2: string): Promise<void> {
    const shiftCard = page.getByTestId(TestIds.DASHBOARD_SHIFT_STATUS)
    await expect(shiftCard).toBeVisible({ timeout: Timeouts.ELEMENT })
    await expect(shiftCard).toContainText(new RegExp(`${option1}|${option2}|Ready|On Call|On Break`, 'i'))
  },

  async assertCallsTodayNumeric(page: Page): Promise<void> {
    const callsCard = page.getByTestId(TestIds.DASHBOARD_CALLS_TODAY)
    await expect(callsCard).toBeVisible({ timeout: Timeouts.ELEMENT })
    const text = await callsCard.textContent()
    expect(text).toMatch(/\d+/)
  },

  async assertClockButtonVisible(page: Page): Promise<void> {
    await expect(page.getByTestId(TestIds.BREAK_TOGGLE_BTN)).toBeVisible({ timeout: Timeouts.ELEMENT })
  },

  async assertClockButtonText(page: Page, text: string): Promise<void> {
    const clockBtn = page.getByTestId(TestIds.BREAK_TOGGLE_BTN)
    await expect(clockBtn).toBeVisible({ timeout: Timeouts.ELEMENT })
    await expect(clockBtn).toContainText(text)
  },

  async clickClockButton(page: Page): Promise<void> {
    await page.getByTestId(TestIds.BREAK_TOGGLE_BTN).click()
  },

  async ensureOnShift(page: Page): Promise<void> {
    const clockBtn = page.getByTestId(TestIds.BREAK_TOGGLE_BTN)
    const isVisible = await clockBtn.isVisible({ timeout: Timeouts.ELEMENT }).catch(() => false)
    if (isVisible) {
      const text = await clockBtn.textContent()
      if (text?.includes('Clock In')) {
        await clockBtn.click()
        await expect(clockBtn).toContainText('Clock Out', { timeout: Timeouts.ELEMENT })
      }
    }
  },

  async ensureOffShift(page: Page): Promise<void> {
    const clockBtn = page.getByTestId(TestIds.BREAK_TOGGLE_BTN)
    const isVisible = await clockBtn.isVisible({ timeout: Timeouts.ELEMENT }).catch(() => false)
    if (isVisible) {
      const text = await clockBtn.textContent()
      if (text?.includes('Clock Out')) {
        await clockBtn.click()
        await expect(clockBtn).toContainText('Clock In', { timeout: Timeouts.ELEMENT })
      }
    }
  },

  async assertLogoutVisible(page: Page): Promise<void> {
    await expect(page.getByTestId(TestIds.LOGOUT_BTN)).toBeVisible({ timeout: Timeouts.ELEMENT })
  },
}
