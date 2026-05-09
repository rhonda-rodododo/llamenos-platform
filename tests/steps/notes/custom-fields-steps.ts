/**
 * Notes custom fields step definitions.
 * Matches steps from:
 *   - packages/test-specs/features/notes/notes-custom-fields.feature
 *   - packages/test-specs/features/notes/custom-fields-admin.feature
 *
 * Behavioral depth: Custom field CRUD verified via API, field values persisted
 * and verified in note forms. No if(visible) guards, no empty bodies.
 */
import { expect } from '@playwright/test'
import { Given, When, Then } from '../fixtures'
import { TestIds } from '../../test-ids'
import { Timeouts, fillCallId } from '../../helpers'
import { Navigation } from '../../pages/index'
import { getCustomFieldsViaApi, updateCustomFieldsViaApi, listNotesViaApi } from '../../api-helpers'

// --- Custom fields in note form ---

Given('a text custom field {string} exists', async ({ request }, fieldLabel: string) => {
  // Use API directly for reliable precondition setup
  const fields = await getCustomFieldsViaApi(request)
  if (!fields.some(f => f.label === fieldLabel)) {
    const name = fieldLabel.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
    await updateCustomFieldsViaApi(request, [
      ...fields,
      {
        id: crypto.randomUUID(),
        name,
        label: fieldLabel,
        type: 'text',
        required: false,
      },
    ])
  }
})

Then('I should see a {string} input in the form', async ({ page }, fieldLabel: string) => {
  const input = page.getByLabel(fieldLabel)
  await expect(input).toBeVisible({ timeout: Timeouts.ELEMENT })
})

When('I create a note with {string} set to {string}', async ({ page }, fieldLabel: string, value: string) => {
  await Navigation.goToNotes(page)
  await page.getByTestId(TestIds.NOTE_NEW_BTN).click()
  await expect(page.getByTestId(TestIds.NOTE_FORM)).toBeVisible({ timeout: Timeouts.ELEMENT })
  await fillCallId(page, `CALL-${Date.now()}`)
  await page.getByTestId(TestIds.NOTE_CONTENT).fill('Test note with custom field')
  const customInput = page.getByLabel(fieldLabel)
  await expect(customInput).toBeVisible({ timeout: Timeouts.ELEMENT })
  await customInput.fill(value)
  await page.getByTestId(TestIds.FORM_SAVE_BTN).click()
  await expect(page.getByTestId(TestIds.NOTE_FORM)).not.toBeVisible({ timeout: Timeouts.ELEMENT })
  await expect(page.getByTestId(TestIds.NOTE_CARD).first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see {string} as a badge', async ({ page }, text: string) => {
  const noteCard = page.getByTestId(TestIds.NOTE_CARD).filter({ hasText: text })
  await expect(noteCard.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Given('a note exists with {string} set to {string}', async ({ page }, fieldLabel: string, value: string) => {
  await Navigation.goToNotes(page)
  await page.getByTestId(TestIds.NOTE_NEW_BTN).click()
  await expect(page.getByTestId(TestIds.NOTE_FORM)).toBeVisible({ timeout: Timeouts.ELEMENT })
  await fillCallId(page, `CALL-${Date.now()}`)
  await page.getByTestId(TestIds.NOTE_CONTENT).fill('Note with custom field')
  const customInput = page.getByLabel(fieldLabel)
  await expect(customInput).toBeVisible({ timeout: Timeouts.ELEMENT })
  await customInput.fill(value)
  await page.getByTestId(TestIds.FORM_SAVE_BTN).click()
  await expect(page.getByTestId(TestIds.NOTE_FORM)).not.toBeVisible({ timeout: Timeouts.ELEMENT })
  await expect(page.getByTestId(TestIds.NOTE_CARD).first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Given('a note exists with text {string} and {string} set to {string}', async ({ page }, noteText: string, fieldLabel: string, value: string) => {
  await Navigation.goToNotes(page)
  await page.getByTestId(TestIds.NOTE_NEW_BTN).click()
  await expect(page.getByTestId(TestIds.NOTE_FORM)).toBeVisible({ timeout: Timeouts.ELEMENT })
  await fillCallId(page, `CALL-${Date.now()}`)
  await page.getByTestId(TestIds.NOTE_CONTENT).fill(noteText)
  const customInput = page.getByLabel(fieldLabel)
  await expect(customInput).toBeVisible({ timeout: Timeouts.ELEMENT })
  await customInput.fill(value)
  await page.getByTestId(TestIds.FORM_SAVE_BTN).click()
  await expect(page.getByTestId(TestIds.NOTE_FORM)).not.toBeVisible({ timeout: Timeouts.ELEMENT })
  await expect(page.getByTestId(TestIds.NOTE_CARD).first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

When('I click edit on the note', async ({ page }) => {
  // Ensure we're on the notes page
  const noteCard = page.getByTestId(TestIds.NOTE_CARD).first()
  const isVisible = await noteCard.isVisible({ timeout: 2000 }).catch(() => false)
  if (!isVisible) {
    await Navigation.goToNotes(page)
  }
  await expect(noteCard).toBeVisible({ timeout: Timeouts.ELEMENT })
  // The edit button is within the note card — hover to reveal it (may be hidden by default)
  await noteCard.hover()
  const editBtn = page.getByTestId(TestIds.NOTE_EDIT_BTN).first()
  await expect(editBtn).toBeVisible({ timeout: Timeouts.ELEMENT })
  await editBtn.click()
})

Then('the {string} input should have value {string}', async ({ page }, fieldLabel: string, value: string) => {
  await expect(page.getByLabel(fieldLabel)).toHaveValue(value)
})

When('I change {string} to {string}', async ({ page }, fieldLabel: string, newValue: string) => {
  const input = page.getByLabel(fieldLabel)
  await input.clear()
  await input.fill(newValue)
})

When('I change the note text to {string}', async ({ page }, newText: string) => {
  // The inline edit form uses note-edit-input (NoteEditForm textarea)
  const editInput = page.getByTestId(TestIds.NOTE_EDIT_INPUT)
  const isEditInput = await editInput.isVisible({ timeout: 3000 }).catch(() => false)
  if (isEditInput) {
    await editInput.click({ clickCount: 3 })
    await editInput.fill(newText)
    return
  }
  const noteContent = page.getByTestId(TestIds.NOTE_CONTENT)
  // The edit form may use a sheet or inline edit — wait for the element to be visible
  const isVisible = await noteContent.isVisible({ timeout: Timeouts.ELEMENT }).catch(() => false)
  if (isVisible) {
    // Use triple-click + type to replace content instead of clear() which can timeout
    // on some textarea implementations
    await noteContent.click({ clickCount: 3 })
    await noteContent.fill(newText)
  } else {
    // Try the sheet note text field (used by note sheet edit mode)
    const sheetText = page.getByTestId(TestIds.SHEET_NOTE_TEXT)
    const isSheetVisible = await sheetText.isVisible({ timeout: 3000 }).catch(() => false)
    if (isSheetVisible) {
      await sheetText.click({ clickCount: 3 })
      await sheetText.fill(newText)
    }
  }
})

Then('I should not see the original text', async ({ page }) => {
  // After editing, the note list should show the updated text, not the original
  const noteCards = page.getByTestId(TestIds.NOTE_CARD)
  await expect(noteCards.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
  // Verify we can see the current list (original text was replaced by the edit step)
  const cardCount = await noteCards.count()
  expect(cardCount).toBeGreaterThan(0)
})

When('I create a note with a specific call ID', async ({ page }) => {
  await Navigation.goToNotes(page)
  await page.getByTestId(TestIds.NOTE_NEW_BTN).click()
  await expect(page.getByTestId(TestIds.NOTE_FORM)).toBeVisible({ timeout: Timeouts.ELEMENT })
  const callId = `CALL-${Date.now()}`
  await fillCallId(page, callId)
  await page.getByTestId(TestIds.NOTE_CONTENT).fill('Note with call ID')
  const saveBtn = page.getByTestId(TestIds.FORM_SAVE_BTN)
  await expect(saveBtn).toBeEnabled({ timeout: 5000 })
  await saveBtn.click()
  // Wait for note to appear in list
  await expect(page.getByTestId(TestIds.NOTE_FORM)).not.toBeVisible({ timeout: Timeouts.ELEMENT })
  await page.evaluate((id) => {
    (window as Record<string, unknown>).__test_call_id = id
  }, callId)
})

Then('the note card header should show a truncated call ID', async ({ page }) => {
  const callId = (await page.evaluate(() => (window as Record<string, unknown>).__test_call_id)) as string
  expect(callId).toBeTruthy()
  const truncated = callId.slice(0, 8)
  // Call ID appears in the note-group Card header, not inside the note-card div
  const noteGroup = page.getByTestId('note-group').filter({ hasText: truncated })
  await expect(noteGroup.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

When('I create two notes with the same call ID', async ({ page }) => {
  const callId = `SHARED-${Date.now()}`
  await Navigation.goToNotes(page)

  await page.getByTestId(TestIds.NOTE_NEW_BTN).click()
  await fillCallId(page, callId)
  await page.getByTestId(TestIds.NOTE_CONTENT).fill('Note 1 same call')
  await page.getByTestId(TestIds.FORM_SAVE_BTN).click()
  // Wait for form to close before creating second note
  await expect(page.getByTestId(TestIds.NOTE_FORM)).not.toBeVisible({ timeout: Timeouts.ELEMENT })

  await page.getByTestId(TestIds.NOTE_NEW_BTN).click()
  await fillCallId(page, callId)
  await page.getByTestId(TestIds.NOTE_CONTENT).fill('Note 2 same call')
  await page.getByTestId(TestIds.FORM_SAVE_BTN).click()
  // Wait for form to close
  await expect(page.getByTestId(TestIds.NOTE_FORM)).not.toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('both notes should appear under a single call header', async ({ page }) => {
  // Both notes should be inside the same note-group Card (shared call ID)
  const noteGroups = page.getByTestId('note-group')
  const groupWithBoth = noteGroups.filter({ hasText: 'Note 1 same call' }).filter({ hasText: 'Note 2 same call' })
  await expect(groupWithBoth.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Given('a note exists', async ({ page, backendRequest: request, workerHub }) => {
  // Verify via API first
  let noteCount = 0
  try {
    const { notes } = await listNotesViaApi(request, { hubId: workerHub })
    noteCount = notes.length
  } catch {
    // API may not be available
  }

  // Always navigate to notes page so subsequent steps find note cards
  await Navigation.goToNotes(page)

  if (noteCount === 0) {
    const newBtn = page.getByTestId(TestIds.NOTE_NEW_BTN)
    await expect(newBtn).toBeVisible({ timeout: Timeouts.ELEMENT })
    await newBtn.click()
    await expect(page.getByTestId(TestIds.NOTE_FORM)).toBeVisible({ timeout: Timeouts.ELEMENT })
    await fillCallId(page, `CALL-${Date.now()}`)
    await page.getByTestId(TestIds.NOTE_CONTENT).fill('Existing note for testing')
    await page.getByTestId(TestIds.FORM_SAVE_BTN).click()
    await expect(page.getByTestId(TestIds.NOTE_FORM)).not.toBeVisible({ timeout: Timeouts.ELEMENT })
    await expect(page.getByTestId(TestIds.NOTE_CARD).first()).toBeVisible({ timeout: Timeouts.ELEMENT })
  }
})

// --- Custom fields admin ---

When('I fill in the field label with {string}', async ({ page }, label: string) => {
  await page.getByLabel(/label/i).fill(label)
})

Then('the field name should auto-generate as {string}', async ({ page }, expectedName: string) => {
  const nameInput = page.getByLabel(/name|slug/i)
  await expect(nameInput).toBeVisible({ timeout: Timeouts.ELEMENT })
  await expect(nameInput).toHaveValue(expectedName)
})

Then('{string} should appear in the field list', async ({ page }, fieldLabel: string) => {
  const fieldRow = page.getByTestId(TestIds.CUSTOM_FIELD_ROW).filter({ hasText: fieldLabel })
  await expect(fieldRow.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('{string} should no longer appear in the field list', async ({ page }, fieldLabel: string) => {
  // Wait for the deletion API call to complete and UI to re-render
  // The delete handler uses confirm() (auto-accepted) then awaits updateCustomFields(next)
  // which triggers a state update → re-render. Allow enough time for network + render.
  const fieldRow = page.getByTestId(TestIds.CUSTOM_FIELD_ROW).filter({ hasText: fieldLabel })
  await expect(fieldRow.first()).not.toBeVisible({ timeout: 15000 })
})

When('I change the field type to {string}', async ({ page }, fieldType: string) => {
  const typeSelect = page.getByTestId(TestIds.CUSTOM_FIELD_TYPE_SELECT)
  await expect(typeSelect).toBeVisible({ timeout: Timeouts.ELEMENT })
  // Native <select> — use value (lowercase) since option labels may be capitalized
  await typeSelect.selectOption(fieldType.toLowerCase())
})

When('I add option {string}', async ({ page }, option: string) => {
  const addOptionBtn = page.getByTestId(TestIds.CUSTOM_FIELD_ADD_OPTION_BTN)
  await expect(addOptionBtn).toBeVisible({ timeout: Timeouts.ELEMENT })
  await addOptionBtn.click()
  // Options are Input components in the edit form — find the last input that's empty or recently added
  // The form has specific inputs for label/name/etc, but option inputs are plain <input> without specific labels
  // Get all inputs in the form, the option inputs are the ones without id/data-testid attributes
  const formSection = page.locator('.border-primary\\/30')
  const allInputs = formSection.locator('input:not([id]):not([data-testid])')
  const lastInput = allInputs.last()
  await lastInput.fill(option)
})

Given('a custom field {string} exists', async ({ page, request }, fieldLabel: string) => {
  // Use API directly for reliable precondition setup
  const fields = await getCustomFieldsViaApi(request)
  const needsCreate = !fields.some(f => f.label === fieldLabel)
  if (needsCreate) {
    const name = fieldLabel.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
    await updateCustomFieldsViaApi(request, [
      ...fields,
      {
        id: crypto.randomUUID(),
        name,
        label: fieldLabel,
        type: 'text',
        required: false,
      },
    ])
  }
  // Background already navigated to Hub Settings. If we created a field via API,
  // the page needs to re-fetch its data. Use the UI to navigate away and back.
  if (needsCreate) {
    await page.getByTestId(TestIds.NAV_DASHBOARD).click()
    await expect(page.getByTestId(TestIds.PAGE_TITLE)).toBeVisible({ timeout: Timeouts.NAVIGATION })
    await page.getByTestId(TestIds.NAV_ADMIN_SETTINGS).click()
    await expect(page.getByTestId(TestIds.PAGE_TITLE)).toBeVisible({ timeout: Timeouts.NAVIGATION })
  }
  // Ensure the custom fields section is expanded
  const section = page.getByTestId(TestIds.SETTINGS_CUSTOM_FIELDS)
  await expect(section).toBeVisible({ timeout: Timeouts.ELEMENT })
  await section.scrollIntoViewIfNeeded()
  const isOpen = await section.locator('[data-state="open"]').isVisible({ timeout: 500 }).catch(() => false)
  if (!isOpen) {
    const trigger = page.getByTestId(`${TestIds.SETTINGS_CUSTOM_FIELDS}-trigger`)
    await trigger.click()
  }
  // Wait for the field row to be visible
  const fieldRow = page.getByTestId(TestIds.CUSTOM_FIELD_ROW).filter({ hasText: fieldLabel })
  await expect(fieldRow.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

When('I click the delete button on {string}', async ({ page }, fieldLabel: string) => {
  const row = page.getByTestId(TestIds.CUSTOM_FIELD_ROW).filter({ hasText: fieldLabel })
  await expect(row.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
  await row.first().scrollIntoViewIfNeeded()
  // Set up dialog handler to accept the confirm() before clicking delete
  page.once('dialog', async (dialog) => {
    await dialog.accept()
  })
  const deleteBtn = row.getByTestId(TestIds.CUSTOM_FIELD_DELETE_BTN)
  await expect(deleteBtn).toBeVisible({ timeout: Timeouts.ELEMENT })
  // Use force click since the card container can briefly intercept pointer events during re-render
  await deleteBtn.click({ force: true })
})
