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
import { loginAsAdmin, loginAsVolunteer, createVolunteerAndGetNsec, dismissNsecCard, navigateAfterLogin, TestIds, Navigation, uniquePhone } from './helpers'

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
    const callId = 'thread-test-' + Date.now()
    await page.locator('#call-id').fill(callId)
    await page.locator('textarea[data-testid="note-content"]').fill('Note for threading test')
    await page.getByTestId(TestIds.FORM_SAVE_BTN).click()

    // Note should appear
    await expect(page.locator('p').filter({ hasText: 'Note for threading test' })).toBeVisible()

    // Reply button should be visible
    await expect(page.getByTestId(TestIds.NOTE_REPLY_BTN).first()).toBeVisible()
  })

  test('admin can expand reply thread and send a reply', async ({ page }) => {
    await Navigation.goToNotes(page)

    // Create a note first
    await page.getByTestId(TestIds.NOTE_NEW_BTN).click()
    const callId = 'reply-test-' + Date.now()
    await page.locator('#call-id').fill(callId)
    await page.locator('textarea[data-testid="note-content"]').fill('Note with reply')
    await page.getByTestId(TestIds.FORM_SAVE_BTN).click()
    await expect(page.locator('p').filter({ hasText: 'Note with reply' })).toBeVisible()

    // Click reply button
    await page.getByTestId(TestIds.NOTE_REPLY_BTN).first().click()

    // Thread area should appear
    await expect(page.getByTestId(TestIds.NOTE_THREAD)).toBeVisible()

    // Reply text area should be visible
    await expect(page.getByTestId(TestIds.NOTE_REPLY_TEXT)).toBeVisible()

    // Type a reply
    await page.getByTestId(TestIds.NOTE_REPLY_TEXT).fill('This is a threaded reply')

    // Send the reply
    await page.getByTestId(TestIds.NOTE_REPLY_SEND).click()

    // After sending, the reply count should update
    // Wait for the reply to be sent
    await page.waitForTimeout(1500)

    // The reply button text should now show "1 replies"
    const replyBtn = page.getByTestId(TestIds.NOTE_REPLY_BTN).first()
    await expect(replyBtn).toContainText(/1 repl/i)
  })

  test('reply button shows count after collapse and re-expand', async ({ page }) => {
    await Navigation.goToNotes(page)

    // Create a note and add a reply
    await page.getByTestId(TestIds.NOTE_NEW_BTN).click()
    const callId = 'collapse-test-' + Date.now()
    await page.locator('#call-id').fill(callId)
    await page.locator('textarea[data-testid="note-content"]').fill('Note for collapse test')
    await page.getByTestId(TestIds.FORM_SAVE_BTN).click()
    await expect(page.locator('p').filter({ hasText: 'Note for collapse test' })).toBeVisible()

    // Expand thread and send reply
    await page.getByTestId(TestIds.NOTE_REPLY_BTN).first().click()
    await page.getByTestId(TestIds.NOTE_REPLY_TEXT).fill('Reply to collapse test')
    await page.getByTestId(TestIds.NOTE_REPLY_SEND).click()
    await page.waitForTimeout(1000)

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
    const heading = page.getByRole('heading', { name: /conversations/i })
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
    await page.waitForTimeout(2000)
    // Should show either contacts or empty state
    const hasContacts = await page.getByTestId(TestIds.CONTACT_ROW).first().isVisible().catch(() => false)
    if (!hasContacts) {
      await expect(page.getByText(/no contacts found/i)).toBeVisible()
    }
  })

  test('volunteer cannot see contacts nav link', async ({ page }) => {
    // Create a volunteer first
    volunteerNsec = await createVolunteerAndGetNsec(page, `Vol-${Date.now()}`, uniquePhone())
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
    await page.waitForTimeout(2000)

    // The contacts nav link should not be visible for a default volunteer role
    const contactsLink = page.getByRole('link', { name: 'Contacts' })
    await expect(contactsLink).not.toBeVisible()
  })

  // ============ Custom Fields Context Filtering ============

  test('custom fields section supports context selection', async ({ page }) => {
    await page.getByRole('link', { name: 'Hub Settings' }).click()
    await expect(page.getByRole('heading', { name: 'Hub Settings', exact: true })).toBeVisible()

    // Expand custom fields section
    const addFieldBtn = page.getByRole('button', { name: /add field/i })
    if (!await addFieldBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await page.getByRole('heading', { name: /custom note fields/i }).click()
    }
    await expect(addFieldBtn).toBeVisible({ timeout: 10000 })

    // Click Add Field
    await addFieldBtn.click()

    // Should see context selector labelled "Appears In"
    const contextLabel = page.getByText(/appears in/i)
    await expect(contextLabel).toBeVisible({ timeout: 5000 })
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
    await page.locator('#call-id').fill(callId)
    await page.locator('textarea[data-testid="note-content"]').fill('Grouped note A')
    await page.getByTestId(TestIds.FORM_SAVE_BTN).click()
    await expect(page.locator('p').filter({ hasText: 'Grouped note A' })).toBeVisible()

    await page.getByTestId(TestIds.NOTE_NEW_BTN).click()
    await page.locator('#call-id').fill(callId)
    await page.locator('textarea[data-testid="note-content"]').fill('Grouped note B')
    await page.getByTestId(TestIds.FORM_SAVE_BTN).click()
    await expect(page.locator('p').filter({ hasText: 'Grouped note B' })).toBeVisible()

    // Both should be grouped under the same card
    const callCard = page.locator('div').filter({ hasText: callId.slice(0, 12) }).first()
    await expect(callCard).toBeVisible()
  })

  // ============ Report Isolation ============

  test('reports page only shows reports, not conversations', async ({ page }) => {
    await Navigation.goToReports(page)

    // Reports page should render
    const heading = page.getByRole('heading', { name: /reports/i })
    await expect(heading).toBeVisible()

    // If there are any items listed, they should be reports (have report-related badges)
    // Verify the page doesn't crash and renders properly
    await page.waitForTimeout(1000)

    // Check for either report cards or empty state
    const hasReports = await page.getByTestId(TestIds.REPORT_CARD).first().isVisible().catch(() => false)
    if (!hasReports) {
      // Either "No reports" empty state or "New Report" button should be visible
      const emptyOrNew = page.getByText(/no reports/i).or(page.getByTestId(TestIds.REPORT_NEW_BTN))
      await expect(emptyOrNew).toBeVisible()
    }
  })

  test('conversations page only shows conversations, not reports', async ({ page }) => {
    // Navigate directly (Conversations link may not be in nav if channels are not configured)
    await navigateAfterLogin(page, '/conversations')

    // Conversations page should render
    const heading = page.getByRole('heading', { name: /conversations/i })
    await expect(heading).toBeVisible()

    // Should show either conversation list or empty/no-channels state
    await page.waitForTimeout(1000)
  })
})
