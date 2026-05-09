import { type Page, expect } from '@playwright/test'
import { TestIds } from '../test-ids'

export const Dialogs = {
  async confirm(page: Page): Promise<void> {
    await page.getByTestId(TestIds.CONFIRM_DIALOG_OK).click()
    await expect(page.getByRole('dialog')).toBeHidden()
  },

  async cancel(page: Page): Promise<void> {
    await page.getByTestId(TestIds.CONFIRM_DIALOG_CANCEL).click()
    await expect(page.getByRole('dialog')).toBeHidden()
  },

  async waitForDialog(page: Page): Promise<void> {
    await expect(page.getByRole('dialog')).toBeVisible()
  },
}
