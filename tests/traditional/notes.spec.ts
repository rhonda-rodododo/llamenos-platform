import { expect } from '@playwright/test'
import { test } from '../traditional-fixtures'
import { Navigation, NotesPage } from '../pages'
import { loginAsAdmin, Timeouts } from '../helpers'
import { TestIds } from '../test-ids'

test.describe('Notes Management', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('notes page loads', async ({ page }) => {
    await Navigation.goToNotes(page)
    await expect(page.getByTestId(TestIds.NOTE_LIST)).toBeVisible({ timeout: Timeouts.ELEMENT })
  })

  test('can create a note', async ({ page }) => {
    await Navigation.goToNotes(page)
    
    const callId = `call-${Date.now()}`
    const content = `Test note content ${Date.now()}`
    
    await NotesPage.openNewForm(page)
    await NotesPage.createNote(page, callId, content)
    await expect(page.locator('p').filter({ hasText: content })).toBeVisible({ timeout: Timeouts.ELEMENT })
  })
})
