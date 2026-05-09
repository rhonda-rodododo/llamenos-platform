import { type Page, expect } from '@playwright/test'
import { TestIds } from '../test-ids'
import { Timeouts } from '../helpers'

export const NotesPage = {
  async openNewForm(page: Page): Promise<void> {
    await page.getByTestId(TestIds.NOTE_NEW_BTN).click()
    await expect(page.getByTestId(TestIds.NOTE_FORM)).toBeVisible()
  },

  async createNote(page: Page, callId: string, content: string): Promise<void> {
    await page.getByTestId(TestIds.NOTE_CALL_ID).fill(callId)
    await page.getByTestId(TestIds.NOTE_CONTENT).fill(content)
    await page.getByTestId(TestIds.FORM_SAVE_BTN).click()
    await expect(page.locator('p').filter({ hasText: content })).toBeVisible()
  },
}
