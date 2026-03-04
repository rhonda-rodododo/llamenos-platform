# Epic 248: Desktop BDD Behavioral Recovery — Notes & Custom Fields

## Goal

Recover the behavioral depth for notes CRUD and custom fields that was lost in the BDD migration. The original `notes-crud.spec.ts` (75 lines) and `notes-custom-fields.spec.ts` (207 lines) tested full note creation with encryption verification, edit with save confirmation, custom field CRUD with badge display, and call ID grouping. The current step definitions are almost entirely presence-only checks.

## What Was Lost

### Notes CRUD (original notes-crud.spec.ts — 75 lines)
- **Create note**: Fill call-id + textarea → save → verify paragraph text appears in note card
- **Cancel creation**: Verify no note created
- **Notes grouped by call**: Two notes with same call-id → verify only one call header
- **Edit note**: Click edit → verify textarea visible with pre-filled content

### Custom Fields + Notes (original notes-custom-fields.spec.ts — 207 lines)
- **Custom fields in note form**: Create field via admin settings → navigate to notes → verify label visible
- **Create note with custom field**: Select "High" for priority → verify "Priority Level: High" badge on note card
- **Edit form pre-fills**: Open existing note edit → verify `toHaveValue('High')`
- **Update custom field**: Change "High" to "Critical" → verify old badge gone, new badge visible
- **Edit preserves text**: Change field value → verify note text unchanged
- **Note card shows call ID**: Verify truncated call ID header
- **Same-call grouping**: Two notes same call → verify single header (`toHaveCount(1)`)
- **Edit saves correctly**: Change text → save → verify new text in card

## Current State (Hollow Step Definitions)

### note-steps.ts problems:
- `at least one note exists` → EMPTY (comment: "notes should already exist")
- `I should see the full note text` → `.or()` between note sheet and note card
- `I should see the creation date` → regex for any date-like text ANYWHERE on page
- `I should see the author pubkey` → regex for any hex string on page
- `I should see the note edit button` → `.or()` fallback to page title (!!)
- `I should see the note edit input` → `.or()` fallback to note sheet
- `a copy button should be visible` → `expect(true).toBe(true)` (!!!)
- `the notes list should update` → `waitForTimeout` only
- `I should see the full notes list` → `.or()` with empty state and page title

### custom-fields-steps.ts problems:
- `custom fields are configured for notes` → EMPTY
- Steps likely don't create fields, verify badges, or check persistence

## Implementation

### Phase 1: New Feature Scenarios

The existing feature files are too shallow. Add behavioral scenarios:

**note-create.feature — expand with save + verify:**
```gherkin
  Scenario: Create and save a note
    When I fill in the call ID with "CALL-001"
    And I type "Important call about housing" in the note text field
    And I click "Save"
    Then I should see "Important call about housing" in the notes list
    And the note should show the call ID "CALL-001"

  Scenario: Create note and verify via API
    When I fill in the call ID with "CALL-API"
    And I type "API verification note" in the note text field
    And I click "Save"
    Then the note should exist in the API response

  Scenario: Cancel note creation does not save
    When I type "Should not be saved" in the note text field
    And I tap the back button
    Then I should not see "Should not be saved" in the notes list

  Scenario: Notes with same call ID share a header
    Given a note exists with call ID "CALL-GROUP"
    When I create another note with call ID "CALL-GROUP"
    Then I should see only one "CALL-GROUP" header
```

**note-edit.feature — expand with save + verify:**
```gherkin
  Scenario: Edit note text and save
    Given a note exists with text "Original content"
    When I open the note
    And I tap the note edit button
    And I change the text to "Updated content"
    And I click "Save"
    Then the note should show "Updated content"
    And the note should not show "Original content"

  Scenario: Edit preserves custom field values
    Given a note exists with custom field "Priority" set to "High"
    When I edit the note text only
    Then the "Priority" field should still show "High"
```

**notes-custom-fields.feature — expand with full CRUD:**
```gherkin
  Scenario: Create custom field via admin settings
    Given I navigate to custom fields admin
    When I add a field "Priority Level" of type "Select" with options "Low,Medium,High,Critical"
    Then the field should appear in the custom fields list

  Scenario: Note form shows custom fields
    Given a "Priority Level" custom field exists
    When I open the note creation form
    Then I should see "Priority Level" label in the form

  Scenario: Note displays custom field value as badge
    Given I create a note with "Priority Level" set to "High"
    Then the note card should show a "Priority Level: High" badge

  Scenario: Edit note updates custom field value
    Given a note with "Priority Level: High" exists
    When I edit the note and change "Priority Level" to "Critical"
    Then the note card should show "Priority Level: Critical"
    And the note card should not show "Priority Level: High"
```

### Phase 2: Rewrite Step Definitions

Replace `tests/steps/notes/note-steps.ts`:

**Key changes:**
- Remove ALL `.or()` fallback patterns
- `at least one note exists` → create a note via API or UI
- After save, verify the note text appears in the note card (scoped assertion)
- After save, verify via API that the note was persisted
- `I should see the full note text` → assert specific text content, not just visibility
- Remove `expect(true).toBe(true)` — replace with real assertion or remove step

Replace `tests/steps/notes/custom-fields-steps.ts`:

**Key changes:**
- `custom fields are configured for notes` → actually create custom field via admin settings UI or API
- Add steps for badge verification (`.toContainText('Priority Level: High')`)
- Add steps for edit form pre-fill verification (`.toHaveValue('High')`)

### Phase 3: Note Creation Flow Helpers

Add to `tests/pages/` a `NotePage` page object:

```typescript
export const NotePage = {
  async createNote(page: Page, opts: { callId?: string; text: string; customFields?: Record<string, string> }) {
    await page.getByTestId(TestIds.NOTE_NEW_BTN).click()
    if (opts.callId) {
      await page.getByTestId(TestIds.NOTE_CALL_ID).fill(opts.callId)
    }
    await page.getByTestId(TestIds.NOTE_CONTENT).fill(opts.text)
    for (const [label, value] of Object.entries(opts.customFields || {})) {
      await page.getByLabel(label).selectOption(value)
    }
    await page.getByTestId(TestIds.FORM_SAVE_BTN).click()
    await page.waitForTimeout(Timeouts.ASYNC_SETTLE)
  },

  async getNoteCards(page: Page) {
    return page.getByTestId(TestIds.NOTE_CARD).all()
  },

  async editNote(page: Page, newText: string) {
    await page.getByTestId(TestIds.NOTE_EDIT_BTN).click()
    await page.getByTestId(TestIds.NOTE_EDIT_INPUT).clear()
    await page.getByTestId(TestIds.NOTE_EDIT_INPUT).fill(newText)
    await page.getByTestId(TestIds.FORM_SAVE_BTN).click()
    await page.waitForTimeout(Timeouts.ASYNC_SETTLE)
  }
}
```

## Files Changed

| File | Action |
|------|--------|
| `tests/steps/notes/note-steps.ts` | Full rewrite — behavioral assertions |
| `tests/steps/notes/custom-fields-steps.ts` | Full rewrite — CRUD verification |
| `tests/steps/notes/note-thread-steps.ts` | Add reply persistence checks |
| `tests/pages/note-page.ts` | New — page object for note operations |
| `tests/api-helpers.ts` | Add note listing/verification helpers |
| `packages/test-specs/features/notes/note-create.feature` | Add save, cancel, grouping scenarios |
| `packages/test-specs/features/notes/note-edit.feature` | Add save+verify, custom field preservation |
| `packages/test-specs/features/notes/notes-custom-fields.feature` | Add full CRUD lifecycle scenarios |
| `packages/test-specs/features/notes/custom-fields-admin.feature` | Add field creation/deletion scenarios |

## Verification

1. Note creation saves and displays the correct text in the note card
2. Note edit changes are persisted and visible after save
3. Custom fields created via admin appear in note forms
4. Custom field values display as badges on note cards
5. Custom field edits persist after save
6. Call ID grouping shows single header for same-call notes
7. Zero `.or()` fallbacks, zero `expect(true).toBe(true)`, zero empty step bodies
8. `bun run test` passes
