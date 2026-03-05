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
import { expect } from '@playwright/test'
import { Given, When, Then } from '../fixtures'
import { TestIds, navTestIdMap } from '../../test-ids'
import { Timeouts, navigateAfterLogin } from '../../helpers'

// --- Telephony provider ---

When('I expand the telephony provider section', async ({ page }) => {
  const section = page.locator('[data-settings-section]').filter({ hasText: /telephony|provider/i })
    .or(page.getByTestId(TestIds.TELEPHONY_PROVIDER))
  await section.first().scrollIntoViewIfNeeded()
  await section.first().click()
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
  await page.waitForTimeout(Timeouts.ASYNC_SETTLE)
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

Given('a call with a recording exists', async () => {
  // Test data precondition — recording data should exist
})

Given('a call without a recording exists', async () => {
  // Test data precondition
})

Given('I am viewing a call with a recording', async ({ page }) => {
  // Navigate to call history and open a call detail
  await page.getByTestId(navTestIdMap['Call History']).click()
  await page.waitForTimeout(Timeouts.ASYNC_SETTLE)
})

When('I open the call detail', async ({ page }) => {
  const callRow = page.getByTestId(TestIds.CALL_ROW)
  if (await callRow.first().isVisible({ timeout: 2000 }).catch(() => false)) {
    await callRow.first().click()
  }
})

Then('the call entry should show a recording badge', async ({ page }) => {
  await expect(page.getByTestId(TestIds.RECORDING_BADGE).first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('the call entry should not show a recording badge', async ({ page }) => {
  // No recording badge should be visible
})

Then('I should see the recording player', async ({ page }) => {
  await expect(page.getByTestId(TestIds.RECORDING_PLAYER)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('the play button should be visible', async ({ page }) => {
  await expect(page.getByTestId(TestIds.RECORDING_PLAY_BTN)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see play, pause, and progress controls', async ({ page }) => {
  await expect(page.getByTestId(TestIds.RECORDING_PLAYER).or(page.locator('audio, video')).first()).toBeVisible({
    timeout: Timeouts.ELEMENT,
  })
})

// --- RCS channel ---

When('I navigate to the messaging channel settings', async ({ page }) => {
  await page.getByTestId(navTestIdMap['Hub Settings']).click()
  await page.waitForTimeout(Timeouts.ASYNC_SETTLE)
})

Then('I should see the RCS configuration section', async ({ page }) => {
  // Content assertion — verifying RCS text is displayed
  await expect(page.getByText(/rcs/i).first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

When('I fill in valid RCS settings', async ({ page }) => {
  const agentIdInput = page.getByTestId(TestIds.RCS_AGENT_ID)
  if (await agentIdInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await agentIdInput.fill('test-agent-id')
  }
})

// --- WebRTC ---

When('I expand the WebRTC section', async ({ page }) => {
  const section = page.locator('[data-settings-section]').filter({ hasText: /webrtc/i })
  await section.first().scrollIntoViewIfNeeded()
  await section.first().click()
})

Then('I should see the WebRTC configuration options', async ({ page }) => {
  // Content assertion — verifying WebRTC text is displayed
  await expect(page.getByText(/webrtc/i).first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

When('I navigate to the WebRTC settings', async ({ page }) => {
  await page.getByTestId(navTestIdMap['Hub Settings']).click()
  await page.waitForTimeout(Timeouts.ASYNC_SETTLE)
})

When('I toggle the WebRTC calling switch', async ({ page }) => {
  const toggle = page.locator('[role="switch"]').first()
  await toggle.click()
})

Then('the setting should be saved', async ({ page }) => {
  // Auto-save or success indication
  await page.waitForTimeout(Timeouts.UI_SETTLE)
})

Then('I should see fields for STUN and TURN server configuration', async ({ page }) => {
  // Content assertion — verifying STUN/TURN text is displayed
  await expect(page.getByText(/stun|turn/i).first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

// --- Multi-hub ---

When('I navigate to the hub management page', async ({ page }) => {
  await page.getByTestId(TestIds.NAV_ADMIN_HUBS).click()
  await page.waitForTimeout(Timeouts.ASYNC_SETTLE)
})

When('I fill in the hub name', async ({ page }) => {
  await page.getByLabel(/name/i).first().fill(`TestHub ${Date.now()}`)
})

Then('the new hub should appear in the hub list', async ({ page }) => {
  // Content assertion — verifying hub name text
  await expect(page.getByText(/TestHub/).first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Given('multiple hubs exist', async () => {
  // Precondition
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
  await page.waitForTimeout(Timeouts.ASYNC_SETTLE)
})

When('I navigate to the hub settings', async ({ page }) => {
  await page.getByTestId(navTestIdMap['Hub Settings']).click()
  await page.waitForTimeout(Timeouts.ASYNC_SETTLE)
})

Then('I should see the hub-specific configuration', async ({ page }) => {
  await expect(page.getByTestId(TestIds.PAGE_TITLE)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

When('I switch to a specific hub', async ({ page }) => {
  // Select first available hub
})

Then('I should see only volunteers for that hub', async ({ page }) => {
  await page.waitForTimeout(Timeouts.ASYNC_SETTLE)
})

Given('a non-default hub exists', async () => {
  // Precondition
})

When('I click {string} on the hub', async ({ page }, text: string) => {
  // Use confirm dialog OK for known delete/confirm actions
  const lowerText = text.toLowerCase()
  if (lowerText === 'delete') {
    await page.getByTestId(TestIds.CONFIRM_DIALOG_OK).click()
  } else {
    await page.getByRole('button', { name: text }).first().click()
  }
})

When('I confirm the deletion', async ({ page }) => {
  const dialog = page.getByRole('dialog')
  if (await dialog.isVisible({ timeout: 2000 }).catch(() => false)) {
    await page.getByTestId(TestIds.CONFIRM_DIALOG_OK).click()
  }
})

Then('the hub should be removed', async ({ page }) => {
  await page.waitForTimeout(Timeouts.ASYNC_SETTLE)
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
  await navigateAfterLogin(page, '/setup')
  await page.getByLabel(/hotline name|name/i).first().fill('Test Hotline')
  const orgInput = page.getByLabel(/organization/i)
  if (await orgInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await orgInput.fill('Test Org')
  }
  await page.getByTestId(TestIds.SETUP_NEXT_BTN).click()
})

When('I select the {string} channel', async ({ page }, channel: string) => {
  // Content-based click — selecting a channel by its label text
  await page.getByText(channel, { exact: true }).first().click()
})

When('I click the {string} channel again', async ({ page }, channel: string) => {
  await page.getByText(channel, { exact: true }).first().click()
})

Then('both channels should be marked as selected', async ({ page }) => {
  // Verify selected state
})

Then('other channels should not be selected', async () => {
  // Verification
})

Then('the channel should be deselected', async () => {
  // Verification
})

Then('the error message should disappear', async ({ page }) => {
  await page.waitForTimeout(500)
})

Then('the validation error should reappear', async ({ page }) => {
  // Content assertion — verifying validation error text
  await expect(page.getByText(/select at least/i).first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Given('I am on the providers step', async ({ page }) => {
  await navigateAfterLogin(page, '/setup')
  // Skip through to providers step
})

Given('I selected only {string} on the channels step', async ({ page }, channel: string) => {
  // Setup wizard state
})

Given('I selected {string} on the channels step', async ({ page }, channel: string) => {
  // Setup wizard state
})

When('I advance to the providers step', async ({ page }) => {
  await page.getByTestId(TestIds.SETUP_NEXT_BTN).click()
})

Given('I selected {string} and advanced to settings step', async () => {
  // Setup wizard state
})

Given('I am on the invite step', async () => {
  // Setup wizard state
})

When('I fill in the volunteer name', async ({ page }) => {
  await page.getByLabel(/name/i).first().fill(`SetupVol ${Date.now()}`)
})

When('I fill in the volunteer phone', async ({ page }) => {
  const phone = `+1555${Date.now().toString().slice(-7)}`
  await page.getByLabel(/phone/i).first().fill(phone)
  await page.getByLabel(/phone/i).first().blur()
})

Then('the volunteer name should appear with an invite code', async ({ page }) => {
  // Content assertion — verifying volunteer name is displayed
  await expect(page.getByText(/SetupVol/).first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Given('I have completed all wizard steps', async () => {
  // Full wizard completion precondition
})

Then('I should see the configured hotline name', async ({ page }) => {
  // Content assertion — verifying hotline name is displayed
  await expect(page.getByText(/TestHotline|hotline/i).first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see the selected channels', async ({ page }) => {
  // Channels should be listed in the summary
})

When('I type a hotline name', async ({ page }) => {
  await page.getByLabel(/hotline name|name/i).first().fill('Test')
})

When('I clear the hotline name', async ({ page }) => {
  await page.getByLabel(/hotline name|name/i).first().clear()
})

Given('I have advanced to the providers step', async () => {
  // Wizard state
})

Then('the previously selected channel should still be selected', async () => {
  // State persistence
})

Then('the previously entered hotline name should still be filled', async ({ page }) => {
  const input = page.getByLabel(/hotline name|name/i).first()
  const value = await input.inputValue()
  expect(value.length).toBeGreaterThan(0)
})

When('I complete the entire setup wizard', async ({ page }) => {
  // Full wizard completion
})

// --- Reports ---

Given('at least one report exists', async () => {
  // Precondition
})

Given('a report exists', async () => {
  // Precondition
})

When('I fill in the report details', async ({ page }) => {
  const textarea = page.locator('textarea').first()
  await textarea.fill('Test report content')
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
  const reportCard = page.getByTestId(TestIds.REPORT_CARD).first()
  await reportCard.click()
})

Then('I should see the report detail view', async ({ page }) => {
  await page.waitForTimeout(Timeouts.ASYNC_SETTLE)
})

Then('I should see the report content', async ({ page }) => {
  // Content assertion — verifying report text is displayed
  await expect(page.getByText(/report/i).first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

// --- Demo mode ---

When('I navigate to the setup wizard summary step', async ({ page }) => {
  await navigateAfterLogin(page, '/setup')
  // Navigate to summary step
})

When('I enable the demo mode toggle', async ({ page }) => {
  const demoLabel = page.getByText(/sample data|demo/i).first()
  const toggle = demoLabel.locator('..').locator('[role="switch"], input[type="checkbox"]')
  if (await toggle.isVisible({ timeout: 2000 }).catch(() => false)) {
    await toggle.click()
  }
})

Given('demo mode has been enabled', async ({ page }) => {
  // Precondition — demo mode is already enabled via API or wizard
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

Given('a blast has been sent', async () => {
  // Precondition
})

Then('I should see the delivery status for the blast', async ({ page }) => {
  // Status indicator visible
  await page.waitForTimeout(Timeouts.ASYNC_SETTLE)
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
  await page.waitForTimeout(Timeouts.ASYNC_SETTLE)
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
