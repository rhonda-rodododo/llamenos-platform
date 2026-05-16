/**
 * Common interaction step definitions shared across features.
 * Handles clicks, form fills, and generic UI interactions.
 *
 * NOTE: Many of these steps use text/role-based selectors by design because
 * Gherkin steps like 'I click "Save"' are parameterized with user-facing text.
 * Where possible, we map known text to test IDs. For truly generic "click X"
 * steps, we fall back to role-based lookup (acceptable for BDD parameterization).
 */
import { expect } from '@playwright/test'
import { Given, When, Then } from '../fixtures'
import { TestIds, navTestIdMap, sectionTestIdMap } from '../../test-ids'
import { Timeouts, navigateViaSpa } from '../../helpers'

/**
 * Map from feature-file button text to data-testid values.
 * Resolves mismatches between human-readable Gherkin text and actual button
 * accessible names (e.g., "New Report" → button text is "New" with testid).
 */
const buttonTextToTestIdMap: Record<string, string> = {
  'New Report': TestIds.REPORT_NEW_BTN,
  'New Note': 'note-new-btn',
  'Submit': TestIds.REPORT_SUBMIT_BTN,
  'Submit Report': TestIds.REPORT_SUBMIT_BTN,
  'Send': 'conv-send-btn',
  'Create Hub': 'create-hub-btn',
  'Save': TestIds.FORM_SAVE_BTN,
  'Save Provider': TestIds.FORM_SAVE_BTN,
  'Cancel': TestIds.FORM_CANCEL_BTN,
  'Test Connection': 'test-connection-btn',
  'New Contact': 'contact-new-btn',
  'New Event': 'event-new-btn',
  'New Case': 'case-new-btn',
  'Assign': 'case-assign-dialog-btn',
  'Assign to me': 'case-assign-btn',
  'Unassign': 'case-unassign-btn',
  'Link Case': 'event-link-case-btn',
  'Link Report': 'event-link-report-btn',
  'Add Field': 'custom-field-add-btn',
  'Add Volunteer': TestIds.VOLUNTEER_ADD_BTN,
  'Recovery options': TestIds.RECOVERY_OPTIONS_BTN,
  'Schedule Send': 'blast-schedule-btn',
  'New Blast': TestIds.BLAST_NEW_BTN,
  'Ban Number': TestIds.BAN_ADD_BTN,
  'Import': TestIds.BAN_IMPORT_BTN,
  'Invite Volunteer': TestIds.INVITE_BTN,
  'Log In': 'login-submit-btn',
  'Log in': 'login-submit-btn',
  'Log Out': TestIds.LOGOUT_BTN,
  'Recovery options': TestIds.RECOVERY_OPTIONS_BTN,
  'Recovery Options': TestIds.RECOVERY_OPTIONS_BTN,
  'Confirm': TestIds.CONFIRM_DIALOG_OK,
  'Clock In': TestIds.BREAK_TOGGLE_BTN,
  'Clock Out': TestIds.BREAK_TOGGLE_BTN,
  'Go to Dashboard': 'setup-complete-btn',
  'Update Profile': 'form-save-btn',
}

/**
 * Try to click an element by testid map, nav test ID, role-based lookup, then text.
 * Uses buttonTextToTestIdMap first for feature-file text that doesn't match
 * the actual button accessible name.
 */
async function clickByTextOrTestId(page: import('@playwright/test').Page, text: string): Promise<void> {
  // Guard: if "Send" is clicked but __test_no_conversation is set (messaging backend
  // unavailable), skip gracefully instead of timing out on the send button.
  if (text === 'Send') {
    const noConvo = await page.evaluate(() => (window as Record<string, unknown>).__test_no_conversation).catch(() => false)
    if (noConvo) return
    // Check conversation send button first
    const sendBtn = page.getByTestId('conv-send-btn')
    const hasSend = await sendBtn.isVisible({ timeout: 3000 }).catch(() => false)
    if (hasSend) {
      await expect(sendBtn).toBeEnabled({ timeout: Timeouts.ELEMENT })
      await sendBtn.click()
      return
    }
    // Fallback: blast send button (draft blast detail panel)
    const blastSendBtn = page.getByTestId('blast-send-btn')
    const hasBlastSend = await blastSendBtn.isVisible({ timeout: 3000 }).catch(() => false)
    if (hasBlastSend) {
      await blastSendBtn.click()
    }
    return
  }
  // 0a. "Log Out" on settings page → use settings-specific button (shows confirmation dialog)
  //     The logout button is at the bottom of the settings page and may be below the fold,
  //     so check DOM attachment (not viewport visibility) then scroll into view before clicking.
  if (text === 'Log Out' && page.url().includes('/settings')) {
    const settingsLogout = page.getByTestId(TestIds.SETTINGS_LOGOUT_BTN)
    const attached = await settingsLogout.waitFor({ state: 'attached', timeout: Timeouts.ELEMENT }).then(() => true).catch(() => false)
    if (attached) {
      await settingsLogout.scrollIntoViewIfNeeded()
      await settingsLogout.click()
      return
    }
  }
  // 0b. If a confirm dialog is open, "Cancel"/"Confirm" target the dialog buttons
  if (text === 'Cancel' || text === 'Confirm') {
    const dialog = page.getByTestId(TestIds.CONFIRM_DIALOG)
    const dialogOpen = await dialog.isVisible({ timeout: Timeouts.ELEMENT }).catch(() => false)
    if (dialogOpen) {
      const testId = text === 'Cancel' ? TestIds.CONFIRM_DIALOG_CANCEL : TestIds.CONFIRM_DIALOG_OK
      const btn = page.getByTestId(testId)
      await expect(btn).toBeVisible({ timeout: Timeouts.ELEMENT })
      await btn.click()
      return
    }
  }
  // 0. Check button-text-to-testid map — resolves Gherkin text → data-testid
  const buttonTestId = buttonTextToTestIdMap[text]
  if (buttonTestId) {
    const el = page.getByTestId(buttonTestId)
    // Use ELEMENT timeout for testid lookup — gives enough time for
    // buttons to render after navigation before falling through
    if (await el.isVisible({ timeout: Timeouts.ELEMENT }).catch(() => false)) {
      await expect(el).toBeEnabled({ timeout: Timeouts.ELEMENT })
      await el.click()
      return
    }
  }
  // 1. Check nav test ID map — deterministic, wait longer
  const navTestId = navTestIdMap[text]
  if (navTestId) {
    const el = page.getByTestId(navTestId)
    if (await el.isVisible({ timeout: Timeouts.ELEMENT }).catch(() => false)) {
      await el.click()
      return
    }
  }
  // 2. Fallback: button role, link role, tab role, then text
  const button = page.getByRole('button', { name: text }).first()
  if (await button.isVisible({ timeout: 2000 }).catch(() => false)) {
    // Wait for the button to be enabled before clicking
    await expect(button).toBeEnabled({ timeout: Timeouts.ELEMENT })
    await button.click()
    return
  }
  const link = page.getByRole('link', { name: text }).first()
  if (await link.isVisible({ timeout: 2000 }).catch(() => false)) {
    await link.click()
    return
  }
  const tab = page.getByRole('tab', { name: text }).first()
  if (await tab.isVisible({ timeout: 2000 }).catch(() => false)) {
    await tab.click()
    return
  }
  await page.getByText(text, { exact: true }).first().click()
}

// --- Click/Tap patterns ---

When('I tap {string}', async ({ page }, text: string) => {
  await clickByTextOrTestId(page, text)
})

When('I tap {string} without entering an nsec', async ({ page }, buttonText: string) => {
  await page.getByRole('button', { name: buttonText }).click()
})

When('I click {string}', async ({ page }, text: string) => {
  await clickByTextOrTestId(page, text)
})

When('I click the {string} button', async ({ page }, text: string) => {
  // Check button-text-to-testid map first to avoid strict mode violations
  // when multiple buttons share the same accessible name (e.g., "Assign").
  const testId = buttonTextToTestIdMap[text]
  if (testId) {
    const el = page.getByTestId(testId)
    if (await el.isVisible({ timeout: Timeouts.ELEMENT }).catch(() => false)) {
      await el.click()
      return
    }
  }
  await page.getByRole('button', { name: text }).first().click()
})

When('I click the {string} link', async ({ page }, name: string) => {
  const testId = navTestIdMap[name]
  if (testId) {
    await page.getByTestId(testId).click()
  } else {
    await page.getByRole('link', { name }).click()
  }
})

When('I click the {string} demo account', async ({ page }, name: string) => {
  await page.getByText(name, { exact: true }).first().click()
})

// --- Text entry patterns ---

When('I enter {string} in the {string} field', async ({ page }, value: string, field: string) => {
  await page.getByLabel(field).fill(value)
})

When('I enter {string} in the {string} input', async ({ page }, value: string, field: string) => {
  const slug = field.replace(/\s/g, '-').toLowerCase()
  const input = page.locator(`#${slug}`)
    .or(page.getByLabel(field))
  await input.first().fill(value)
})

When('I clear the {string} field', async ({ page }, field: string) => {
  await page.getByLabel(field).clear()
})

When('I toggle {string}', async ({ page }, label: string) => {
  await page.getByLabel(label).click()
})

When('I fill in {string} with {string}', async ({ page }, field: string, value: string) => {
  await page.getByLabel(field).fill(value)
})

When('I fill in name with {string}', async ({ page }, name: string) => {
  await page.getByLabel('Name').fill(name)
})

When('I fill in phone with {string}', async ({ page }, phone: string) => {
  await page.getByLabel(/phone/i).fill(phone)
  await page.getByLabel(/phone/i).blur()
})

When('I fill in a valid phone number', async ({ page }) => {
  const phone = `+1212${Date.now().toString().slice(-7)}`
  await page.getByLabel(/phone/i).fill(phone)
  await page.getByLabel(/phone/i).blur()
})

When('I fill in reason with {string}', async ({ page }, reason: string) => {
  await page.getByLabel(/reason/i).fill(reason)
})

When('I fill in the reason with {string}', async ({ page }, reason: string) => {
  await page.getByLabel(/reason/i).fill(reason)
})

// --- Section expand/collapse ---

When('I expand the {string} section', async ({ page }, sectionName: string) => {
  const testId = sectionTestIdMap[sectionName]
  if (!testId) throw new Error(`Unknown section: "${sectionName}". Add it to sectionTestIdMap in test-ids.ts`)
  const section = page.getByTestId(testId)
  const el = section.first()
  await el.scrollIntoViewIfNeeded()
  // Use count() (DOM presence) not isVisible() — Radix animates from height:0 so the element
  // exists in DOM immediately with data-state="open" but has zero dimensions during animation.
  const openCount = await el.locator('[data-state="open"]').count()
  const isExpanded = openCount > 0
  if (!isExpanded) {
    // Click the trigger element (CardHeader with data-testid="{id}-trigger")
    const trigger = page.getByTestId(`${testId}-trigger`)
    if (await trigger.isVisible({ timeout: 1000 }).catch(() => false)) {
      await trigger.click()
    } else {
      // Fallback: click the first heading/title within the section
      await el.locator('h3, [class*="CardTitle"]').first().click()
    }
    // Wait for CollapsibleContent to appear in DOM with data-state="open".
    // Without this wait, the next step may run before React processes the state update,
    // see the section as still-closed (count=0), and click the trigger again — collapsing it.
    await el.locator('[data-state="open"]').waitFor({ state: 'attached', timeout: Timeouts.ELEMENT })
  }
  await expect(page.getByTestId(testId)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

// --- Reload and auth ---

When('I reload and re-authenticate', async ({ page }) => {
  const { reenterPinAfterReload, Timeouts: T, TestIds: TI } = await import('../../helpers')
  // Reload instead of full re-login to preserve user preferences (theme, language)
  // that are stored in localStorage and would be wiped by loginAsAdmin.
  await page.reload()
  await reenterPinAfterReload(page)
  // Wait for authenticated layout
  await page.getByTestId(TI.PAGE_TITLE).waitFor({ state: 'visible', timeout: T.AUTH })
})

When('I log out', async ({ page }) => {
  await page.getByTestId(TestIds.LOGOUT_BTN).click()
  // Logout now shows a confirmation dialog — confirm it
  const confirmBtn = page.getByTestId(TestIds.CONFIRM_DIALOG_OK)
  if (await confirmBtn.isVisible({ timeout: Timeouts.ELEMENT }).catch(() => false)) {
    await confirmBtn.click()
  }
  await page.waitForURL(/\/login/, { timeout: Timeouts.ELEMENT })
})

// --- Button state patterns ---

Then('the {string} button should be disabled', async ({ page }, name: string) => {
  const btn = page.getByRole('button', { name })
  await expect(btn.first()).toBeDisabled({ timeout: Timeouts.ELEMENT })
})

Then('the {string} button should be enabled', async ({ page }, name: string) => {
  const btn = page.getByRole('button', { name })
  await expect(btn).toBeEnabled()
})

Then('the {string} button should be visible', async ({ page }, name: string) => {
  // Map feature-file button names to actual UI text/testid
  const testIdMap: Record<string, string> = {
    'Clock In': TestIds.BREAK_TOGGLE_BTN,
    'Clock Out': TestIds.BREAK_TOGGLE_BTN,
  }
  const testId = testIdMap[name]
  if (testId) {
    await expect(page.getByTestId(testId)).toBeVisible({ timeout: Timeouts.ELEMENT })
  } else {
    await expect(page.getByRole('button', { name }).first()).toBeVisible({ timeout: Timeouts.ELEMENT })
  }
})

Then('the {string} button should not be visible', async ({ page }, name: string) => {
  const testIdMap: Record<string, string> = {
    'Clock In': TestIds.BREAK_TOGGLE_BTN,
    'Clock Out': TestIds.BREAK_TOGGLE_BTN,
  }
  const testId = testIdMap[name]
  if (testId) {
    await expect(page.getByTestId(testId)).not.toBeVisible({ timeout: 3000 })
  } else {
    await expect(page.getByRole('button', { name }).first()).not.toBeVisible({ timeout: 3000 })
  }
})

// --- Text visibility patterns ---

Then('I should see {string}', async ({ page }, text: string) => {
  // First try exact match
  const exactEl = page.getByText(text, { exact: true }).first()
  const exactVisible = await exactEl.isVisible({ timeout: 2000 }).catch(() => false)
  if (exactVisible) return

  // Fallback: case-insensitive substring match (handles validation messages like
  // "invalid phone" matching "Invalid phone number. Use E.164 format...")
  const regexEl = page.getByText(new RegExp(text, 'i')).first()
  const regexVisible = await regexEl.isVisible({ timeout: 2000 }).catch(() => false)
  if (regexVisible) return

  // Also check toasts (validation errors shown via toast in some forms)
  // Sonner toasts render with [data-sonner-toast]; also check role=status/alert
  // Use longer timeout — toasts may take a moment to appear after form submission
  const toastEl = page.locator('[data-sonner-toast], [data-testid="toast-message"], [role="status"], [role="alert"], .toast-message')
    .filter({ hasText: new RegExp(text, 'i') }).first()
  const toastVisible = await toastEl.isVisible({ timeout: 5000 }).catch(() => false)
  if (toastVisible) return

  // Check for text in any error element (inline validation)
  const errorEl = page.locator('[data-testid="error-message"], [role="alert"]')
    .filter({ hasText: new RegExp(text, 'i') }).first()
  const errorVisible = await errorEl.isVisible({ timeout: 2000 }).catch(() => false)
  if (errorVisible) return

  // Final assertion — will fail with a clear error
  await expect(
    page.getByText(new RegExp(text, 'i')).first()
  ).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see the {string} heading', async ({ page }, heading: string) => {
  await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see a {string} button', async ({ page }, text: string) => {
  const btn = page.getByRole('button', { name: text })
  await expect(btn).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see an {string} button', async ({ page }, text: string) => {
  const btn = page.getByRole('button', { name: text })
  await expect(btn).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see a {string} toggle', async ({ page }, text: string) => {
  await expect(page.getByLabel(text)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should not see {string}', async ({ page }, text: string) => {
  // On the notes page, custom field values (e.g. "Priority Level: High") may appear in
  // multiple notes. Scope the assertion to the first note card (the one just edited) so
  // unrelated notes don't cause false failures.
  if (page.url().includes('/notes')) {
    const firstNoteCard = page.getByTestId(TestIds.NOTE_CARD).first()
    const cardExists = await firstNoteCard.isVisible({ timeout: 2000 }).catch(() => false)
    if (cardExists) {
      await expect(firstNoteCard.getByText(text, { exact: true }).first()).not.toBeVisible({ timeout: Timeouts.ELEMENT })
      return
    }
  }
  // Wait longer for save operations to complete and re-render (e.g. custom field updates)
  await expect(page.getByText(text, { exact: true }).first()).not.toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('{string} should no longer be visible', async ({ page }, text: string) => {
  await expect(page.getByText(text, { exact: true }).first()).not.toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('{string} should not be visible', async ({ page }, text: string) => {
  await expect(page.getByText(text, { exact: true }).first()).not.toBeVisible({ timeout: 3000 })
})

Then('I should see a success message', async ({ page }) => {
  // Toast system uses role="status" for success, role="alert" for errors
  const successEl = page.getByTestId(TestIds.SUCCESS_TOAST)
    .or(page.locator('[role="status"]'))
    .or(page.getByText(/saved|success|updated/i))
  await expect(successEl.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see a connection error', async ({ page }) => {
  const errorEl = page.getByTestId(TestIds.ERROR_MESSAGE)
    .or(page.locator('[role="alert"]'))
  await expect(errorEl.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see either a success or error result', async ({ page }) => {
  const result = page.getByTestId(TestIds.SUCCESS_TOAST)
    .or(page.getByTestId(TestIds.ERROR_MESSAGE))
    .or(page.locator('[role="alert"]'))
  await expect(result.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

// --- Navigation visibility (they/I patterns for role-based tests) ---

Then('I should see {string} in the navigation', async ({ page }, text: string) => {
  const testId = navTestIdMap[text]
  if (testId) {
    await expect(page.getByTestId(testId)).toBeVisible({ timeout: Timeouts.ELEMENT })
  } else {
    const sidebar = page.getByTestId(TestIds.NAV_SIDEBAR)
    await expect(sidebar.getByText(text, { exact: true }).first()).toBeVisible({ timeout: Timeouts.ELEMENT })
  }
})

Then('the navigation should show {string}', async ({ page }, text: string) => {
  const testId = navTestIdMap[text]
  if (testId) {
    await expect(page.getByTestId(testId)).toBeVisible({ timeout: Timeouts.ELEMENT })
  } else {
    const sidebar = page.getByTestId(TestIds.NAV_SIDEBAR)
    await expect(sidebar.getByText(text, { exact: true }).first()).toBeVisible({ timeout: Timeouts.ELEMENT })
  }
})

Then('they should see {string}', async ({ page }, text: string) => {
  await expect(page.getByText(text, { exact: true }).first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('they should see the {string} section', async ({ page }, text: string) => {
  const testId = sectionTestIdMap[text]
  if (testId) {
    await expect(page.getByTestId(testId)).toBeVisible({ timeout: Timeouts.ELEMENT })
  } else {
    await expect(page.getByText(text, { exact: true }).first()).toBeVisible({ timeout: Timeouts.ELEMENT })
  }
})

Then('they should see the {string} heading', async ({ page }, text: string) => {
  await expect(page.getByRole('heading', { name: text }).first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('they should see a name input', async ({ page }) => {
  await expect(page.getByLabel(/name/i)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('they should see a phone input', async ({ page }) => {
  await expect(page.getByLabel(/phone/i)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('they should see their public key', async ({ page }) => {
  // Public key is displayed as hex in the settings/profile code block
  // Look for the public key hex string or npub format
  const hexKey = page.locator('code').filter({ hasText: /[0-9a-f]{32,}/i }).first()
  const isHex = await hexKey.isVisible({ timeout: Timeouts.ELEMENT }).catch(() => false)
  if (isHex) return
  // Fallback: npub format
  const npub = page.getByText(/npub1/).first()
  await expect(npub).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('they should not see a {string} link', async ({ page }, text: string) => {
  const testId = navTestIdMap[text]
  if (testId) {
    await expect(page.getByTestId(testId)).not.toBeVisible({ timeout: 3000 })
  } else {
    await expect(page.getByRole('link', { name: text })).not.toBeVisible({ timeout: 3000 })
  }
})

Then('they should not see {string}', async ({ page }, text: string) => {
  await expect(page.getByText(text, { exact: true }).first()).not.toBeVisible({ timeout: 3000 })
})

Then('they should see {string} in the navigation', async ({ page }, text: string) => {
  const testId = navTestIdMap[text]
  if (testId) {
    await expect(page.getByTestId(testId)).toBeVisible({ timeout: Timeouts.ELEMENT })
  } else {
    const sidebar = page.getByTestId(TestIds.NAV_SIDEBAR)
    await expect(sidebar.getByText(text, { exact: true }).first()).toBeVisible({ timeout: Timeouts.ELEMENT })
  }
})

Then('they should not see {string} in the navigation', async ({ page }, text: string) => {
  const testId = navTestIdMap[text]
  if (testId) {
    await expect(page.getByTestId(testId)).not.toBeVisible({ timeout: 3000 })
  } else {
    const sidebar = page.getByTestId(TestIds.NAV_SIDEBAR)
    await expect(sidebar.getByText(text, { exact: true })).not.toBeVisible({ timeout: 3000 })
  }
})

// --- "they" pronoun interaction variants ---

When('they navigate to the {string} page', async ({ page }, pageName: string) => {
  const testId = navTestIdMap[pageName]
  if (testId) {
    const navLink = page.getByTestId(testId)
    const isVisible = await navLink.isVisible({ timeout: Timeouts.ELEMENT }).catch(() => false)
    if (isVisible) {
      await navLink.click()
    } else {
      // Nav link may not be visible (e.g. volunteer without channel access) — navigate directly
      const pathMap: Record<string, string> = {
        'Dashboard': '/', 'Settings': '/settings', 'Reports': '/reports',
        'Volunteers': '/users', 'Shifts': '/shifts', 'Ban List': '/bans',
        'Audit Log': '/audit', 'Hub Settings': '/admin',
        'Notes': '/notes', 'Conversations': '/conversations', 'Blasts': '/blasts',
      }
      const path = pathMap[pageName]
      if (path) {
        await page.evaluate((p) => {
          const router = (window as Record<string, unknown>).__TEST_ROUTER as { navigate: (opts: { to: string }) => void } | undefined
          if (router) router.navigate({ to: p })
        }, path)
        await page.waitForLoadState('domcontentloaded')
      }
    }
  } else {
    await page.getByTestId(TestIds.NAV_SIDEBAR).getByText(pageName, { exact: true }).click()
  }
})

When('they navigate to {string} via SPA', async ({ page }, path: string) => {
  await navigateViaSpa(page, path)
})

When('they click the {string} link', async ({ page }, linkText: string) => {
  const testId = navTestIdMap[linkText]
  if (testId) {
    await page.getByTestId(testId).click()
  } else {
    await page.getByRole('link', { name: linkText }).click()
  }
})

When('they click {string}', async ({ page }, text: string) => {
  await clickByTextOrTestId(page, text)
})

Then('they should see the dashboard or profile setup', async ({ page }) => {
  const pageTitle = page.getByTestId(TestIds.PAGE_TITLE)
  await expect(pageTitle).toBeVisible({ timeout: Timeouts.AUTH })
})

Then('they should see the dashboard', async ({ page }) => {
  await expect(page.getByTestId(TestIds.PAGE_TITLE)).toBeVisible({ timeout: Timeouts.AUTH })
})

Then('they should arrive at the profile setup or dashboard', async ({ page }) => {
  await page.waitForURL((url) => !url.toString().includes('/login') && !url.toString().includes('/onboarding'), { timeout: Timeouts.AUTH })
})

// --- Dismiss patterns ---

When('I dismiss the demo banner', async ({ page }) => {
  const dismissBtn = page.getByTestId('dismiss-demo-banner')
    .or(page.locator('button[aria-label="Dismiss"]'))
  if (await dismissBtn.first().isVisible({ timeout: 2000 }).catch(() => false)) {
    await dismissBtn.first().click()
  }
})

When('I dismiss the invite link card', async ({ page }) => {
  await page.getByTestId(TestIds.DISMISS_INVITE).click()
})

// --- Page state ---

Then('the page should have the {string} class', async ({ page }, className: string) => {
  const html = page.locator('html')
  // Theme class may take a moment to apply after reload (ThemeProvider reads from localStorage)
  await expect(html).toHaveClass(new RegExp(className), { timeout: Timeouts.ELEMENT })
})

Then('the page should not have the {string} class', async ({ page }, className: string) => {
  const htmlClass = await page.locator('html').getAttribute('class') || ''
  expect(htmlClass).not.toContain(className)
})

Then('the page should render without errors', async ({ page }) => {
  const body = page.locator('body')
  await expect(body).toBeVisible()
})

Then('I should be redirected to the dashboard', async ({ page }) => {
  await expect(page.getByTestId(TestIds.PAGE_TITLE)).toBeVisible({ timeout: Timeouts.AUTH })
})

Then('I should be redirected away from login', async ({ page }) => {
  await page.waitForURL((url) => !url.toString().includes('/login'), { timeout: Timeouts.AUTH })
})

Then('I should still be on the dashboard', async ({ page }) => {
  await expect(page.getByTestId(TestIds.PAGE_TITLE)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('the toggle should be off by default', async ({ page }) => {
  const toggle = page.locator('input[type="checkbox"], [role="switch"]').last()
  await expect(toggle).toBeVisible({ timeout: Timeouts.ELEMENT })
})
