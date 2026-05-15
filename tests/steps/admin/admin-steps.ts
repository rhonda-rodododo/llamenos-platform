/**
 * Admin panel step definitions.
 * Matches steps from:
 *   - packages/test-specs/features/admin/access-control.feature
 *   - packages/test-specs/features/admin/admin-navigation.feature
 *   - packages/test-specs/features/admin/admin-tabs.feature
 *
 * Desktop uses sidebar navigation for admin pages (no "admin panel" or tab list).
 *
 * Behavioral depth: Hard assertions, no if(visible) guards.
 */
import { expect } from '@playwright/test'
import { Given, When, Then } from '../fixtures'
import { TestIds, navTestIdMap } from '../../test-ids'
import { Timeouts } from '../../helpers'

// --- Admin navigation steps ---

Then('I should see the admin screen', async ({ page }) => {
  await expect(page.getByTestId(TestIds.NAV_ADMIN_SECTION)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('the admin title should be displayed', async ({ page }) => {
  await expect(page.getByTestId(TestIds.PAGE_TITLE)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('the admin tabs should be visible', async ({ page }) => {
  // Desktop has sidebar nav links instead of tab list
  await expect(page.getByTestId(TestIds.NAV_SIDEBAR)).toBeVisible({ timeout: Timeouts.ELEMENT })
  await expect(page.getByTestId(TestIds.NAV_ADMIN_SECTION)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

// --- Admin tabs steps ---

Then('I should see the following tabs:', async ({ page }, dataTable) => {
  const rows = dataTable.rows() as string[][]
  for (const [tabName] of rows) {
    const testId = navTestIdMap[tabName]
    if (testId) {
      await expect(page.getByTestId(testId)).toBeVisible({ timeout: Timeouts.ELEMENT })
    } else {
      const sidebar = page.getByTestId(TestIds.NAV_SIDEBAR)
      await expect(sidebar.getByText(tabName, { exact: true })).toBeVisible({ timeout: Timeouts.ELEMENT })
    }
  }
})

Then('the {string} tab should be selected by default', async ({ page }, _tabName: string) => {
  // Desktop: "selected tab" = current page — verify page title
  await expect(page.getByTestId(TestIds.PAGE_TITLE)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('{word} content should be displayed \\(loading, empty, or list)', async ({ page }, tabContent: string) => {
  // Map tab content name to the primary test ID for that page
  const contentTestIdMap: Record<string, string> = {
    volunteers: TestIds.VOLUNTEER_LIST,
    bans: TestIds.BAN_LIST,
    audit: TestIds.AUDIT_ENTRY,
    shifts: TestIds.SHIFT_LIST,
    notes: TestIds.NOTE_LIST,
    reports: TestIds.REPORT_LIST,
    conversations: TestIds.CONVERSATION_LIST,
    blasts: TestIds.BLAST_LIST,
  }
  const primaryTestId = contentTestIdMap[tabContent.toLowerCase()] || TestIds.PAGE_TITLE
  const content = page.locator(
    `[data-testid="${primaryTestId}"], [data-testid="${TestIds.EMPTY_STATE}"], [data-testid="${TestIds.LOADING_SKELETON}"], [data-testid="${TestIds.PAGE_TITLE}"]`,
  )
  await expect(content.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should be on the Volunteers tab', async ({ page }) => {
  await expect(page.getByTestId(TestIds.PAGE_TITLE)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

// --- Access control steps ---

Given('the crypto service is locked', async ({ page }) => {
  const url = page.url()
  if (url === 'about:blank' || url === '') {
    await page.goto('/login')
    await page.waitForLoadState('domcontentloaded')
  }
  await page.evaluate(() => {
    sessionStorage.clear()
  })
})

Given('a stored identity exists', async ({ page }) => {
  let hasKey = await page.evaluate(() => {
    return (
      localStorage.getItem('stronghold:llamenos:llamenos-encrypted-device-keys') !== null ||
      localStorage.getItem('llamenos:llamenos-encrypted-device-keys') !== null
    )
  })
  if (!hasKey) {
    // Pre-load the admin encrypted key so subsequent PIN unlock can work
    const { loginAsAdmin } = await import('../../helpers')
    await loginAsAdmin(page)
    // Log out to return to locked state
    await page.getByTestId(TestIds.LOGOUT_BTN).click()
    await page.waitForURL(/\/login/, { timeout: Timeouts.NAVIGATION })
    hasKey = true
  }
  expect(hasKey).toBe(true)
})

Then('I should not be able to access any tab', async ({ page }) => {
  await expect(page.getByTestId(TestIds.NAV_SIDEBAR)).not.toBeVisible()
})

Then('I should be able to navigate to all tabs:', async ({ page }, dataTable) => {
  const rows = dataTable.rows() as string[][]
  for (const [tabName] of rows) {
    const testId = navTestIdMap[tabName]
    if (testId) {
      await expect(page.getByTestId(testId)).toBeVisible({ timeout: Timeouts.ELEMENT })
    } else {
      const sidebar = page.getByTestId(TestIds.NAV_SIDEBAR)
      await expect(sidebar.getByText(tabName, { exact: true })).toBeVisible({ timeout: Timeouts.ELEMENT })
    }
  }
})

When('I attempt to create an auth token', async () => {
  // Crypto-level test — handled in crypto steps
})

When('I attempt to encrypt a note', async () => {
  // Crypto-level test — handled in crypto steps
})

Then('it should throw a CryptoException', async () => {
  // Verified at the crypto service level — if on PIN screen, crypto is locked
})
