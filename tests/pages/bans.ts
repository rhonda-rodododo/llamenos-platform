import { type Page, type Locator, expect } from '@playwright/test'
import { TestIds } from '../test-ids'
import { Timeouts } from '../helpers'

export const BanListPage = {
  getRow(page: Page, phone: string): Locator {
    return page.getByTestId(TestIds.BAN_ROW).filter({ hasText: phone })
  },

  async openAddForm(page: Page): Promise<void> {
    await page.getByTestId(TestIds.BAN_ADD_BTN).click()
    await expect(page.getByTestId(TestIds.BAN_FORM)).toBeVisible()
  },

  async addBan(page: Page, phone: string, reason: string): Promise<void> {
    await page.getByLabel(/phone number/i).fill(phone)
    await page.getByLabel(/phone number/i).blur()
    await page.getByLabel(/reason/i).fill(reason)
    await page.getByTestId(TestIds.FORM_SAVE_BTN).click()
    await expect(page.getByText(phone)).toBeVisible({ timeout: 10000 })
  },

  async removeBan(page: Page, phone: string): Promise<void> {
    const row = BanListPage.getRow(page, phone)
    await row.getByTestId(TestIds.BAN_REMOVE_BTN).click()
    await page.getByTestId(TestIds.CONFIRM_DIALOG_OK).click()
    await expect(page.getByRole('dialog')).toBeHidden()
    await expect(page.locator('main').getByText(phone)).not.toBeVisible()
  },

  async openBulkImport(page: Page): Promise<void> {
    await page.getByTestId(TestIds.BAN_IMPORT_BTN).click()
    await expect(page.getByTestId(TestIds.BAN_BULK_FORM)).toBeVisible()
  },
}
