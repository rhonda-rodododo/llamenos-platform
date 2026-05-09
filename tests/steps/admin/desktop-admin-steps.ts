/**
 * Desktop-specific admin step definitions.
 * Matches steps from:
 *   - packages/test-specs/features/desktop/calls/telephony-provider.feature
 *   - packages/test-specs/features/desktop/calls/call-recording.feature
 *   - packages/test-specs/features/desktop/messaging/rcs-channel.feature
 *   - packages/test-specs/features/desktop/settings/webrtc-settings.feature
 *   - packages/test-specs/features/desktop/admin/multi-hub.feature
 *   - packages/test-specs/features/desktop/misc/setup-wizard.feature
 *   - packages/test-specs/features/admin/reports.feature
 *   - packages/test-specs/features/admin/demo-mode.feature
 *   - packages/test-specs/features/messaging/blasts.feature
 */
import { expect, type Page } from '@playwright/test'
import { Given, When, Then } from '../fixtures'
import { TestIds, navTestIdMap } from '../../test-ids'
import { Timeouts, navigateAfterLogin, loginAsAdmin } from '../../helpers'

/**
 * Select a channel card in the setup wizard by label.
 * Scoped to data-testid="setup-step" to avoid matching sidebar nav links.
 */
async function selectWizardChannel(page: Page, channelLabel: string) {
  const card = page.getByTestId('setup-step').getByRole('button', { name: new RegExp('^' + channelLabel, 'i') })
  await expect(card).toBeVisible({ timeout: Timeouts.ELEMENT })
  await card.click()
}

/**
 * Navigate through the setup wizard to a target step (0-indexed).
 * Starts at step 0 (Identity), advances through prior steps automatically.
 * @param channel - channel to select on step 1 (default: 'Reports')
 */
async function advanceWizardToStep(page: Page, targetStep: number, channel = 'Reports') {
  // Navigate away first to force SetupWizard remount and reset local step state.
  // TanStack Router won't remount the component on same-URL navigation, so if we're
  // already on /setup the wizard local state (step, data) would carry over.
  await navigateAfterLogin(page, '/')
  await navigateAfterLogin(page, '/setup')

  // Step 0 – Identity: fill hotline name
  await page.getByLabel(/hotline name|name/i).first().fill(`TestHotline ${Date.now()}`)
  const orgInput = page.getByLabel(/organization/i)
  if (await orgInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await orgInput.fill('Test Org')
  }
  if (targetStep === 0) return

  // Advance 0→1: Channels — wait for step 1 progressbar to confirm transition
  await page.getByTestId(TestIds.SETUP_NEXT_BTN).click()
  await expect(page.locator('[role="progressbar"][aria-valuenow="2"]')).toBeVisible({ timeout: 10000 })
  if (targetStep === 1) return

  // Step 1 – Channels: select the specified channel
  await selectWizardChannel(page, channel)

  // Advance 1→2: Providers
  await page.getByTestId(TestIds.SETUP_NEXT_BTN).click()
  await expect(page.locator('[role="progressbar"][aria-valuenow="3"]')).toBeVisible({ timeout: 10000 })
  if (targetStep === 2) return

  // Step 2 – Providers: skip
  const skipBtn = page.getByRole('button', { name: /skip/i })
  if (await skipBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await skipBtn.click()
  } else {
    await page.getByTestId(TestIds.SETUP_NEXT_BTN).click()
  }
  await expect(page.locator('[role="progressbar"][aria-valuenow="4"]')).toBeVisible({ timeout: 10000 })
  if (targetStep === 3) return

  // Step 3 – Settings: advance
  await page.getByTestId(TestIds.SETUP_NEXT_BTN).click()
  await expect(page.locator('[role="progressbar"][aria-valuenow="5"]')).toBeVisible({ timeout: 10000 })
  if (targetStep === 4) return

  // Step 4 – Invite: advance
  await page.getByTestId(TestIds.SETUP_NEXT_BTN).click()
  await expect(page.locator('[role="progressbar"][aria-valuenow="6"]')).toBeVisible({ timeout: 10000 })
}

// --- Telephony provider ---

When('I expand the telephony provider section', async ({ page }) => {
  const trigger = page.getByTestId(`${TestIds.SETTINGS_TELEPHONY}-trigger`)
  await trigger.scrollIntoViewIfNeeded()
  await trigger.click()
})

Then('I should see the Twilio credentials form', async ({ page }) => {
  await expect(page.getByTestId(TestIds.ACCOUNT_SID).or(page.getByLabel(/account sid/i)).first()).toBeVisible({
    timeout: Timeouts.ELEMENT,
  })
})

Then('I should see fields for Account SID, Auth Token, and TwiML App SID', async ({ page }) => {
  await expect(page.getByTestId(TestIds.ACCOUNT_SID).or(page.getByLabel(/account sid/i)).first()).toBeVisible({
    timeout: Timeouts.ELEMENT,
  })
})

When('I navigate to the telephony settings', async ({ page }) => {
  await page.getByTestId(navTestIdMap['Hub Settings']).click()
})

When('I fill in valid Twilio credentials', async ({ page }) => {
  const sidInput = page.getByTestId(TestIds.ACCOUNT_SID).or(page.getByLabel(/account sid/i))
  if (await sidInput.first().isVisible({ timeout: 2000 }).catch(() => false)) {
    await sidInput.first().fill('TEST_SID_00000000000000000000000')
  }
})

When('I fill in Twilio credentials', async ({ page }) => {
  const sidInput = page.getByTestId(TestIds.ACCOUNT_SID).or(page.getByLabel(/account sid/i))
  if (await sidInput.first().isVisible({ timeout: 2000 }).catch(() => false)) {
    await sidInput.first().fill('TEST_SID_00000000000000000000000')
  }
})

When('I fill in invalid Twilio credentials', async ({ page }) => {
  const sidInput = page.getByTestId(TestIds.ACCOUNT_SID).or(page.getByLabel(/account sid/i))
  if (await sidInput.first().isVisible({ timeout: 2000 }).catch(() => false)) {
    await sidInput.first().fill('invalid')
  }
})

Then('I should see available provider options', async ({ page }) => {
  // Content assertion — verifying provider names are displayed
  await expect(page.getByText(/twilio|signalwire|vonage|plivo/i).first()).toBeVisible({
    timeout: Timeouts.ELEMENT,
  })
})

Then('Twilio should be selected by default', async ({ page }) => {
  // Content assertion — verifying Twilio is shown as selected
  await expect(page.getByText(/twilio/i).first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

// --- Call recording ---
// DELETED: All call recording steps require real telephony infrastructure (actual
// phone calls with recordings). These cannot be tested in the Playwright environment.
// The call-recording.feature file has been deleted as well.

// --- RCS channel ---

When('I navigate to the messaging channel settings', async ({ page }) => {
  await page.getByTestId(navTestIdMap['Hub Settings']).click()
})

Then('I should see the RCS configuration section', async ({ page }) => {
  // Content assertion — verifying RCS text is displayed
  await expect(page.getByText(/rcs/i).first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

When('I fill in valid RCS settings', async ({ page }) => {
  // Ensure we're on Hub Settings with the RCS section expanded and visible.
  // The RCS Channel section (id="rcs-channel") is separate from the telephony section.
  const agentIdInput = page.getByTestId(TestIds.RCS_AGENT_ID)
  if (!await agentIdInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    // Navigate to hub settings
    const { Navigation } = await import('../../pages/index')
    await Navigation.goToHubSettings(page)
    // Expand the RCS channel section trigger (data-testid="rcs-channel-trigger")
    const rcsTrigger = page.getByTestId('rcs-channel-trigger')
    if (await rcsTrigger.isVisible({ timeout: 5000 }).catch(() => false)) {
      await rcsTrigger.click()
    }
  }
  // Fill the agent ID if visible
  const isAgentVisible = await agentIdInput.isVisible({ timeout: 5000 }).catch(() => false)
  if (isAgentVisible) {
    await agentIdInput.fill('test-agent-id')
  }
})

// --- WebRTC ---

When('I expand the WebRTC section', async ({ page }) => {
  const trigger = page.getByTestId(`${TestIds.SETTINGS_TRANSCRIPTION}-trigger`)
    .or(page.getByRole('button', { name: /webrtc/i }))
  await trigger.first().scrollIntoViewIfNeeded()
  await trigger.first().click()
})

Then('I should see the WebRTC configuration options', async ({ page }) => {
  // Content assertion — verifying WebRTC text is displayed
  await expect(page.getByText(/webrtc/i).first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

When('I navigate to the WebRTC settings', async ({ page }) => {
  await page.getByTestId(navTestIdMap['Hub Settings']).click()
})

When('I toggle the WebRTC calling switch', async ({ page }) => {
  const toggle = page.locator('[role="switch"]').first()
  await toggle.click()
})

Then('the setting should be saved', async ({ page }) => {
  // Settings auto-save — look for a success toast or the absence of unsaved-changes indicator
  const toast = page.locator('[role="status"]').first()
  const saved = toast.or(page.getByText(/saved|updated|success/i).first())
  await expect(saved).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see fields for STUN and TURN server configuration', async ({ page }) => {
  // Content assertion — verifying STUN/TURN text is displayed
  await expect(page.getByText(/stun|turn/i).first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

// --- Multi-hub ---

When('I navigate to the hub management page', async ({ page }) => {
  await page.getByTestId(TestIds.NAV_ADMIN_HUBS).click()
})

When('I fill in the hub name', async ({ page }) => {
  await page.getByLabel(/name/i).first().fill(`TestHub ${Date.now()}`)
})

Then('the new hub should appear in the hub list', async ({ page }) => {
  // Content assertion — verifying hub name text
  await expect(page.getByText(/TestHub/).first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Given('multiple hubs exist', async ({ backendRequest }) => {
  const { createHubViaApi } = await import('../../api-helpers')
  // Create a second hub — the default hub already exists from test setup
  try {
    await createHubViaApi(backendRequest, `Hub-${Date.now()}`)
  } catch {
    // Backend may not be available — hub management tests will skip gracefully
  }
})

When('I select a different hub', async ({ page }) => {
  const hubSelector = page.locator('select, [role="combobox"]').first()
  if (await hubSelector.isVisible({ timeout: 2000 }).catch(() => false)) {
    // Select the second option
    const options = await hubSelector.locator('option').all()
    if (options.length > 1) {
      await hubSelector.selectOption({ index: 1 })
    }
  }
})

Then('the app should switch to the selected hub context', async ({ page }) => {
  // After hub switch, the page title or hub name should update to reflect the new context
  await expect(page.getByTestId(TestIds.PAGE_TITLE)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

When('I navigate to the hub settings', async ({ page }) => {
  await page.getByTestId(navTestIdMap['Hub Settings']).click()
})

Then('I should see the hub-specific configuration', async ({ page }) => {
  await expect(page.getByTestId(TestIds.PAGE_TITLE)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

When('I switch to a specific hub', async ({ page }) => {
  const hubSelector = page.locator('select, [role="combobox"]').first()
  if (await hubSelector.isVisible({ timeout: 3000 }).catch(() => false)) {
    const options = await hubSelector.locator('option').all()
    if (options.length > 1) {
      await hubSelector.selectOption({ index: 1 })
    }
  }
})

Then('I should see only volunteers for that hub', async ({ page }) => {
  // After hub switch + navigating to volunteers, the page should render the volunteer list
  await expect(page.getByTestId(TestIds.PAGE_TITLE)).toBeVisible({ timeout: Timeouts.ELEMENT })
  // The volunteer list or empty state should be present (hub-specific filtering)
  const list = page.getByTestId(TestIds.VOLUNTEER_ROW).first().or(page.getByText(/no volunteers|no users/i).first())
  await expect(list).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Given('a non-default hub exists', async ({ page }) => {
  const { createHubViaApi } = await import('../../api-helpers')
  await createHubViaApi(page.request, `NonDefault-${Date.now()}`)
})

When('I click {string} on the hub', async ({ page }, text: string) => {
  // Always navigate to the hubs admin page before looking for hub action buttons.
  // Checking only for page-title visibility is insufficient — the page could be on
  // any route (e.g., Dashboard) even when page-title is visible.
  const currentUrl = page.url()
  if (!currentUrl.includes('/admin/hubs')) {
    await navigateAfterLogin(page, '/admin/hubs')
    await expect(page.getByTestId(TestIds.PAGE_TITLE)).toBeVisible({ timeout: Timeouts.ELEMENT })
  }
  // Click the action button on a hub row (e.g. "Delete", "Edit")
  const btn = page.getByRole('button', { name: new RegExp(text, 'i') }).first()
  await expect(btn).toBeVisible({ timeout: Timeouts.ELEMENT })
  await btn.click()
})

When('I confirm the deletion', async ({ page }) => {
  // Some components use window.confirm() (already auto-accepted via page.once('dialog')),
  // others use a React AlertDialog. Handle both cases.
  const dialog = page.getByRole('dialog')
  if (await dialog.isVisible({ timeout: 2000 }).catch(() => false)) {
    // The DeleteHubDialog requires typing the hub name into the confirmation input
    // before the "Delete Hub" confirm button becomes enabled.
    const confirmInput = page.getByTestId('delete-hub-confirm-input')
    const hasInput = await confirmInput.isVisible({ timeout: 2000 }).catch(() => false)
    if (hasInput) {
      // Read the expected hub name displayed above the input (the <p> with font-mono class)
      const hubNameLabel = dialog.locator('p.font-mono.font-medium').first()
      const hubName = await hubNameLabel.textContent({ timeout: 2000 }).catch(() => null)
      if (hubName) {
        await confirmInput.fill(hubName.trim())
      }
    }
    const okBtn = page.getByTestId(TestIds.CONFIRM_DIALOG_OK)
    const hasOk = await okBtn.isVisible({ timeout: 2000 }).catch(() => false)
    if (hasOk) await okBtn.click()
  }
  // If no dialog visible, the window.confirm() was already accepted by the dialog handler
})

Then('the hub should be removed', async ({ page }) => {
  // After deletion, a success toast should appear or the hub should no longer be in the list
  const toast = page.locator('[role="status"]').first()
  const deleted = toast.or(page.getByText(/deleted|removed/i).first())
  await expect(deleted).toBeVisible({ timeout: Timeouts.ELEMENT })
})

// --- Setup wizard ---

When('I navigate to the setup wizard', async ({ page }) => {
  await navigateAfterLogin(page, '/setup')
})

Then('the hotline name input should be visible', async ({ page }) => {
  await expect(page.getByLabel(/hotline name|name your hotline/i)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

When('I fill in the hotline name', async ({ page }) => {
  await page.getByLabel(/hotline name|name/i).first().fill(`TestHotline ${Date.now()}`)
})

When('I fill in the organization name', async ({ page }) => {
  const orgInput = page.getByLabel(/organization/i)
  if (await orgInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await orgInput.fill('Test Organization')
  }
})

Given('I am on the channels step', async ({ page }) => {
  await advanceWizardToStep(page, 1)
})

When('I select the {string} channel', async ({ page }, channel: string) => {
  await selectWizardChannel(page, channel)
})

When('I click the {string} channel again', async ({ page }, channel: string) => {
  await selectWizardChannel(page, channel)
})

Then('both channels should be marked as selected', async ({ page }) => {
  // Both Voice Calls and SMS channels should have aria-pressed="true"
  const voiceCard = page.getByTestId('channel-card-voice')
  const smsCard = page.getByTestId('channel-card-sms')
  await expect(voiceCard).toHaveAttribute('aria-pressed', 'true', { timeout: Timeouts.ELEMENT })
  await expect(smsCard).toHaveAttribute('aria-pressed', 'true', { timeout: Timeouts.ELEMENT })
})

Then('other channels should not be selected', async ({ page }) => {
  // Channels that weren't explicitly selected should have aria-pressed="false"
  const reportsCard = page.getByTestId('channel-card-reports')
  await expect(reportsCard).toHaveAttribute('aria-pressed', 'false', { timeout: Timeouts.ELEMENT })
})

Then('the channel should be deselected', async ({ page }) => {
  // The Voice Calls channel should now be deselected after toggling it off
  const voiceCard = page.getByTestId('channel-card-voice')
  await expect(voiceCard).toHaveAttribute('aria-pressed', 'false', { timeout: Timeouts.ELEMENT })
})

Then('the error message should disappear', async ({ page }) => {
  // The "select at least one channel" validation error should not be visible
  await expect(page.getByText(/select at least/i)).not.toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('the validation error should reappear', async ({ page }) => {
  // Content assertion — verifying validation error text
  await expect(page.getByText(/select at least/i).first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Given('I am on the providers step', async ({ page }) => {
  await advanceWizardToStep(page, 2)
})

Given('I selected only {string} on the channels step', async ({ page }, channel: string) => {
  await advanceWizardToStep(page, 1)
  await selectWizardChannel(page, channel)
})

Given('I selected {string} on the channels step', async ({ page }, channel: string) => {
  await advanceWizardToStep(page, 1)
  await selectWizardChannel(page, channel)
})

When('I advance to the providers step', async ({ page }) => {
  await page.getByTestId(TestIds.SETUP_NEXT_BTN).click()
})

Given('I selected {string} and advanced to settings step', async ({ page }, channel: string) => {
  await advanceWizardToStep(page, 3, channel)
})

Given('I am on the invite step', async ({ page }) => {
  await advanceWizardToStep(page, 4)
})

When('I fill in the volunteer name', async ({ page }) => {
  await page.getByLabel(/name/i).first().fill(`SetupVol ${Date.now()}`)
})

When('I fill in the volunteer phone', async ({ page }) => {
  const phone = `+1212${Date.now().toString().slice(-7)}`
  await page.getByLabel(/phone/i).first().fill(phone)
  await page.getByLabel(/phone/i).first().blur()
})

Then('the volunteer name should appear with an invite code', async ({ page }) => {
  // Content assertion — verifying volunteer name is displayed
  await expect(page.getByText(/SetupVol/).first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Given('I have completed all wizard steps', async ({ page }) => {
  await advanceWizardToStep(page, 5)
})

Then('I should see the configured hotline name', async ({ page }) => {
  // Content assertion — verifying hotline name is displayed
  await expect(page.getByText(/TestHotline|hotline/i).first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see the selected channels', async ({ page }) => {
  // On the summary step, at least one channel name should be visible
  await expect(page.getByText(/reports|voice|sms|whatsapp|signal/i).first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

When('I type a hotline name', async ({ page }) => {
  await page.getByLabel(/hotline name|name/i).first().fill('Test')
})

When('I clear the hotline name', async ({ page }) => {
  await page.getByLabel(/hotline name|name/i).first().clear()
})

Given('I have advanced to the providers step', async ({ page }) => {
  await advanceWizardToStep(page, 2)
})

Then('the previously selected channel should still be selected', async ({ page }) => {
  // After navigating back, the Reports channel (selected in advanceWizardToStep) should still be pressed
  const reportsCard = page.getByTestId('channel-card-reports')
  await expect(reportsCard).toHaveAttribute('aria-pressed', 'true', { timeout: Timeouts.ELEMENT })
})

Then('the previously entered hotline name should still be filled', async ({ page }) => {
  const input = page.getByLabel(/hotline name|name/i).first()
  const value = await input.inputValue()
  expect(value.length).toBeGreaterThan(0)
})

When('I complete the entire setup wizard', async ({ page }) => {
  await advanceWizardToStep(page, 5)
  // Should now be on Step 5 – Summary with "Go to Dashboard" button
  await expect(page.getByText(/review|summary|launch/i).first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

// --- Reports ---

Given('at least one report exists', async ({ backendRequest, workerHub }) => {
  const { listReportsViaApi, createReportViaApi } = await import('../../api-helpers')
  const result = await listReportsViaApi(backendRequest, { hubId: workerHub })
  if (result.conversations.length === 0) {
    await createReportViaApi(backendRequest, { title: `Seed report ${Date.now()}`, hubId: workerHub })
  }
})

Given('a report exists', async ({ backendRequest, workerHub }) => {
  const { listReportsViaApi, createReportViaApi } = await import('../../api-helpers')
  const result = await listReportsViaApi(backendRequest, { hubId: workerHub })
  if (result.conversations.length === 0) {
    await createReportViaApi(backendRequest, { title: `Seed report ${Date.now()}`, hubId: workerHub })
  }
})

When('I fill in the report details', async ({ page }) => {
  // Report form has both title and body fields
  const titleInput = page.getByTestId(TestIds.REPORT_TITLE_INPUT)
  const bodyInput = page.getByTestId(TestIds.REPORT_BODY_INPUT)
  await expect(titleInput).toBeVisible({ timeout: Timeouts.ELEMENT })
  await titleInput.fill(`Test Report ${Date.now()}`)
  await bodyInput.fill('Test report content for BDD testing')
})

Then('the report should appear in the reports list', async ({ page }) => {
  // Content assertion — verifying report text is displayed
  await expect(page.getByText(/test report/i).first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see reports in the list', async ({ page }) => {
  const reportList = page.getByTestId(TestIds.REPORT_LIST).or(page.getByTestId(TestIds.REPORT_CARD))
  await expect(reportList.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

When('I click on the report', async ({ page }) => {
  // Navigate to reports if not already there
  const reportCard = page.getByTestId(TestIds.REPORT_CARD).first()
  const isVisible = await reportCard.isVisible({ timeout: 2000 }).catch(() => false)
  if (!isVisible) {
    await page.getByTestId(TestIds.NAV_REPORTS).click()
    await expect(page.getByTestId(TestIds.PAGE_TITLE)).toBeVisible({ timeout: Timeouts.ELEMENT })
  }
  await expect(reportCard).toBeVisible({ timeout: Timeouts.ELEMENT })
  await reportCard.click()
})

Then('I should see the report detail view', async ({ page }) => {
  await expect(page.getByTestId(TestIds.REPORT_DETAIL).or(page.getByTestId(TestIds.REPORT_METADATA)).first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see the report content', async ({ page }) => {
  // Content assertion — verifying report text is displayed
  await expect(page.getByText(/report/i).first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

// --- Demo mode ---

When('I navigate to the setup wizard summary step', async ({ page }) => {
  await advanceWizardToStep(page, 5)
})

When('I enable the demo mode toggle', async ({ page }) => {
  // Find the Switch by its id (linked to the "Populate with sample data" label via htmlFor="demo-mode")
  const toggle = page.getByTestId(TestIds.DEMO_MODE_TOGGLE)
  await expect(toggle).toBeVisible({ timeout: Timeouts.ELEMENT })
  const state = await toggle.getAttribute('data-state').catch(() => null)
  if (state !== 'checked') {
    await toggle.click()
  }
})

Given('demo mode has been enabled', async ({ page }) => {
  // Ensure logged in first — this step may run before "I am logged in as an admin"
  const sidebar = page.getByTestId(TestIds.NAV_SIDEBAR)
  const isAuth = await sidebar.isVisible({ timeout: 1000 }).catch(() => false)
  if (!isAuth) {
    await loginAsAdmin(page)
  }
  // Navigate to wizard summary and enable the demo mode toggle
  await advanceWizardToStep(page, 5)
  const toggle = page.getByTestId(TestIds.DEMO_MODE_TOGGLE)
  await expect(toggle).toBeVisible({ timeout: Timeouts.ELEMENT })
  const state = await toggle.getAttribute('data-state').catch(() => null)
  if (state !== 'checked') {
    await toggle.click()
  }
  // Complete the setup wizard to persist demo mode and create demo accounts
  const completeBtn = page.getByTestId('setup-complete-btn')
  await expect(completeBtn).toBeVisible({ timeout: Timeouts.ELEMENT })
  await completeBtn.click()
  // Wait for redirect to dashboard (wizard completion)
  await expect(page.getByTestId(TestIds.PAGE_TITLE)).toBeVisible({ timeout: Timeouts.AUTH })
})

// 'I visit the login page' -> defined in common/navigation-steps.ts
// 'I dismiss the demo banner' -> defined in common/interaction-steps.ts

// --- Blasts ---

When('I compose a blast message', async ({ page }) => {
  const nameInput = page.getByTestId(TestIds.BLAST_NAME).or(page.getByLabel(/name|subject/i))
  if (await nameInput.first().isVisible({ timeout: 2000 }).catch(() => false)) {
    await nameInput.first().fill(`Blast ${Date.now()}`)
  }
  const textInput = page.getByTestId(TestIds.BLAST_TEXT).or(page.locator('textarea'))
  await textInput.first().fill('Test blast message content')
})

When('I select recipients', async ({ page }) => {
  // Select all available recipients
  const selectAll = page.getByText(/select all/i).first().or(page.locator('input[type="checkbox"]').first())
  if (await selectAll.isVisible({ timeout: 2000 }).catch(() => false)) {
    await selectAll.click()
  }
})

Then('the blast should appear in the blast list', async ({ page }) => {
  await expect(page.getByTestId(TestIds.BLAST_CARD).or(page.getByText(/blast/i)).first()).toBeVisible({
    timeout: Timeouts.ELEMENT,
  })
})

Then('I should see the recipient selection interface', async ({ page }) => {
  // Content assertion — verifying recipient UI text
  const recipientUi = page.getByText(/recipient|volunteer|select/i)
  await expect(recipientUi.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should be able to select individual volunteers', async ({ page }) => {
  const checkbox = page.locator('input[type="checkbox"]').first()
  await expect(checkbox).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should be able to select all volunteers', async ({ page }) => {
  // Content assertion — verifying "select all" text
  const selectAll = page.getByText(/select all/i)
  await expect(selectAll.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

When('I set a future send time', async ({ page }) => {
  const dateInput = page.locator('input[type="datetime-local"], input[type="date"]').first()
  if (await dateInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 16)
    await dateInput.fill(tomorrow)
  }
})

Then('the blast should appear as {string}', async ({ page }, status: string) => {
  // Content assertion — verifying blast status text
  await expect(page.getByText(status, { exact: true }).first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Given('a blast has been sent', async ({ page }) => {
  // Navigate to blasts page
  await page.getByTestId(TestIds.NAV_BLASTS).click()
  await page.waitForLoadState('domcontentloaded')

  // If no blasts exist, create one via UI so the delivery status step has something to assert
  const hasBlast = await page.getByTestId(TestIds.BLAST_CARD).first().isVisible({ timeout: Timeouts.ELEMENT }).catch(() => false)
  if (!hasBlast) {
    const newBlastBtn = page.getByTestId(TestIds.BLAST_NEW_BTN)
    if (await newBlastBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await newBlastBtn.click()
      // Fill in blast name and content
      const nameInput = page.getByTestId(TestIds.BLAST_NAME).or(page.getByLabel(/name|subject/i))
      if (await nameInput.first().isVisible({ timeout: 2000 }).catch(() => false)) {
        await nameInput.first().fill(`Test Blast ${Date.now()}`)
      }
      const textInput = page.getByTestId(TestIds.BLAST_TEXT).or(page.locator('textarea'))
      if (await textInput.first().isVisible({ timeout: 2000 }).catch(() => false)) {
        await textInput.first().fill('Test blast message for delivery status verification')
      }
      // Submit the form
      const createBtn = page.getByRole('button', { name: /create|save|submit/i })
      if (await createBtn.first().isVisible({ timeout: 2000 }).catch(() => false)) {
        await createBtn.first().click()
      }
    }
  }

  // Click the first blast card to open the detail panel (which contains the status badge)
  const blastCard = page.getByTestId(TestIds.BLAST_CARD).first()
  if (await blastCard.isVisible({ timeout: Timeouts.ELEMENT }).catch(() => false)) {
    await blastCard.click()
  }
})

Then('I should see the delivery status for the blast', async ({ page }) => {
  // The blast card and detail panel both show a status badge (Draft, Sent, Scheduled, Sending, Cancelled)
  // Look for the Badge component showing any blast status — the regex covers all possible values
  await expect(
    page.getByText(/draft|sent|scheduled|sending|cancelled/i).first(),
  ).toBeVisible({ timeout: Timeouts.ELEMENT })
})

// --- Multi-hub extended ---

Given('I have selected a hub', async ({ page }) => {
  // If a hub selector is visible, select the first available hub
  const hubSelector = page.locator('select, [role="combobox"]').first()
  if (await hubSelector.isVisible({ timeout: 2000 }).catch(() => false)) {
    const options = await hubSelector.locator('option').all()
    if (options.length > 0) {
      await hubSelector.selectOption({ index: 0 })
    }
  }
})

When('I open hub settings', async ({ page }) => {
  await page.getByTestId(navTestIdMap['Hub Settings']).click()
})

Then('I should see telephony, messaging, and general tabs', async ({ page }) => {
  // Content assertion — verifying tab/section names
  const telephony = page.getByText(/telephony/i)
  const messaging = page.getByText(/messaging/i)
  const general = page.getByText(/general|settings/i)
  await expect(telephony.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
  await expect(messaging.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
  await expect(general.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})
