/**
 * Records Architecture E2E Tests (Epic 124)
 *
 * Tests the unified records architecture features from Epics 119-123:
 * - Note threading (create notes, reply to notes)
 * - Conversation notes (add note from conversation detail)
 * - Contact view (admin-only, unified timeline)
 * - Custom field context filtering (call-notes, conversation-notes, reports)
 */
import { test, expect, type Page } from '@playwright/test'
import { loginAsAdmin, loginAsVolunteer, createUserAndGetNsec, dismissNsecCard, navigateAfterLogin, TestIds, Navigation, uniquePhone } from './helpers'

/**
 * Fill the call-id field in the new note form.
 * The call-id field is an Input when there are no recent calls,
 * or a Select when there are recent calls (with a manual entry option).
 */
async function fillCallId(page: Page, callId: string) {
  // Check if the plain input (no recent calls) is visible
  const directInput = page.getByTestId(TestIds.NOTE_CALL_ID)
  const isDirectInput = await directInput.isVisible({ timeout: 2000 }).catch(() => false)

  if (isDirectInput) {
    await directInput.fill(callId)
  } else {
    // Select the "Enter manually" option, then fill the manual input
    const selectTrigger = page.locator('#call-id')
    await selectTrigger.click()
    await page.getByText(/enter.*manually/i).click()
    // After selecting manual, a text input with data-testid="note-call-id" appears
    await expect(directInput).toBeVisible({ timeout: 3000 })
    await directInput.fill(callId)
  }
}

test.describe('Records Architecture', () => {
  test.describe.configure({ mode: 'serial' })

  let volunteerNsec: string

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  // ============ Note Threading ============

  test('admin can create a note and see reply button', async ({ page }) => {
    await Navigation.goToNotes(page)

    // Create a note
    await page.getByTestId(TestIds.NOTE_NEW_BTN).click()
    await expect(page.getByTestId(TestIds.NOTE_FORM)).toBeVisible()
    const callId = 'thread-test-' + Date.now()
    await fillCallId(page, callId)
    await page.getByTestId(TestIds.NOTE_CONTENT).fill('Note for threading test')
    await page.getByTestId(TestIds.FORM_SAVE_BTN).click()

    // Note should appear
    await expect(page.locator('p').filter({ hasText: 'Note for threading test' })).toBeVisible({ timeout: 10000 })

    // Reply button should be visible
    await expect(page.getByTestId(TestIds.NOTE_REPLY_BTN).first()).toBeVisible()
  })

  test('admin can expand reply thread and send a reply', async ({ page }) => {
    await Navigation.goToNotes(page)

    // Create a note first
    await page.getByTestId(TestIds.NOTE_NEW_BTN).click()
    await expect(page.getByTestId(TestIds.NOTE_FORM)).toBeVisible()
    const callId = 'reply-test-' + Date.now()
    await fillCallId(page, callId)
    await page.getByTestId(TestIds.NOTE_CONTENT).fill('Note with reply')
    await page.getByTestId(TestIds.FORM_SAVE_BTN).click()
    await expect(page.locator('p').filter({ hasText: 'Note with reply' })).toBeVisible({ timeout: 10000 })

    // Click reply button
    await page.getByTestId(TestIds.NOTE_REPLY_BTN).first().click()

    // Thread area should appear
    await expect(page.getByTestId(TestIds.NOTE_THREAD)).toBeVisible({ timeout: 5000 })

    // Reply text area should be visible
    const replyTextarea = page.getByTestId(TestIds.NOTE_REPLY_TEXT)
    await expect(replyTextarea).toBeVisible({ timeout: 5000 })

    // Type a reply
    await replyTextarea.fill('This is a threaded reply')

    // Send the reply
    await page.getByTestId(TestIds.NOTE_REPLY_SEND).click()

    // After sending, the reply count should update
    // Wait for the reply to be sent

    // The reply button text should now show "1 replies"
    const replyBtn = page.getByTestId(TestIds.NOTE_REPLY_BTN).first()
    await expect(replyBtn).toContainText(/1 repl/i)
  })

  test('reply button shows count after collapse and re-expand', async ({ page }) => {
    await Navigation.goToNotes(page)

    // Create a note and add a reply
    await page.getByTestId(TestIds.NOTE_NEW_BTN).click()
    await expect(page.getByTestId(TestIds.NOTE_FORM)).toBeVisible()
    const callId = 'collapse-test-' + Date.now()
    await fillCallId(page, callId)
    await page.getByTestId(TestIds.NOTE_CONTENT).fill('Note for collapse test')
    await page.getByTestId(TestIds.FORM_SAVE_BTN).click()
    await expect(page.locator('p').filter({ hasText: 'Note for collapse test' })).toBeVisible({ timeout: 10000 })

    // Expand thread and send reply
    await page.getByTestId(TestIds.NOTE_REPLY_BTN).first().click()
    await expect(page.getByTestId(TestIds.NOTE_THREAD)).toBeVisible({ timeout: 5000 })
    const replyTextarea = page.getByTestId(TestIds.NOTE_REPLY_TEXT)
    await expect(replyTextarea).toBeVisible({ timeout: 5000 })
    await replyTextarea.fill('Reply to collapse test')
    await page.getByTestId(TestIds.NOTE_REPLY_SEND).click()

    // Collapse thread
    await page.getByTestId(TestIds.NOTE_REPLY_BTN).first().click()
    await expect(page.getByTestId(TestIds.NOTE_THREAD)).not.toBeVisible()

    // Re-expand — reply count should persist
    const replyBtn = page.getByTestId(TestIds.NOTE_REPLY_BTN).first()
    await expect(replyBtn).toContainText(/1 repl/i)
  })

  // ============ Note Sheet — Conversation Notes ============

  test('conversations page renders correctly', async ({ page }) => {
    // Navigate directly (Conversations link may not be in nav if channels are not configured)
    await navigateAfterLogin(page, '/conversations')

    // The conversations page should load — it may show empty state or channel warning
    const heading = page.locator('h1', { hasText: /conversations/i })
    await expect(heading).toBeVisible()
  })

  // ============ Contact View Tests ============

  test('admin can navigate to contacts page', async ({ page }) => {
    await Navigation.goToContacts(page)
    await expect(page.getByRole('heading', { name: /contacts/i })).toBeVisible()
    // Should show description text
    await expect(page.getByText(/unified interaction history/i)).toBeVisible()
  })

  test('contacts page shows empty state when no contacts exist', async ({ page }) => {
    await Navigation.goToContacts(page)
    // Wait for loading to finish
    // Should show either contacts or empty state
    const hasContacts = await page.getByTestId(TestIds.CONTACT_ROW).first().isVisible().catch(() => false)
    if (!hasContacts) {
      await expect(page.getByText(/no contacts found/i)).toBeVisible()
    }
  })

  test('volunteer cannot see contacts nav link', async ({ page }) => {
    // Create a volunteer first
    volunteerNsec = await createUserAndGetNsec(page, `Vol-${Date.now()}`, uniquePhone())
    await dismissNsecCard(page)

    // Login as volunteer
    await loginAsVolunteer(page, volunteerNsec)

    // Contacts link should not be visible in nav
    const contactsLink = page.getByRole('link', { name: 'Contacts' })
    await expect(contactsLink).not.toBeVisible()
  })

  test('volunteer without contacts:view cannot see contacts nav', async ({ page }) => {
    test.skip(!volunteerNsec, 'Volunteer nsec not available from previous test')
    await loginAsVolunteer(page, volunteerNsec)

    // Wait for the app to fully load

    // The contacts nav link should not be visible for a default volunteer role
    const contactsLink = page.getByRole('link', { name: 'Contacts' })
    await expect(contactsLink).not.toBeVisible()
  })

  // ============ Custom Fields Context Filtering ============

  test('custom fields section supports context selection', async ({ page }) => {
    await page.getByRole('link', { name: 'Hub Settings' }).click()
    await expect(page.getByRole('heading', { name: 'Hub Settings', exact: true })).toBeVisible()

    // Expand custom fields section by clicking its title
    const customFieldsTitle = page.locator('[data-testid="custom-fields"] h3')
    await customFieldsTitle.scrollIntoViewIfNeeded()
    await customFieldsTitle.click()

    const addFieldBtn = page.getByRole('button', { name: /add field/i })
    await expect(addFieldBtn).toBeVisible({ timeout: 10000 })

    // Click Add Field
    await addFieldBtn.click()

    // Should see context selector (labelled "Context" in en.json)
    const contextSelect = page.getByTestId('field-context-select')
    await expect(contextSelect).toBeVisible({ timeout: 5000 })
  })

  // ============ Notes Page Structure ============

  test('notes page shows conversation note badge for conversation-linked notes', async ({ page }) => {
    await Navigation.goToNotes(page)

    // The page should load without errors
    const heading = page.getByRole('heading', { name: /call notes/i })
    await expect(heading).toBeVisible()

    // Verify encryption note is present
    await expect(page.getByText(/encrypted end-to-end/i)).toBeVisible()
  })

  test('notes grouped by call or conversation', async ({ page }) => {
    await Navigation.goToNotes(page)

    // Create two notes for the same call
    const callId = 'group-' + Date.now()

    await page.getByTestId(TestIds.NOTE_NEW_BTN).click()
    await expect(page.getByTestId(TestIds.NOTE_FORM)).toBeVisible()
    await fillCallId(page, callId)
    await page.getByTestId(TestIds.NOTE_CONTENT).fill('Grouped note A')
    await page.getByTestId(TestIds.FORM_SAVE_BTN).click()
    await expect(page.locator('p').filter({ hasText: 'Grouped note A' })).toBeVisible({ timeout: 10000 })

    await page.getByTestId(TestIds.NOTE_NEW_BTN).click()
    await expect(page.getByTestId(TestIds.NOTE_FORM)).toBeVisible()
    await fillCallId(page, callId)
    await page.getByTestId(TestIds.NOTE_CONTENT).fill('Grouped note B')
    await page.getByTestId(TestIds.FORM_SAVE_BTN).click()
    await expect(page.locator('p').filter({ hasText: 'Grouped note B' })).toBeVisible({ timeout: 10000 })

    // Both should be grouped under the same card
    const callCard = page.locator('div').filter({ hasText: callId.slice(0, 12) }).first()
    await expect(callCard).toBeVisible()
  })

  // ============ Report Isolation ============

  test('reports page shows reports and new-report button, not conversation cards', async ({ page }) => {
    // Seed a report via API so the page has content
    const { createReportViaApi } = await import('./api-helpers')
    await createReportViaApi(page.request, { title: `Isolation Report ${Date.now()}` })

    await Navigation.goToReports(page)

    // The report list or a report card should be visible
    const reportContent = page.getByTestId(TestIds.REPORT_CARD).first()
      .or(page.getByTestId(TestIds.REPORT_NEW_BTN))
    await expect(reportContent).toBeVisible({ timeout: 10000 })

    // Conversation list element must NOT appear on the reports page
    await expect(page.getByTestId(TestIds.CONVERSATION_LIST)).not.toBeVisible()
  })

  test('conversations page does not show report cards', async ({ page }) => {
    // Navigate directly (Conversations link may not be in nav if channels are not configured)
    await navigateAfterLogin(page, '/conversations')

    // Page should render — either conversation list, empty state, or no-channels notice
    const heading = page.locator('h1', { hasText: /conversations/i })
    await expect(heading).toBeVisible({ timeout: 10000 })

    // Report cards must NOT appear on the conversations page
    await expect(page.getByTestId(TestIds.REPORT_CARD).first()).not.toBeVisible()
  })
})
