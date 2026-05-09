import { type Page, type Locator, expect } from '@playwright/test'
import { TestIds } from '../test-ids'
import { Timeouts } from '../helpers'

export const VolunteerPage = {
  getRow(page: Page, name: string): Locator {
    return page.getByTestId(TestIds.VOLUNTEER_ROW).filter({ hasText: name })
  },

  getRowById(page: Page, pubkey: string): Locator {
    return page.locator(`[data-testid="volunteer-row"][data-volunteer-id="${pubkey.slice(0, 8)}"]`)
  },

  async openAddForm(page: Page): Promise<void> {
    await page.getByTestId(TestIds.VOLUNTEER_ADD_BTN).click()
    await expect(page.getByLabel('Name')).toBeVisible()
  },

  async addVolunteer(page: Page, name: string, phone: string): Promise<void> {
    await page.getByLabel('Name').fill(name)
    await page.getByLabel('Phone Number').fill(phone)
    await page.getByLabel('Phone Number').blur()
    await page.getByTestId(TestIds.FORM_SAVE_BTN).click()
    await expect(page.getByTestId(TestIds.VOLUNTEER_NSEC_CODE)).toBeVisible({ timeout: 15000 })
  },

  async getNsec(page: Page): Promise<string> {
    const nsecCode = page.getByTestId(TestIds.VOLUNTEER_NSEC_CODE)
    await expect(nsecCode).toBeVisible({ timeout: 15000 })
    const nsec = await nsecCode.textContent()
    if (!nsec) throw new Error('Failed to get nsec')
    return nsec
  },

  async dismissNsecCard(page: Page): Promise<void> {
    await page.getByTestId(TestIds.DISMISS_NSEC).click()
    await expect(page.getByTestId(TestIds.DISMISS_NSEC)).not.toBeVisible()
  },

  async deleteVolunteer(page: Page, name: string): Promise<void> {
    const row = VolunteerPage.getRow(page, name)
    await row.getByTestId(TestIds.VOLUNTEER_DELETE_BTN).click()
    await page.getByTestId(TestIds.CONFIRM_DIALOG_OK).click()
    await expect(page.getByRole('dialog')).toBeHidden()
  },
}
