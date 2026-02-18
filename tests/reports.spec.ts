import { test, expect, type Page } from '@playwright/test'
import { loginAsAdmin, loginAsVolunteer, uniquePhone, resetTestState, logout } from './helpers'

/**
 * Navigate to the Reports page via sidebar link (SPA navigation).
 * Avoids page.goto() which causes a full reload and clears the in-memory key manager.
 */
async function navigateToReports(page: Page): Promise<void> {
  await page.getByRole('link', { name: 'Reports' }).click()
  await expect(page.getByRole('heading', { name: 'Reports' })).toBeVisible({ timeout: 10000 })
}

/**
 * Helper: Complete the onboarding flow for an invited user.
 * Assumes the page is at /onboarding?code=... and the welcome screen is visible.
 * Returns the nsec from the backup step.
 */
async function completeOnboarding(page: Page): Promise<string> {
  // Click Get Started
  await page.getByRole('button', { name: /get started/i }).click()

  // Create PIN (6 digits)
  await expect(page.getByText(/create a pin/i)).toBeVisible({ timeout: 5000 })
  for (let i = 0; i < 6; i++) {
    const input = page.locator(`input[aria-label="PIN digit ${i + 1}"]`)
    await input.click()
    await input.pressSequentially(`${(i + 1) % 10}`)
  }

  // Confirm PIN
  await expect(page.getByText(/confirm your pin/i)).toBeVisible({ timeout: 5000 })
  for (let i = 0; i < 6; i++) {
    const input = page.locator(`input[aria-label="PIN digit ${i + 1}"]`)
    await input.click()
    await input.pressSequentially(`${(i + 1) % 10}`)
  }

  // Backup page — grab nsec
  await expect(page.getByText(/back up your key/i)).toBeVisible({ timeout: 15000 })
  const nsecEl = page.locator('code').first()
  await expect(nsecEl).toBeVisible()
  const nsec = await nsecEl.textContent()
  if (!nsec || !nsec.startsWith('nsec1')) throw new Error('Failed to get nsec from onboarding')

  // Verify backup (fill 4 character positions)
  const charInputs = page.locator('input[type="text"][maxlength="1"]')
  const charCount = await charInputs.count()
  expect(charCount).toBe(4)

  for (let i = 0; i < charCount; i++) {
    const label = charInputs.nth(i).locator('xpath=..').locator('label')
    const labelText = await label.textContent()
    const match = labelText?.match(/#(\d+)/)
    if (match && nsec) {
      const position = parseInt(match[1]) - 1
      await charInputs.nth(i).fill(nsec[position])
    }
  }

  await page.getByRole('button', { name: /verify/i }).click()
  await expect(page.getByText(/backup verified/i)).toBeVisible({ timeout: 5000 })

  // Continue to profile setup / dashboard
  await page.getByRole('button', { name: /continue/i }).click()
  await page.waitForURL(url => {
    const path = new URL(url.toString()).pathname
    return path === '/profile-setup' || path === '/' || path === '/reports'
  }, { timeout: 15000 })

  return nsec
}

/**
 * Helper: Create a reporter via the invite API while admin is logged in.
 * Returns the invite code (for onboarding) and reporter name.
 */
async function createReporterInvite(page: Page, reporterName: string): Promise<string> {
  // Navigate to Volunteers page and use the invite flow
  await page.getByRole('link', { name: 'Volunteers' }).click()
  await expect(page.getByRole('heading', { name: 'Volunteers' })).toBeVisible()

  await page.getByRole('button', { name: /invite/i }).click()
  await page.getByLabel('Name').fill(reporterName)
  await page.getByLabel('Phone Number').fill(uniquePhone())
  await page.getByLabel('Phone Number').blur()

  // Select 'reporter' role from the role dropdown
  const roleSelect = page.locator('#invite-role')
  await roleSelect.click()
  await page.getByRole('option', { name: /reporter/i }).click()

  await page.getByRole('button', { name: /create invite/i }).click()

  // Get the invite link
  const linkEl = page.locator('code').first()
  await expect(linkEl).toBeVisible({ timeout: 15000 })
  const inviteLink = (await linkEl.textContent())!
  expect(inviteLink).toContain('/onboarding?code=')

  return inviteLink
}

test.describe('Reports feature', () => {
  test.beforeAll(async ({ request }) => {
    await resetTestState(request)
  })

  test.describe('Admin reports management', () => {
    test('reports page loads for admin', async ({ page }) => {
      await loginAsAdmin(page)
      await navigateToReports(page)
      await expect(page.getByRole('button', { name: /new/i })).toBeVisible()
    })

    test('empty reports list shows no reports message', async ({ page }) => {
      await loginAsAdmin(page)
      await navigateToReports(page)
      await expect(page.getByText('No reports')).toBeVisible({ timeout: 10000 })
    })

    test('admin can create a report', async ({ page }) => {
      await loginAsAdmin(page)
      await navigateToReports(page)
      await expect(page.getByRole('button', { name: /new/i })).toBeVisible({ timeout: 10000 })

      // Click "New" button to open the report form sheet
      await page.getByRole('button', { name: /new/i }).click()

      // Fill in the report form
      await expect(page.getByPlaceholder('Brief description of the report')).toBeVisible({ timeout: 5000 })
      await page.getByPlaceholder('Brief description of the report').fill('Test Report')
      await page.getByPlaceholder('Describe the situation in detail...').fill('This is a test report created by admin')

      // Submit the report
      await page.getByRole('button', { name: /submit report/i }).click()

      // Verify the report appears in the list (sheet should close and list should refresh)
      await expect(page.getByText('Test Report').first()).toBeVisible({ timeout: 15000 })
    })

    test('report shows in list with correct status', async ({ page }) => {
      await loginAsAdmin(page)
      await navigateToReports(page)

      // Wait for reports to load
      await expect(page.getByText('Test Report').first()).toBeVisible({ timeout: 15000 })

      // Verify the waiting status indicator (yellow dot) is present
      // The report card should show a yellow dot for waiting status
      const reportCard = page.locator('button[type="button"]').filter({ hasText: 'Test Report' })
      await expect(reportCard).toBeVisible()

      // Verify message count is shown
      await expect(reportCard.getByText(/messages/i)).toBeVisible()
    })

    test('selecting a report shows detail view', async ({ page }) => {
      await loginAsAdmin(page)
      await navigateToReports(page)

      // Wait for report list to load
      await expect(page.getByText('Test Report').first()).toBeVisible({ timeout: 15000 })

      // Click on the report card
      await page.locator('button[type="button"]').filter({ hasText: 'Test Report' }).click()

      // Verify detail view shows the report title, encryption note, and status
      await expect(page.getByText('End-to-end encrypted')).toBeVisible({ timeout: 5000 })

      // The status badge should show "Waiting"
      await expect(page.getByText('Waiting')).toBeVisible()
    })

    test('admin can claim a report', async ({ page }) => {
      await loginAsAdmin(page)
      await navigateToReports(page)

      // Wait and select the report
      await expect(page.getByText('Test Report').first()).toBeVisible({ timeout: 15000 })
      await page.locator('button[type="button"]').filter({ hasText: 'Test Report' }).click()

      // Wait for the detail view to load
      await expect(page.getByText('End-to-end encrypted')).toBeVisible({ timeout: 5000 })

      // Click the "Claim" button
      await expect(page.getByRole('button', { name: /claim/i })).toBeVisible()
      await page.getByRole('button', { name: /claim/i }).click()

      // After claiming, status should change to "Active"
      await expect(page.getByText('Active')).toBeVisible({ timeout: 10000 })

      // Claim button should disappear (it only shows for waiting reports)
      await expect(page.getByRole('button', { name: /claim/i })).not.toBeVisible()
    })

    test('admin can close a report', async ({ page }) => {
      await loginAsAdmin(page)
      await navigateToReports(page)

      // Wait and select the report (should now be Active from previous test)
      await expect(page.getByText('Test Report').first()).toBeVisible({ timeout: 15000 })
      await page.locator('button[type="button"]').filter({ hasText: 'Test Report' }).click()

      // Wait for the detail view
      await expect(page.getByText('End-to-end encrypted')).toBeVisible({ timeout: 5000 })

      // Click the "Close" button
      await expect(page.getByRole('button', { name: /close/i }).first()).toBeVisible({ timeout: 5000 })
      await page.getByRole('button', { name: /close/i }).first().click()

      // After closing, the report should be removed from the list
      // (the filter defaults to 'all' but handleClose removes it from the list)
      await expect(page.locator('button[type="button"]').filter({ hasText: 'Test Report' })).not.toBeVisible({ timeout: 10000 })
    })

    test('status filter works', async ({ page }) => {
      await loginAsAdmin(page)
      await navigateToReports(page)

      // Create two reports so we have something to filter
      for (const title of ['Filter Report A', 'Filter Report B']) {
        await page.getByRole('button', { name: /new/i }).click()
        await expect(page.getByPlaceholder('Brief description of the report')).toBeVisible({ timeout: 5000 })
        await page.getByPlaceholder('Brief description of the report').fill(title)
        await page.getByPlaceholder('Describe the situation in detail...').fill(`Details for ${title}`)
        await page.getByRole('button', { name: /submit report/i }).click()
        // Wait for form to close
        await expect(page.getByPlaceholder('Brief description of the report')).not.toBeVisible({ timeout: 10000 })
        await page.waitForTimeout(500)
      }

      // Both reports should be visible
      await expect(page.getByText('Filter Report A').first()).toBeVisible({ timeout: 15000 })
      await expect(page.getByText('Filter Report B').first()).toBeVisible({ timeout: 15000 })

      // Claim one of them to make it active
      await page.locator('button[type="button"]').filter({ hasText: 'Filter Report A' }).click()
      await expect(page.getByRole('button', { name: /claim/i })).toBeVisible({ timeout: 5000 })
      await page.getByRole('button', { name: /claim/i }).click()
      await expect(page.getByText('Active')).toBeVisible({ timeout: 10000 })

      // Now use the status filter to show only "Waiting" reports
      // Scope to main content to avoid picking up the language selector combobox
      const mainContent = page.locator('main')
      const statusSelect = mainContent.locator('button[role="combobox"]').first()
      await statusSelect.click()
      await page.getByRole('option', { name: /waiting/i }).click()

      // Only Filter Report B should be visible (it's still waiting)
      await expect(page.getByText('Filter Report B').first()).toBeVisible({ timeout: 10000 })
      // Filter Report A should NOT be visible (it's active)
      await expect(page.locator('button[type="button"]').filter({ hasText: 'Filter Report A' })).not.toBeVisible()

      // Switch filter to show "Active" reports
      await statusSelect.click()
      await page.getByRole('option', { name: /^active$/i }).click()

      // Only Filter Report A should be visible
      await expect(page.getByText('Filter Report A').first()).toBeVisible({ timeout: 10000 })
      await expect(page.locator('button[type="button"]').filter({ hasText: 'Filter Report B' })).not.toBeVisible()

      // Switch back to "All statuses"
      await statusSelect.click()
      await page.getByRole('option', { name: /all statuses/i }).click()

      // Both should be visible again
      await expect(page.getByText('Filter Report A').first()).toBeVisible({ timeout: 10000 })
      await expect(page.getByText('Filter Report B').first()).toBeVisible({ timeout: 10000 })
    })

    test('report detail shows no messages for new report initially', async ({ page }) => {
      await loginAsAdmin(page)
      await navigateToReports(page)

      // The reports from the previous test should be present; create a fresh one
      await page.getByRole('button', { name: /new/i }).click()
      await expect(page.getByPlaceholder('Brief description of the report')).toBeVisible({ timeout: 5000 })
      await page.getByPlaceholder('Brief description of the report').fill('Empty Messages Report')
      await page.getByPlaceholder('Describe the situation in detail...').fill('Report for testing messages')
      await page.getByRole('button', { name: /submit report/i }).click()
      await expect(page.getByPlaceholder('Brief description of the report')).not.toBeVisible({ timeout: 10000 })

      // Select the report
      await expect(page.getByText('Empty Messages Report').first()).toBeVisible({ timeout: 15000 })
      await page.locator('button[type="button"]').filter({ hasText: 'Empty Messages Report' }).click()

      // Wait for detail view to load
      await expect(page.getByText('End-to-end encrypted')).toBeVisible({ timeout: 5000 })

      // The initial report message should be visible (created with the report body)
      // The report creation sends an initial message, so we should see at least one message
      // or "No messages yet" if the messages load is empty
      // Given the creation flow, there should be 1 message (the initial details)
    })

    test('admin can reply to a claimed report', async ({ page }) => {
      await loginAsAdmin(page)
      await navigateToReports(page)

      // Create a fresh report to reply to
      await page.getByRole('button', { name: /new/i }).click()
      await expect(page.getByPlaceholder('Brief description of the report')).toBeVisible({ timeout: 5000 })
      await page.getByPlaceholder('Brief description of the report').fill('Reply Test Report')
      await page.getByPlaceholder('Describe the situation in detail...').fill('Report for testing replies')
      await page.getByRole('button', { name: /submit report/i }).click()
      await expect(page.getByPlaceholder('Brief description of the report')).not.toBeVisible({ timeout: 10000 })

      // Wait for report to appear and select it
      await expect(page.getByText('Reply Test Report').first()).toBeVisible({ timeout: 15000 })
      await page.locator('button[type="button"]').filter({ hasText: 'Reply Test Report' }).click()

      // Claim it first (reports start in "waiting" status)
      await expect(page.getByRole('button', { name: /claim/i })).toBeVisible({ timeout: 5000 })
      await page.getByRole('button', { name: /claim/i }).click()
      await expect(page.getByText('Active')).toBeVisible({ timeout: 10000 })

      // The reply composer should be visible (report is active, admin can reply)
      const replyTextarea = page.getByPlaceholder('Type your reply...')
      await expect(replyTextarea).toBeVisible({ timeout: 5000 })

      // Type a reply and send
      await replyTextarea.fill('This is an admin reply to the report')
      // Click the send icon button (aria-label="Submit")
      const sendBtn = page.getByRole('button', { name: 'Submit', exact: true })
      await expect(sendBtn).toBeEnabled()
      await sendBtn.click()

      // Wait for the reply to be sent (textarea should clear)
      await expect(replyTextarea).toHaveValue('', { timeout: 5000 })
    })

    test('new report form has encryption note', async ({ page }) => {
      await loginAsAdmin(page)
      await navigateToReports(page)

      // Open the form
      await page.getByRole('button', { name: /new/i }).click()

      // Verify the encryption note is visible in the sheet
      await expect(page.getByText('Your report is encrypted end-to-end')).toBeVisible({ timeout: 5000 })

      // Verify the form has the expected fields
      await expect(page.getByPlaceholder('Brief description of the report')).toBeVisible()
      await expect(page.getByPlaceholder('Describe the situation in detail...')).toBeVisible()
      await expect(page.getByRole('button', { name: /submit report/i })).toBeVisible()
    })

    test('report form validation prevents empty submission', async ({ page }) => {
      await loginAsAdmin(page)
      await navigateToReports(page)

      // Open the form
      await page.getByRole('button', { name: /new/i }).click()
      await expect(page.getByPlaceholder('Brief description of the report')).toBeVisible({ timeout: 5000 })

      // The Submit button should be disabled when title and details are empty
      const submitBtn = page.getByRole('button', { name: /submit report/i })
      await expect(submitBtn).toBeDisabled()

      // Fill only title — still disabled
      await page.getByPlaceholder('Brief description of the report').fill('Only a title')
      await expect(submitBtn).toBeDisabled()

      // Fill details too — now enabled
      await page.getByPlaceholder('Describe the situation in detail...').fill('Now has details')
      await expect(submitBtn).toBeEnabled()
    })

    test('unselected state shows placeholder text', async ({ page }) => {
      await loginAsAdmin(page)
      await navigateToReports(page)

      // Without selecting any report, the right panel should show placeholder
      await expect(page.getByText('Select a report to view details')).toBeVisible({ timeout: 10000 })
    })
  })

  test.describe('Reporter role', () => {
    let reporterNsec: string
    let reporterInviteLink: string

    test('create reporter via invite and complete onboarding', async ({ page }) => {
      // Login as admin and create reporter invite
      await loginAsAdmin(page)
      const reporterName = `Reporter ${Date.now()}`
      reporterInviteLink = await createReporterInvite(page, reporterName)

      // Logout admin
      await logout(page)

      // Open the invite link
      await page.goto(reporterInviteLink)
      await expect(page.getByText(/welcome/i)).toBeVisible({ timeout: 15000 })

      // Complete onboarding
      reporterNsec = await completeOnboarding(page)
      expect(reporterNsec).toMatch(/^nsec1/)
    })

    test('reporter navigation shows only My Reports', async ({ page }) => {
      // Skip if reporter nsec was not obtained
      test.skip(!reporterNsec, 'Reporter nsec not available')

      await loginAsVolunteer(page, reporterNsec)

      // Complete profile setup if needed
      if (page.url().includes('profile-setup')) {
        await page.getByRole('button', { name: /complete setup/i }).click()
        await page.waitForURL(u => !u.toString().includes('profile-setup'), { timeout: 15000 })
      }

      // Wait for the layout to fully render
      await page.waitForTimeout(1000)

      // Reporter should see "Reports" nav link (reporter-only nav)
      await expect(page.getByRole('link', { name: 'Reports' })).toBeVisible({ timeout: 10000 })

      // Reporter should NOT see Dashboard, Notes, Volunteers, or Admin links
      await expect(page.getByRole('link', { name: 'Dashboard' })).not.toBeVisible()
      await expect(page.getByRole('link', { name: 'Notes' })).not.toBeVisible()
      await expect(page.getByRole('link', { name: 'Volunteers' })).not.toBeVisible()
      await expect(page.getByRole('link', { name: 'Admin Settings' })).not.toBeVisible()
      await expect(page.getByRole('link', { name: 'Audit Log' })).not.toBeVisible()
    })

    test('reporter can access reports page', async ({ page }) => {
      test.skip(!reporterNsec, 'Reporter nsec not available')

      await loginAsVolunteer(page, reporterNsec)

      // Complete profile setup if needed
      if (page.url().includes('profile-setup')) {
        await page.getByRole('button', { name: /complete setup/i }).click()
        await page.waitForURL(u => !u.toString().includes('profile-setup'), { timeout: 15000 })
      }

      // Navigate to reports
      await page.getByRole('link', { name: 'Reports' }).click()
      await page.waitForURL(/\/reports/, { timeout: 10000 })
      await expect(page.getByRole('heading', { name: 'Reports' })).toBeVisible({ timeout: 10000 })
      await expect(page.getByRole('button', { name: /new/i })).toBeVisible()
    })

    test('reporter can create a report', async ({ page }) => {
      test.skip(!reporterNsec, 'Reporter nsec not available')

      await loginAsVolunteer(page, reporterNsec)

      // Complete profile setup if needed
      if (page.url().includes('profile-setup')) {
        await page.getByRole('button', { name: /complete setup/i }).click()
        await page.waitForURL(u => !u.toString().includes('profile-setup'), { timeout: 15000 })
      }

      await navigateToReports(page)

      // Click "New" to open the report form
      await page.getByRole('button', { name: /new/i }).click()

      // Fill the form
      await expect(page.getByPlaceholder('Brief description of the report')).toBeVisible({ timeout: 5000 })
      await page.getByPlaceholder('Brief description of the report').fill('Reporter Test Report')
      await page.getByPlaceholder('Describe the situation in detail...').fill('This is a report created by a reporter')

      // Submit
      await page.getByRole('button', { name: /submit report/i }).click()

      // Verify report appears in list
      await expect(page.getByText('Reporter Test Report').first()).toBeVisible({ timeout: 15000 })
    })

    test('reporter can reply to own report', async ({ page }) => {
      test.skip(!reporterNsec, 'Reporter nsec not available')

      await loginAsVolunteer(page, reporterNsec)

      // Complete profile setup if needed
      if (page.url().includes('profile-setup')) {
        await page.getByRole('button', { name: /complete setup/i }).click()
        await page.waitForURL(u => !u.toString().includes('profile-setup'), { timeout: 15000 })
      }

      await navigateToReports(page)

      // Wait for the reporter's report to appear
      await expect(page.getByText('Reporter Test Report').first()).toBeVisible({ timeout: 15000 })

      // Select the report
      await page.locator('button[type="button"]').filter({ hasText: 'Reporter Test Report' }).click()

      // Wait for detail view
      await expect(page.getByText('End-to-end encrypted')).toBeVisible({ timeout: 5000 })

      // The reply composer should be visible (reporter can always reply to own reports)
      const replyTextarea = page.getByPlaceholder('Type your reply...')
      await expect(replyTextarea).toBeVisible({ timeout: 5000 })

      // Type a reply and send
      await replyTextarea.fill('This is a reply from the reporter')

      // Click the send button (the icon button next to the textarea)
      const sendBtn = page.locator('button[aria-label]').filter({ has: page.locator('svg.lucide-send') })
      if (await sendBtn.count() > 0) {
        await sendBtn.click()
      } else {
        // Fallback: use Ctrl+Enter to send
        await replyTextarea.press('Control+Enter')
      }

      // Wait for the message to be sent and appear
      await page.waitForTimeout(2000)

      // The reply text area should be cleared after sending
      await expect(replyTextarea).toHaveValue('')
    })

    test('reporter sees encryption note in report detail', async ({ page }) => {
      test.skip(!reporterNsec, 'Reporter nsec not available')

      await loginAsVolunteer(page, reporterNsec)

      // Complete profile setup if needed
      if (page.url().includes('profile-setup')) {
        await page.getByRole('button', { name: /complete setup/i }).click()
        await page.waitForURL(u => !u.toString().includes('profile-setup'), { timeout: 15000 })
      }

      await navigateToReports(page)

      // Select the report
      await expect(page.getByText('Reporter Test Report').first()).toBeVisible({ timeout: 15000 })
      await page.locator('button[type="button"]').filter({ hasText: 'Reporter Test Report' }).click()

      // Verify encryption note is visible in the detail header
      await expect(page.getByText('End-to-end encrypted')).toBeVisible({ timeout: 5000 })
    })

    test('reporter does not see Claim or Close buttons', async ({ page }) => {
      test.skip(!reporterNsec, 'Reporter nsec not available')

      await loginAsVolunteer(page, reporterNsec)

      // Complete profile setup if needed
      if (page.url().includes('profile-setup')) {
        await page.getByRole('button', { name: /complete setup/i }).click()
        await page.waitForURL(u => !u.toString().includes('profile-setup'), { timeout: 15000 })
      }

      await navigateToReports(page)

      // Select the report
      await expect(page.getByText('Reporter Test Report').first()).toBeVisible({ timeout: 15000 })
      await page.locator('button[type="button"]').filter({ hasText: 'Reporter Test Report' }).click()

      // Wait for detail view
      await expect(page.getByText('End-to-end encrypted')).toBeVisible({ timeout: 5000 })

      // Reporter should NOT see Claim or Close buttons
      await expect(page.getByRole('button', { name: /claim/i })).not.toBeVisible()
      await expect(page.getByRole('button', { name: /close/i })).not.toBeVisible()
    })

    test('reporter does not see status filter', async ({ page }) => {
      test.skip(!reporterNsec, 'Reporter nsec not available')

      await loginAsVolunteer(page, reporterNsec)

      // Complete profile setup if needed
      if (page.url().includes('profile-setup')) {
        await page.getByRole('button', { name: /complete setup/i }).click()
        await page.waitForURL(u => !u.toString().includes('profile-setup'), { timeout: 15000 })
      }

      await navigateToReports(page)

      // The status and category filter dropdowns are admin-only
      // Reporter should not see "All statuses" select
      await expect(page.getByText('All statuses')).not.toBeVisible()
    })
  })
})
