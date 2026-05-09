import { type Page, expect } from '@playwright/test'
import { TestIds } from '../test-ids'
import { Timeouts } from '../helpers'

export const CallHistoryPage = {
  async search(page: Page, query: string): Promise<void> {
    await page.getByTestId(TestIds.CALL_SEARCH).fill(query)
    await page.getByTestId(TestIds.CALL_SEARCH_BTN).click()
    await expect(page.getByTestId(TestIds.CALL_CLEAR_FILTERS)).toBeVisible()
  },

  async clearFilters(page: Page): Promise<void> {
    await page.getByTestId(TestIds.CALL_CLEAR_FILTERS).click()
  },
}
