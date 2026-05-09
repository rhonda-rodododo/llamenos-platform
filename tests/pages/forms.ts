import { type Page } from '@playwright/test'
import { TestIds } from '../test-ids'

export const Forms = {
  async save(page: Page): Promise<void> {
    await page.getByTestId(TestIds.FORM_SAVE_BTN).click()
  },

  async cancel(page: Page): Promise<void> {
    await page.getByTestId(TestIds.FORM_CANCEL_BTN).click()
  },

  async submit(page: Page): Promise<void> {
    await page.getByTestId(TestIds.FORM_SUBMIT_BTN).click()
  },
}
