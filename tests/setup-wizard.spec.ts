import { test, expect } from '@playwright/test'
import { loginAsAdmin, resetTestState, uniquePhone, navigateAfterLogin } from './helpers'

test.describe('Setup Wizard', () => {
  test.beforeAll(async ({ request }) => {
    await resetTestState(request)
  })

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  // --- Helper: navigate to /setup and wait for the wizard to render ---
  async function goToSetup(page: import('@playwright/test').Page) {
    await navigateAfterLogin(page, '/setup')
    await expect(page.getByText('Setup Wizard')).toBeVisible({ timeout: 10000 })
  }

  // --- Helper: fill out step 1 (Identity) with defaults ---
  async function fillIdentityStep(
    page: import('@playwright/test').Page,
    opts: { name?: string; org?: string } = {},
  ) {
    const hotlineName = opts.name ?? `Test Hotline ${Date.now()}`
    const orgName = opts.org ?? 'Test Org'
    await page.locator('#hotline-name').fill(hotlineName)
    await page.locator('#org-name').fill(orgName)
    return { hotlineName, orgName }
  }

  // --- Helper: click a channel card by its label text ---
  async function selectChannel(page: import('@playwright/test').Page, label: string) {
    // Use getByRole('button') with exact name matching to avoid substring conflicts
    // Channel cards have role="button" with aria-pressed attribute
    const card = page.locator(`[role="button"][aria-pressed]`).filter({ has: page.getByText(label, { exact: true }) })
    await card.click()
  }

  // --- Helper: click Next and wait for the step to advance ---
  async function clickNext(page: import('@playwright/test').Page) {
    await page.getByRole('button', { name: /next/i }).click()
    // Wait for any save operation to complete (Next saves progress to server)
    await page.waitForTimeout(500)
  }

  // --- Helper: click Back ---
  async function clickBack(page: import('@playwright/test').Page) {
    await page.getByRole('button', { name: /back/i }).click()
  }

  // --- Helper: click Skip ---
  async function clickSkip(page: import('@playwright/test').Page) {
    await page.getByRole('button', { name: /skip/i }).click()
  }

  // =====================================================================
  // Test 1: Setup wizard page loads
  // =====================================================================
  test('setup wizard page loads with identity step', async ({ page }) => {
    await goToSetup(page)

    // The wizard title should be visible
    await expect(page.getByText('Setup Wizard')).toBeVisible()

    // Should show the identity step heading
    await expect(page.getByText('Name Your Hotline')).toBeVisible()

    // Should show the step indicator "Step 1 of 6"
    await expect(page.getByText('Identity')).toBeVisible()

    // Identity form fields should be visible
    await expect(page.locator('#hotline-name')).toBeVisible()
    await expect(page.locator('#org-name')).toBeVisible()

    // Next button should be present but disabled (hotline name is empty)
    const nextBtn = page.getByRole('button', { name: /next/i })
    await expect(nextBtn).toBeVisible()
    await expect(nextBtn).toBeDisabled()

    // Back button should be disabled on step 1
    const backBtn = page.getByRole('button', { name: /back/i })
    await expect(backBtn).toBeDisabled()
  })

  // =====================================================================
  // Test 2: Step 1 - Identity form fill and advance
  // =====================================================================
  test('step 1: fill identity fields and advance to channels', async ({ page }) => {
    await goToSetup(page)

    // Fill hotline name
    await page.locator('#hotline-name').fill('Community Crisis Line')
    // Fill organization
    await page.locator('#org-name').fill('Crisis Response Org')

    // Next button should now be enabled (hotline name is not empty)
    const nextBtn = page.getByRole('button', { name: /next/i })
    await expect(nextBtn).toBeEnabled()

    // Click Next to proceed to step 2
    await clickNext(page)

    // Should now show the Channels step
    await expect(page.getByText('Choose Communication Channels')).toBeVisible({ timeout: 5000 })

    // Step indicator should show "Channels" heading
    await expect(page.getByText('Choose Communication Channels')).toBeVisible()
  })

  // =====================================================================
  // Test 3: Step 2 - Channel selection validation
  // =====================================================================
  test('step 2: channel selection validation prevents advancing without selection', async ({ page }) => {
    await goToSetup(page)

    // Complete step 1
    await fillIdentityStep(page)
    await clickNext(page)
    await expect(page.getByText('Choose Communication Channels')).toBeVisible({ timeout: 5000 })

    // The error message should already be showing since no channels are selected
    await expect(page.getByText('Please select at least one channel')).toBeVisible()

    // Next button should be disabled
    const nextBtn = page.getByRole('button', { name: /next/i })
    await expect(nextBtn).toBeDisabled()

    // Select the Reports channel (no provider needed)
    await selectChannel(page, 'Reports')

    // Error should disappear
    await expect(page.getByText('Please select at least one channel')).not.toBeVisible()

    // Next button should now be enabled
    await expect(nextBtn).toBeEnabled()

    // Should be able to advance
    await clickNext(page)
    await expect(page.getByText('Configure Providers')).toBeVisible({ timeout: 5000 })
  })

  // =====================================================================
  // Test 4: Step 2 - Multiple channel selection
  // =====================================================================
  test('step 2: select multiple channels and verify selection state', async ({ page }) => {
    await goToSetup(page)

    // Complete step 1
    await fillIdentityStep(page)
    await clickNext(page)
    await expect(page.getByText('Choose Communication Channels')).toBeVisible({ timeout: 5000 })

    // Select Voice Calls
    await selectChannel(page, 'Voice Calls')

    // The Voice card should show as selected (aria-pressed=true)
    const voiceCard = page.locator('[role="button"][aria-pressed]').filter({ has: page.getByText('Voice Calls', { exact: true }) })
    await expect(voiceCard).toHaveAttribute('aria-pressed', 'true')

    // Select SMS
    await selectChannel(page, 'SMS')

    // The SMS card should show as selected
    const smsCard = page.locator('[role="button"][aria-pressed]').filter({ has: page.getByText('SMS', { exact: true }) })
    await expect(smsCard).toHaveAttribute('aria-pressed', 'true')

    // Both should remain selected
    await expect(voiceCard).toHaveAttribute('aria-pressed', 'true')
    await expect(smsCard).toHaveAttribute('aria-pressed', 'true')

    // Other channels should NOT be selected
    const whatsappCard = page.locator('[role="button"][aria-pressed]').filter({ has: page.getByText('WhatsApp', { exact: true }) })
    await expect(whatsappCard).toHaveAttribute('aria-pressed', 'false')

    // Next button should be enabled
    await expect(page.getByRole('button', { name: /next/i })).toBeEnabled()

    // Advance to providers step
    await clickNext(page)
    await expect(page.getByText('Configure Providers')).toBeVisible({ timeout: 5000 })
  })

  // =====================================================================
  // Test 5: Step 3 - Skip button appears and works
  // =====================================================================
  test('step 3: skip button navigates forward', async ({ page }) => {
    await goToSetup(page)

    // Complete step 1
    await fillIdentityStep(page)
    await clickNext(page)
    await expect(page.getByText('Choose Communication Channels')).toBeVisible({ timeout: 5000 })

    // Skip button should NOT be visible on step 2
    await expect(page.getByRole('button', { name: /skip/i })).not.toBeVisible()

    // Select Reports and advance to step 3
    await selectChannel(page, 'Reports')
    await clickNext(page)
    await expect(page.getByText('Configure Providers')).toBeVisible({ timeout: 5000 })

    // Skip button SHOULD be visible on step 3
    const skipBtn = page.getByRole('button', { name: /skip/i })
    await expect(skipBtn).toBeVisible()

    // Click Skip to go to step 4
    await clickSkip(page)
    await expect(page.getByText('Quick Settings')).toBeVisible({ timeout: 5000 })

    // Skip should still be visible on step 4
    await expect(page.getByRole('button', { name: /skip/i })).toBeVisible()

    // Skip again to step 5 (Invite)
    await clickSkip(page)
    await expect(page.getByText('Invite Volunteers')).toBeVisible({ timeout: 5000 })

    // Skip again to step 6 (Summary)
    await clickSkip(page)
    await expect(page.getByText('Review & Launch')).toBeVisible({ timeout: 5000 })
  })

  // =====================================================================
  // Test 6: Step 4 - Settings displayed based on selected channels
  // =====================================================================
  test('step 4: voice settings appear when Voice is selected', async ({ page }) => {
    await goToSetup(page)

    // Complete step 1
    await fillIdentityStep(page)
    await clickNext(page)
    await expect(page.getByText('Choose Communication Channels')).toBeVisible({ timeout: 5000 })

    // Select Voice Calls
    await selectChannel(page, 'Voice Calls')
    await clickNext(page)
    await expect(page.getByText('Configure Providers')).toBeVisible({ timeout: 5000 })

    // Skip providers step
    await clickSkip(page)
    await expect(page.getByText('Quick Settings')).toBeVisible({ timeout: 5000 })

    // Voice settings section should be visible
    await expect(page.getByText('Voice Call Settings')).toBeVisible()
    await expect(page.getByText('Queue Timeout (seconds)')).toBeVisible()
    await expect(page.getByText('Voicemail', { exact: true })).toBeVisible()
  })

  test('step 4: report settings appear when Reports is selected', async ({ page }) => {
    await goToSetup(page)

    // Complete step 1
    await fillIdentityStep(page)
    await clickNext(page)
    await expect(page.getByText('Choose Communication Channels')).toBeVisible({ timeout: 5000 })

    // Select Reports only
    await selectChannel(page, 'Reports')
    await clickNext(page)

    // Skip providers
    await clickSkip(page)
    await expect(page.getByText('Quick Settings')).toBeVisible({ timeout: 5000 })

    // Report settings should be visible
    await expect(page.getByText('Report Settings')).toBeVisible()
    await expect(page.getByText('Default Categories')).toBeVisible()

    // Should be able to add a category
    const categoryInput = page.getByPlaceholder('New category name')
    await expect(categoryInput).toBeVisible()
    await categoryInput.fill('Harassment')
    await page.getByRole('button', { name: /add/i }).click()
    await expect(page.getByText('Harassment', { exact: true })).toBeVisible()
  })

  test('step 4: messaging settings appear when SMS is selected', async ({ page }) => {
    await goToSetup(page)

    // Complete step 1
    await fillIdentityStep(page)
    await clickNext(page)
    await expect(page.getByText('Choose Communication Channels')).toBeVisible({ timeout: 5000 })

    // Select SMS
    await selectChannel(page, 'SMS')
    await clickNext(page)

    // Skip providers
    await clickSkip(page)
    await expect(page.getByText('Quick Settings')).toBeVisible({ timeout: 5000 })

    // Messaging settings should be visible
    await expect(page.getByText('Messaging Settings')).toBeVisible()
    await expect(page.getByText('Auto-Response Template')).toBeVisible()
    await expect(page.getByText('Inactivity Timeout (minutes)')).toBeVisible()
    await expect(page.getByText('Max Concurrent Per Volunteer')).toBeVisible()
  })

  // =====================================================================
  // Test 7: Step 5 - Generate invite
  // =====================================================================
  test('step 5: generate invite for a volunteer', async ({ page }) => {
    await goToSetup(page)

    // Complete step 1
    await fillIdentityStep(page)
    await clickNext(page)
    await expect(page.getByText('Choose Communication Channels')).toBeVisible({ timeout: 5000 })

    // Select Reports and advance
    await selectChannel(page, 'Reports')
    await clickNext(page)

    // Skip steps 3 and 4
    await clickSkip(page)
    await clickSkip(page)

    // Should be on Invite step
    await expect(page.getByText('Invite Volunteers')).toBeVisible({ timeout: 5000 })

    // Generate invite button should be disabled without name/phone
    const genBtn = page.getByRole('button', { name: /generate invite/i })
    await expect(genBtn).toBeDisabled()

    // Fill invite form
    const volName = `Wizard Vol ${Date.now()}`
    const volPhone = uniquePhone()

    // Find the name and phone inputs within the invite form
    await page.getByPlaceholder('Volunteer name').fill(volName)
    await page.getByPlaceholder('+12125551234').fill(volPhone)

    // Generate invite button should now be enabled
    await expect(genBtn).toBeEnabled()
    await genBtn.click()

    // Wait for invite to be generated (shown in the Generated Invites list)
    await expect(page.getByText('Generated Invites')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(volName)).toBeVisible()

    // An invite code should appear (rendered in a monospace font-mono text)
    const inviteCode = page.locator('.font-mono')
    await expect(inviteCode.first()).toBeVisible()
  })

  // =====================================================================
  // Test 8: Step 6 - Summary review
  // =====================================================================
  test('step 6: summary displays configured values', async ({ page }) => {
    await goToSetup(page)
    const hotlineName = `Summary Test ${Date.now()}`
    const orgName = 'Summary Org'

    // Step 1: Identity
    await page.locator('#hotline-name').fill(hotlineName)
    await page.locator('#org-name').fill(orgName)
    await clickNext(page)
    await expect(page.getByText('Choose Communication Channels')).toBeVisible({ timeout: 5000 })

    // Step 2: Select Voice Calls and Reports
    await selectChannel(page, 'Voice Calls')
    await selectChannel(page, 'Reports')
    await clickNext(page)

    // Step 3: Skip providers
    await clickSkip(page)
    // Step 4: Skip settings
    await clickSkip(page)
    // Step 5: Skip invites
    await clickSkip(page)

    // Should be on Summary step
    await expect(page.getByText('Review & Launch')).toBeVisible({ timeout: 5000 })

    // Identity section should show the hotline name and org
    await expect(page.getByText(hotlineName)).toBeVisible()
    await expect(page.getByText(orgName)).toBeVisible()

    // Channels section should list Voice Calls and Reports
    await expect(page.getByText('Voice Calls')).toBeVisible()
    await expect(page.locator('#main-content').getByText('Reports')).toBeVisible()

    // Go to Dashboard button should be present
    const dashBtn = page.getByRole('button', { name: /go to dashboard/i })
    await expect(dashBtn).toBeVisible()
  })

  // =====================================================================
  // Test 9: Back navigation
  // =====================================================================
  test('back navigation returns to previous steps', async ({ page }) => {
    await goToSetup(page)

    // Step 1: Fill identity
    const hotlineName = `Back Nav ${Date.now()}`
    await page.locator('#hotline-name').fill(hotlineName)
    await page.locator('#org-name').fill('Nav Org')
    await clickNext(page)
    await expect(page.getByText('Choose Communication Channels')).toBeVisible({ timeout: 5000 })

    // Step 2: Select a channel
    await selectChannel(page, 'Reports')
    await clickNext(page)
    await expect(page.getByText('Configure Providers')).toBeVisible({ timeout: 5000 })

    // Go back to step 2 (Channels)
    await clickBack(page)
    await expect(page.getByText('Choose Communication Channels')).toBeVisible({ timeout: 5000 })

    // Reports should still be selected (state preserved)
    const reportsCard = page.locator('[role="button"]').filter({ hasText: 'Reports' })
    await expect(reportsCard).toHaveAttribute('aria-pressed', 'true')

    // Go back to step 1 (Identity)
    await clickBack(page)
    await expect(page.getByText('Name Your Hotline')).toBeVisible({ timeout: 5000 })

    // Hotline name should still be filled (state preserved)
    await expect(page.locator('#hotline-name')).toHaveValue(hotlineName)
    await expect(page.locator('#org-name')).toHaveValue('Nav Org')
  })

  // =====================================================================
  // Test 10: Complete setup - full flow to dashboard
  // =====================================================================
  test('complete setup: full flow through to dashboard redirect', async ({ page }) => {
    await goToSetup(page)
    const hotlineName = `Full Flow ${Date.now()}`

    // Step 1: Identity
    await page.locator('#hotline-name').fill(hotlineName)
    await page.locator('#org-name').fill('Full Flow Org')
    await clickNext(page)
    await expect(page.getByText('Choose Communication Channels')).toBeVisible({ timeout: 5000 })

    // Step 2: Select Reports (simplest - no provider needed)
    await selectChannel(page, 'Reports')
    await clickNext(page)
    await expect(page.getByText('Configure Providers')).toBeVisible({ timeout: 5000 })

    // Step 3: Skip providers
    await clickSkip(page)
    await expect(page.getByText('Quick Settings')).toBeVisible({ timeout: 5000 })

    // Step 4: Skip settings
    await clickSkip(page)
    await expect(page.getByText('Invite Volunteers')).toBeVisible({ timeout: 5000 })

    // Step 5: Skip invite
    await clickSkip(page)
    await expect(page.getByText('Review & Launch')).toBeVisible({ timeout: 5000 })

    // Step 6: Verify summary shows our config
    await expect(page.getByText(hotlineName)).toBeVisible()
    await expect(page.locator('#main-content').getByText('Reports')).toBeVisible()

    // Click "Go to Dashboard"
    await page.getByRole('button', { name: /go to dashboard/i }).click()

    // Should redirect to the dashboard at "/"
    await page.waitForURL('**/', { timeout: 15000 })
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 10000 })
  })

  // =====================================================================
  // Test: Step 3 - Provider form shows Test Connection and Save buttons
  // =====================================================================
  test('step 3: provider form shows test connection and save buttons for Voice', async ({ page }) => {
    await goToSetup(page)

    // Complete step 1
    await fillIdentityStep(page)
    await clickNext(page)
    await expect(page.getByText('Choose Communication Channels')).toBeVisible({ timeout: 5000 })

    // Select Voice Calls to trigger provider form
    await selectChannel(page, 'Voice Calls')
    await clickNext(page)
    await expect(page.getByText('Configure Providers')).toBeVisible({ timeout: 5000 })

    // Provider form should be visible with Voice & SMS Provider header
    await expect(page.getByText('Voice & SMS Provider')).toBeVisible()

    // Twilio should be selected by default (shown as a checked card)
    await expect(page.getByText('Twilio')).toBeVisible()

    // Test Connection button should be visible
    const testBtn = page.getByRole('button', { name: /test connection/i })
    await expect(testBtn).toBeVisible()

    // Save Provider button should be visible
    const saveBtn = page.getByRole('button', { name: /save provider/i })
    await expect(saveBtn).toBeVisible()
  })

  // =====================================================================
  // Test: Channel deselection toggle
  // =====================================================================
  test('step 2: clicking a selected channel deselects it', async ({ page }) => {
    await goToSetup(page)

    // Complete step 1
    await fillIdentityStep(page)
    await clickNext(page)
    await expect(page.getByText('Choose Communication Channels')).toBeVisible({ timeout: 5000 })

    // Select Voice Calls
    await selectChannel(page, 'Voice Calls')
    const voiceCard = page.locator('[role="button"]').filter({ hasText: 'Voice Calls' })
    await expect(voiceCard).toHaveAttribute('aria-pressed', 'true')

    // Click again to deselect
    await selectChannel(page, 'Voice Calls')
    await expect(voiceCard).toHaveAttribute('aria-pressed', 'false')

    // Error message should reappear since no channels are selected
    await expect(page.getByText('Please select at least one channel')).toBeVisible()
  })

  // =====================================================================
  // Test: Step 1 - Next disabled when hotline name is empty
  // =====================================================================
  test('step 1: next button disabled with empty hotline name', async ({ page }) => {
    await goToSetup(page)

    // Initially the input is empty
    await expect(page.locator('#hotline-name')).toHaveValue('')

    // Next should be disabled
    await expect(page.getByRole('button', { name: /next/i })).toBeDisabled()

    // Type something, then clear it
    await page.locator('#hotline-name').fill('Temp')
    await expect(page.getByRole('button', { name: /next/i })).toBeEnabled()

    await page.locator('#hotline-name').fill('')
    await expect(page.getByRole('button', { name: /next/i })).toBeDisabled()
  })

  // =====================================================================
  // Test: No providers needed message for Reports-only
  // =====================================================================
  test('step 3: shows no providers needed when only Reports selected', async ({ page }) => {
    await goToSetup(page)

    // Complete step 1
    await fillIdentityStep(page)
    await clickNext(page)
    await expect(page.getByText('Choose Communication Channels')).toBeVisible({ timeout: 5000 })

    // Select only Reports
    await selectChannel(page, 'Reports')
    await clickNext(page)
    await expect(page.getByText('Configure Providers')).toBeVisible({ timeout: 5000 })

    // Should show the "no providers needed" message
    await expect(page.getByText('No external providers needed')).toBeVisible()
  })

  // =====================================================================
  // Test: Summary does not show navigation buttons (only Go to Dashboard)
  // =====================================================================
  test('step 6: summary step hides Next/Back navigation, shows Go to Dashboard', async ({ page }) => {
    await goToSetup(page)

    // Speed through all steps
    await fillIdentityStep(page)
    await clickNext(page)
    await expect(page.getByText('Choose Communication Channels')).toBeVisible({ timeout: 5000 })

    await selectChannel(page, 'Reports')
    await clickNext(page)
    await clickSkip(page)
    await clickSkip(page)
    await clickSkip(page)

    // On summary step
    await expect(page.getByText('Review & Launch')).toBeVisible({ timeout: 5000 })

    // Next and Back buttons should NOT be visible on the last step
    await expect(page.getByRole('button', { name: /next/i })).not.toBeVisible()
    await expect(page.getByRole('button', { name: /back/i })).not.toBeVisible()
    await expect(page.getByRole('button', { name: /skip/i })).not.toBeVisible()

    // Only the Go to Dashboard button should be visible
    await expect(page.getByRole('button', { name: /go to dashboard/i })).toBeVisible()
  })
})
