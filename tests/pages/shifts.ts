import { type Page, type Locator, expect } from '@playwright/test'
import { TestIds } from '../test-ids'
import { Timeouts } from '../helpers'

export const ShiftPage = {
  getCard(page: Page, name: string): Locator {
    return page.getByTestId(TestIds.SHIFT_CARD).filter({ hasText: name })
  },

  async openCreateForm(page: Page): Promise<void> {
    await page.getByTestId(TestIds.SHIFT_CREATE_BTN).click()
    await expect(page.getByTestId(TestIds.SHIFT_FORM)).toBeVisible()
  },

  async createShift(
    page: Page,
    name: string,
    options?: { startTime?: string; endTime?: string },
  ): Promise<void> {
    await page.getByTestId(TestIds.SHIFT_NAME_INPUT).fill(name)
    if (options?.startTime) {
      await page.getByTestId(TestIds.SHIFT_START_TIME).fill(options.startTime)
    }
    if (options?.endTime) {
      await page.getByTestId(TestIds.SHIFT_END_TIME).fill(options.endTime)
    }
    await page.getByTestId(TestIds.FORM_SAVE_BTN).click()
    await expect(page.getByText(name)).toBeVisible({ timeout: 10000 })
  },

  async openEditForm(page: Page, name: string): Promise<void> {
    const card = ShiftPage.getCard(page, name)
    await card.getByTestId(TestIds.SHIFT_EDIT_BTN).click()
    await expect(page.getByTestId(TestIds.SHIFT_FORM)).toBeVisible()
  },

  async deleteShift(page: Page, name: string): Promise<void> {
    const card = ShiftPage.getCard(page, name)
    await card.getByTestId(TestIds.SHIFT_DELETE_BTN).click()
    await expect(page.getByText(name)).not.toBeVisible()
  },

  getFallbackCard(page: Page): Locator {
    return page.getByTestId(TestIds.FALLBACK_GROUP_CARD)
  },
}
