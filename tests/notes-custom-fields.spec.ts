import { test, expect, type Page } from '@playwright/test'
import { loginAsAdmin, resetTestState } from './helpers'

/**
 * End-to-end: custom fields defined in admin settings → used in notes forms.
 * Tests the full lifecycle: create field → create note with field value →
 * verify badge display → edit note → verify pre-fill → update value.
 */
test.describe('Custom Fields in Notes', () => {
  test.beforeAll(async ({ request }) => {
    await resetTestState(request)
  })

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  /** Create a text custom field via admin settings UI */
  async function createCustomTextField(page: Page, label: string) {
    await page.getByRole('link', { name: 'Hub Settings' }).click()
    await expect(page.getByRole('heading', { name: 'Hub Settings', exact: true })).toBeVisible()
    await page.getByRole('heading', { name: /custom note fields/i }).click()
    await expect(page.getByRole('button', { name: /add field/i })).toBeVisible({ timeout: 5000 })
    await page.getByRole('button', { name: /add field/i }).click()
    await page.getByPlaceholder('e.g. Severity Rating').fill(label)
    await page.getByRole('button', { name: /save/i }).last().click()
    await expect(page.getByText(/success/i)).toBeVisible({ timeout: 5000 })
  }

  test('custom fields appear in new note form', async ({ page }) => {
    await createCustomTextField(page, 'Severity')

    // Navigate to notes
    await page.getByRole('link', { name: 'Notes' }).click()
    await expect(page.getByRole('heading', { name: /call notes/i })).toBeVisible()

    // Open new note form
    await page.getByRole('button', { name: /new note/i }).click()

    // Custom field label should appear in the form
    const fieldInput = page.locator('#new-field-severity')
    await expect(fieldInput).toBeVisible()
  })

  test('create note with custom field value shows badge', async ({ page }) => {
    // Field created in previous test persists (sequential, no reset between tests)
    await page.getByRole('link', { name: 'Notes' }).click()
    await expect(page.getByRole('heading', { name: /call notes/i })).toBeVisible()

    // Create a note with custom field
    await page.getByRole('button', { name: /new note/i }).click()
    await page.locator('#call-id').fill('cf-test-' + Date.now())

    // Fill note text (first textarea in the new note form)
    await page.locator('textarea').first().fill('Note with severity field')

    // Fill the custom field
    await page.locator('#new-field-severity').fill('High')

    // Save
    await page.getByRole('button', { name: /save/i }).click()

    // Note text should appear
    await expect(page.locator('p').filter({ hasText: 'Note with severity field' })).toBeVisible()

    // Custom field value should appear as a badge
    await expect(page.getByText('Severity: High')).toBeVisible()
  })

  test('edit form shows custom fields pre-filled', async ({ page }) => {
    await page.getByRole('link', { name: 'Notes' }).click()
    await expect(page.getByRole('heading', { name: /call notes/i })).toBeVisible()

    // Badge from previous test should be visible
    await expect(page.getByText('Severity: High')).toBeVisible()

    // Click edit on the note
    await page.locator('button[aria-label="Edit"]').first().click()

    // The custom field input should be pre-filled
    const fieldInput = page.locator('#edit-field-severity')
    await expect(fieldInput).toBeVisible()
    await expect(fieldInput).toHaveValue('High')
  })

  test('can update custom field value via edit', async ({ page }) => {
    await page.getByRole('link', { name: 'Notes' }).click()
    await expect(page.getByRole('heading', { name: /call notes/i })).toBeVisible()

    // Click edit
    await page.locator('button[aria-label="Edit"]').first().click()

    // Change the field value
    const fieldInput = page.locator('#edit-field-severity')
    await fieldInput.clear()
    await fieldInput.fill('Critical')

    // Save
    await page.getByRole('button', { name: /save/i }).click()

    // Badge should show updated value
    await expect(page.getByText('Severity: Critical')).toBeVisible()
    await expect(page.getByText('Severity: High')).not.toBeVisible()
  })

  test('edit preserves note text when changing field value', async ({ page }) => {
    await page.getByRole('link', { name: 'Notes' }).click()
    await expect(page.getByRole('heading', { name: /call notes/i })).toBeVisible()

    // Click edit
    await page.locator('button[aria-label="Edit"]').first().click()

    // Verify textarea has existing text
    const textarea = page.locator('textarea').first()
    await expect(textarea).toHaveValue('Note with severity field')

    // Change field value without changing text
    const fieldInput = page.locator('#edit-field-severity')
    await fieldInput.clear()
    await fieldInput.fill('Low')
    await page.getByRole('button', { name: /save/i }).click()

    // Both text and field should be preserved
    await expect(page.locator('p').filter({ hasText: 'Note with severity field' })).toBeVisible()
    await expect(page.getByText('Severity: Low')).toBeVisible()
  })
})

test.describe('Notes Call Headers', () => {
  test.beforeAll(async ({ request }) => {
    await resetTestState(request)
  })

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('note card shows call ID in header (fallback)', async ({ page }) => {
    await page.getByRole('link', { name: 'Notes' }).click()
    await expect(page.getByRole('heading', { name: /call notes/i })).toBeVisible()

    // Create a note with a known call ID
    const callId = 'header-test-' + Date.now()
    await page.getByRole('button', { name: /new note/i }).click()
    await page.locator('#call-id').fill(callId)
    await page.locator('textarea').first().fill('Header test note')
    await page.getByRole('button', { name: /save/i }).click()
    await expect(page.locator('p').filter({ hasText: 'Header test note' })).toBeVisible()

    // Card header should show truncated call ID (fallback when call not in history)
    // The format is "Call with <first 12 chars>..."
    await expect(page.getByText(`Call with ${callId.slice(0, 12)}...`)).toBeVisible()
  })

  test('notes grouped under same call share one header', async ({ page }) => {
    await page.getByRole('link', { name: 'Notes' }).click()
    await expect(page.getByRole('heading', { name: /call notes/i })).toBeVisible()

    const callId = 'group-header-' + Date.now()

    // Create first note
    await page.getByRole('button', { name: /new note/i }).click()
    await page.locator('#call-id').fill(callId)
    await page.locator('textarea').first().fill('First grouped note')
    await page.getByRole('button', { name: /save/i }).click()
    await expect(page.locator('p').filter({ hasText: 'First grouped note' })).toBeVisible()

    // Create second note for same call
    await page.getByRole('button', { name: /new note/i }).click()
    await page.locator('#call-id').fill(callId)
    await page.locator('textarea').first().fill('Second grouped note')
    await page.getByRole('button', { name: /save/i }).click()
    await expect(page.locator('p').filter({ hasText: 'Second grouped note' })).toBeVisible()

    // Both notes should be visible under one card
    const headerText = `Call with ${callId.slice(0, 12)}...`
    const headers = page.getByText(headerText)
    await expect(headers).toHaveCount(1) // Only one header for the group
  })

  test('edit saves updated text correctly', async ({ page }) => {
    await page.getByRole('link', { name: 'Notes' }).click()
    await expect(page.getByRole('heading', { name: /call notes/i })).toBeVisible()

    // Create a note to edit
    await page.getByRole('button', { name: /new note/i }).click()
    await page.locator('#call-id').fill('edit-save-' + Date.now())
    await page.locator('textarea').first().fill('Original content')
    await page.getByRole('button', { name: /save/i }).click()
    await expect(page.locator('p').filter({ hasText: 'Original content' })).toBeVisible()

    // Edit the note
    await page.locator('button[aria-label="Edit"]').first().click()
    const editTextarea = page.locator('textarea').first()
    await editTextarea.clear()
    await editTextarea.fill('Updated content')
    await page.getByRole('button', { name: /save/i }).click()

    // Original text gone, updated text visible
    await expect(page.locator('p').filter({ hasText: 'Updated content' })).toBeVisible()
    await expect(page.locator('p').filter({ hasText: 'Original content' })).not.toBeVisible()
  })
})
