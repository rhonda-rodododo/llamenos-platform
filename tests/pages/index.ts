/**
 * Page Object utilities for Playwright tests.
 *
 * These helpers encapsulate common page interactions and make tests more
 * readable and maintainable. Changes to the UI only need updates here,
 * not across all test files.
 */

import { type Page, type Locator, expect } from '@playwright/test'
import { TestIds, rowTestId } from '../test-ids'

// ============ Base Page Helpers ============

/**
 * Wait for API response and UI to settle after an action.
 * Prefer this over arbitrary waitForTimeout when waiting for state updates.
 */
export async function waitForApiAndUi(page: Page, timeout = 2000): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout }).catch(() => {})
}

/**
 * Click a button and wait for API response pattern.
 * Useful for save/submit actions that trigger API calls.
 */
export async function clickAndWaitForApi(
  page: Page,
  buttonLocator: Locator,
  apiPattern: string | RegExp,
): Promise<void> {
  await Promise.all([
    page.waitForResponse(r => {
      const url = r.url()
      return typeof apiPattern === 'string' ? url.includes(apiPattern) : apiPattern.test(url)
    }),
    buttonLocator.click(),
  ])
}

// ============ Navigation Helpers ============

export const Navigation = {
  async goToDashboard(page: Page): Promise<void> {
    await page.getByRole('link', { name: 'Dashboard' }).click()
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  },

  async goToVolunteers(page: Page): Promise<void> {
    await page.getByRole('link', { name: 'Volunteers' }).click()
    await expect(page.getByRole('heading', { name: 'Volunteers' })).toBeVisible()
  },

  async goToShifts(page: Page): Promise<void> {
    await page.getByRole('link', { name: 'Shifts' }).click()
    await expect(page.getByRole('heading', { name: /shift schedule/i })).toBeVisible()
  },

  async goToBanList(page: Page): Promise<void> {
    await page.getByRole('link', { name: 'Ban List' }).click()
    await expect(page.getByRole('heading', { name: /ban list/i })).toBeVisible()
  },

  async goToNotes(page: Page): Promise<void> {
    await page.getByRole('link', { name: 'Notes' }).click()
    await expect(page.getByRole('heading', { name: /call notes/i })).toBeVisible()
  },

  async goToCallHistory(page: Page): Promise<void> {
    await page.getByRole('link', { name: 'Call History' }).click()
    await expect(page.getByRole('heading', { name: /call history/i })).toBeVisible()
  },

  async goToAuditLog(page: Page): Promise<void> {
    await page.getByRole('link', { name: 'Audit Log' }).click()
    await expect(page.getByRole('heading', { name: /audit log/i })).toBeVisible()
  },

  async goToSettings(page: Page): Promise<void> {
    await page.getByRole('link', { name: 'Settings', exact: true }).click()
    await expect(page.getByRole('heading', { name: /settings/i })).toBeVisible()
  },

  async goToHubSettings(page: Page): Promise<void> {
    await page.getByRole('link', { name: 'Hub Settings' }).click()
    await expect(page.getByRole('heading', { name: 'Hub Settings', exact: true })).toBeVisible()
  },

  async goToReports(page: Page): Promise<void> {
    await page.getByRole('link', { name: 'Reports' }).click()
    await expect(page.getByRole('heading', { name: /reports/i })).toBeVisible()
  },

  async goToConversations(page: Page): Promise<void> {
    await page.getByRole('link', { name: 'Conversations' }).click()
    await expect(page.getByRole('heading', { name: /conversations/i })).toBeVisible()
  },

  async goToBlasts(page: Page): Promise<void> {
    await page.getByRole('link', { name: 'Blasts' }).click()
    await expect(page.getByRole('heading', { name: /blasts/i })).toBeVisible()
  },
}

// ============ Volunteer Page ============

export const VolunteerPage = {
  /**
   * Get a volunteer row by name.
   */
  getRow(page: Page, name: string): Locator {
    return page.getByTestId(TestIds.VOLUNTEER_ROW).filter({ hasText: name })
  },

  /**
   * Get a volunteer row by test ID with identifier.
   */
  getRowById(page: Page, pubkey: string): Locator {
    return page.getByTestId(rowTestId(TestIds.VOLUNTEER_ROW, pubkey))
  },

  /**
   * Open the add volunteer form.
   */
  async openAddForm(page: Page): Promise<void> {
    await page.getByTestId(TestIds.VOLUNTEER_ADD_BTN).click()
    await expect(page.getByLabel('Name')).toBeVisible()
  },

  /**
   * Fill and submit the add volunteer form.
   */
  async addVolunteer(page: Page, name: string, phone: string): Promise<void> {
    await page.getByLabel('Name').fill(name)
    await page.getByLabel('Phone Number').fill(phone)
    await page.getByLabel('Phone Number').blur()
    await page.getByTestId(TestIds.FORM_SAVE_BTN).click()
    await expect(page.getByTestId(TestIds.VOLUNTEER_NSEC_CODE)).toBeVisible({ timeout: 15000 })
  },

  /**
   * Get the generated nsec from the nsec card.
   */
  async getNsec(page: Page): Promise<string> {
    const nsecCode = page.getByTestId(TestIds.VOLUNTEER_NSEC_CODE)
    await expect(nsecCode).toBeVisible({ timeout: 15000 })
    const nsec = await nsecCode.textContent()
    if (!nsec) throw new Error('Failed to get nsec')
    return nsec
  },

  /**
   * Dismiss the nsec card.
   */
  async dismissNsecCard(page: Page): Promise<void> {
    await page.getByTestId(TestIds.DISMISS_NSEC).click()
    await expect(page.getByTestId(TestIds.DISMISS_NSEC)).not.toBeVisible()
  },

  /**
   * Delete a volunteer by name.
   */
  async deleteVolunteer(page: Page, name: string): Promise<void> {
    const row = this.getRow(page, name)
    await row.getByTestId(TestIds.VOLUNTEER_DELETE_BTN).click()
    await page.getByRole('dialog').getByRole('button', { name: /delete/i }).click()
    await expect(page.getByRole('dialog')).toBeHidden()
  },
}

// ============ Shift Page ============

export const ShiftPage = {
  /**
   * Get a shift card by name.
   */
  getCard(page: Page, name: string): Locator {
    return page.getByTestId(TestIds.SHIFT_CARD).filter({ hasText: name })
  },

  /**
   * Open the create shift form.
   */
  async openCreateForm(page: Page): Promise<void> {
    await page.getByTestId(TestIds.SHIFT_CREATE_BTN).click()
    await expect(page.getByTestId(TestIds.SHIFT_FORM)).toBeVisible()
  },

  /**
   * Fill and submit the shift form.
   */
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

  /**
   * Edit a shift by name.
   */
  async openEditForm(page: Page, name: string): Promise<void> {
    const card = this.getCard(page, name)
    await card.getByTestId(TestIds.SHIFT_EDIT_BTN).click()
    await expect(page.getByTestId(TestIds.SHIFT_FORM)).toBeVisible()
  },

  /**
   * Delete a shift by name.
   */
  async deleteShift(page: Page, name: string): Promise<void> {
    const card = this.getCard(page, name)
    await card.getByTestId(TestIds.SHIFT_DELETE_BTN).click()
    await expect(page.getByText(name)).not.toBeVisible()
  },

  /**
   * Get the fallback group card.
   */
  getFallbackCard(page: Page): Locator {
    return page.getByTestId(TestIds.FALLBACK_GROUP_CARD)
  },
}

// ============ Ban List Page ============

export const BanListPage = {
  /**
   * Get a ban row by phone number.
   */
  getRow(page: Page, phone: string): Locator {
    return page.getByTestId(TestIds.BAN_ROW).filter({ hasText: phone })
  },

  /**
   * Open the add ban form.
   */
  async openAddForm(page: Page): Promise<void> {
    await page.getByTestId(TestIds.BAN_ADD_BTN).click()
    await expect(page.getByTestId(TestIds.BAN_FORM)).toBeVisible()
  },

  /**
   * Add a ban.
   */
  async addBan(page: Page, phone: string, reason: string): Promise<void> {
    await page.getByLabel(/phone number/i).fill(phone)
    await page.getByLabel(/phone number/i).blur()
    await page.getByLabel(/reason/i).fill(reason)
    await page.getByTestId(TestIds.FORM_SAVE_BTN).click()
    await expect(page.getByText(phone)).toBeVisible({ timeout: 10000 })
  },

  /**
   * Remove a ban by phone.
   */
  async removeBan(page: Page, phone: string): Promise<void> {
    const row = this.getRow(page, phone)
    await row.getByTestId(TestIds.BAN_REMOVE_BTN).click()
    await page.getByRole('dialog').getByRole('button', { name: /unban/i }).click()
    await expect(page.getByRole('dialog')).toBeHidden()
    await expect(page.locator('main').getByText(phone)).not.toBeVisible()
  },

  /**
   * Open bulk import form.
   */
  async openBulkImport(page: Page): Promise<void> {
    await page.getByTestId(TestIds.BAN_IMPORT_BTN).click()
    await expect(page.getByTestId(TestIds.BAN_BULK_FORM)).toBeVisible()
  },
}

// ============ Notes Page ============

export const NotesPage = {
  /**
   * Open the new note form.
   */
  async openNewForm(page: Page): Promise<void> {
    await page.getByTestId(TestIds.NOTE_NEW_BTN).click()
    await expect(page.getByTestId(TestIds.NOTE_FORM)).toBeVisible()
  },

  /**
   * Create a note.
   */
  async createNote(page: Page, callId: string, content: string): Promise<void> {
    await page.getByTestId(TestIds.NOTE_CALL_ID).fill(callId)
    await page.getByTestId(TestIds.NOTE_CONTENT).fill(content)
    await page.getByTestId(TestIds.FORM_SAVE_BTN).click()
    await expect(page.locator('p').filter({ hasText: content })).toBeVisible()
  },

  /**
   * Get a note card.
   */
  getCard(page: Page, content: string): Locator {
    return page.getByTestId(TestIds.NOTE_CARD).filter({ hasText: content })
  },
}

// ============ Call History Page ============

export const CallHistoryPage = {
  /**
   * Search for calls.
   */
  async search(page: Page, query: string): Promise<void> {
    await page.getByTestId(TestIds.CALL_SEARCH).fill(query)
    await page.getByTestId(TestIds.CALL_SEARCH_BTN).click()
    await expect(page.getByTestId(TestIds.CALL_CLEAR_FILTERS)).toBeVisible()
  },

  /**
   * Clear search filters.
   */
  async clearFilters(page: Page): Promise<void> {
    await page.getByTestId(TestIds.CALL_CLEAR_FILTERS).click()
  },
}

// ============ Dialog Helpers ============

export const Dialogs = {
  /**
   * Confirm a dialog.
   */
  async confirm(page: Page): Promise<void> {
    await page.getByTestId(TestIds.CONFIRM_DIALOG_OK).click()
    await expect(page.getByRole('dialog')).toBeHidden()
  },

  /**
   * Cancel a dialog.
   */
  async cancel(page: Page): Promise<void> {
    await page.getByTestId(TestIds.CONFIRM_DIALOG_CANCEL).click()
    await expect(page.getByRole('dialog')).toBeHidden()
  },

  /**
   * Wait for a dialog to appear.
   */
  async waitForDialog(page: Page): Promise<void> {
    await expect(page.getByRole('dialog')).toBeVisible()
  },
}

// ============ Form Helpers ============

export const Forms = {
  /**
   * Save a form.
   */
  async save(page: Page): Promise<void> {
    await page.getByTestId(TestIds.FORM_SAVE_BTN).click()
  },

  /**
   * Cancel a form.
   */
  async cancel(page: Page): Promise<void> {
    await page.getByTestId(TestIds.FORM_CANCEL_BTN).click()
  },

  /**
   * Submit a form.
   */
  async submit(page: Page): Promise<void> {
    await page.getByTestId(TestIds.FORM_SUBMIT_BTN).click()
  },
}
