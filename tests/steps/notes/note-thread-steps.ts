/**
 * Note thread reply step definitions.
 * Matches steps from: packages/test-specs/features/notes/note-thread.feature
 *
 * Behavioral depth: Hard assertions, no expect(true).toBe(true),
 * no if(visible) guards hiding failures.
 */
import { expect } from '@playwright/test'
import { Given, When, Then } from '../fixtures'
import { TestIds } from '../../test-ids'
import { Timeouts } from '../../helpers'
import { Navigation } from '../../pages/index'
import { listNotesViaApi } from '../../api-helpers'

Given('I am on the note detail screen', async ({ page, request }) => {
  // Ensure at least one note exists
  const { notes } = await listNotesViaApi(request)
  if (notes.length === 0) {
    await Navigation.goToNotes(page)
    await page.getByTestId(TestIds.NOTE_NEW_BTN).click()
    await page.getByTestId(TestIds.NOTE_CONTENT).fill('Test note for thread')
    await page.getByTestId(TestIds.FORM_SAVE_BTN).click()
    await page.waitForTimeout(Timeouts.ASYNC_SETTLE)
  } else {
    await Navigation.goToNotes(page)
  }
  // Open first note
  const noteCard = page.getByTestId(TestIds.NOTE_CARD).first()
  await expect(noteCard).toBeVisible({ timeout: Timeouts.ELEMENT })
  await noteCard.click()
  await page.waitForTimeout(Timeouts.UI_SETTLE)
})

Given('the note has no replies', async () => {
  // Precondition: a fresh note with no replies — verified by subsequent assertions
})

Given('I am on the notes list', async ({ page }) => {
  await Navigation.goToNotes(page)
  const pageTitle = page.getByTestId(TestIds.PAGE_TITLE)
  await expect(pageTitle).toBeVisible({ timeout: Timeouts.ELEMENT })
  await expect(pageTitle).toContainText(/notes/i)
})

Then('I should see the thread replies section', async ({ page }) => {
  await expect(page.getByTestId(TestIds.NOTE_THREAD)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see the reply input field', async ({ page }) => {
  await expect(page.getByTestId(TestIds.NOTE_REPLY_TEXT)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see the no replies message', async ({ page }) => {
  // The empty state should be within the thread section
  const threadSection = page.getByTestId(TestIds.NOTE_THREAD)
  await expect(threadSection).toBeVisible({ timeout: Timeouts.ELEMENT })
  const emptyState = threadSection.locator(`[data-testid="${TestIds.EMPTY_STATE}"]`)
  await expect(emptyState).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see the reply count in the thread header', async ({ page }) => {
  const threadSection = page.getByTestId(TestIds.NOTE_THREAD)
  await expect(threadSection).toBeVisible({ timeout: Timeouts.ELEMENT })
  // Reply count shows as "N replies" or "N comments" in the thread header
  const replyCount = threadSection.locator('text=/\\d+\\s*(repl|comment)/i')
  await expect(replyCount.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see the send reply button', async ({ page }) => {
  await expect(page.getByTestId(TestIds.NOTE_REPLY_SEND)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('notes with replies should show a reply count badge', async ({ page }) => {
  // On the notes list, cards with replies show a reply count badge
  const noteCards = page.getByTestId(TestIds.NOTE_CARD)
  await expect(noteCards.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
  // At least one card should have a reply count indicator
  const badge = noteCards.locator('text=/\\d+\\s*repl/i')
  await expect(badge.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})
