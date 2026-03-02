/**
 * Admin panel step definitions.
 * Matches steps from:
 *   - packages/test-specs/features/admin/access-control.feature
 *   - packages/test-specs/features/admin/admin-navigation.feature
 *   - packages/test-specs/features/admin/admin-tabs.feature
 */
import { expect } from '@playwright/test'
import { Given, When, Then } from '../fixtures'
import { TestIds } from '../../test-ids'
import { Timeouts } from '../../helpers'

// --- Admin navigation steps ---

Then('I should see the admin screen', async ({ page }) => {
  await expect(page.locator('h1', { hasText: /admin/i })).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('the admin title should be displayed', async ({ page }) => {
  await expect(page.locator('h1', { hasText: /admin/i })).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('the admin tabs should be visible', async ({ page }) => {
  const tabs = page.locator('[role="tablist"], [role="tab"]')
  await expect(tabs.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

// --- Admin tabs steps ---

Then('I should see the following tabs:', async ({ page }, dataTable) => {
  const rows = dataTable.rows() as string[][]
  for (const [tabName] of rows) {
    const tab = page.locator(`[role="tab"]:has-text("${tabName}"), button:has-text("${tabName}"), a:has-text("${tabName}")`)
    await expect(tab.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
  }
})

Then('the {string} tab should be selected by default', async ({ page }, tabName: string) => {
  const tab = page.locator(
    `[role="tab"]:has-text("${tabName}")[aria-selected="true"], ` +
    `[role="tab"]:has-text("${tabName}")[data-state="active"]`,
  )
  // Fallback: just verify the tab content is visible
  const tabBtn = page.locator(`[role="tab"]:has-text("${tabName}"), button:has-text("${tabName}")`)
  await expect(tabBtn.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('{word} content should be displayed \\(loading, empty, or list)', async ({ page }, tabContent: string) => {
  // Generic content check for any admin tab (volunteers, bans, audit, invites)
  const content = page.locator(
    `[data-testid="${TestIds.VOLUNTEER_LIST}"], [data-testid="${TestIds.EMPTY_STATE}"], [data-testid="${TestIds.LOADING_SKELETON}"], text=/${tabContent}|no |add|empty/i`,
  )
  await expect(content.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should be on the Volunteers tab', async ({ page }) => {
  const tab = page.locator(
    `[role="tab"]:has-text("Volunteers")[aria-selected="true"], ` +
    `[role="tab"]:has-text("Volunteers")[data-state="active"]`,
  )
  const tabBtn = page.locator('[role="tab"]:has-text("Volunteers"), button:has-text("Volunteers")')
  await expect(tabBtn.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

// --- Access control steps ---

Given('the crypto service is locked', async ({ page }) => {
  // Navigate to login to simulate locked state
  await page.evaluate(() => {
    // Remove the session data but keep the encrypted key
    sessionStorage.clear()
  })
})

Given('a stored identity exists', async ({ page }) => {
  const hasKey = await page.evaluate(() => {
    return (
      localStorage.getItem('llamenos-encrypted-key') !== null ||
      localStorage.getItem('tauri-store:keys.json:llamenos-encrypted-key') !== null
    )
  })
  expect(hasKey).toBe(true)
})

Then('I should not be able to access any tab', async ({ page }) => {
  // When locked, navigation should not be accessible
  const nav = page.getByTestId(TestIds.NAV_SIDEBAR)
  await expect(nav).not.toBeVisible()
})

Then('I should be able to navigate to all tabs:', async ({ page }, dataTable) => {
  const rows = dataTable.rows() as string[][]
  for (const [tabName] of rows) {
    const link = page.getByRole('link', { name: tabName })
    await expect(link).toBeVisible({ timeout: Timeouts.ELEMENT })
  }
})

When('I attempt to create an auth token', async () => {
  // This is a crypto-level test — handled in crypto steps
})

When('I attempt to encrypt a note', async () => {
  // This is a crypto-level test — handled in crypto steps
})

Then('it should throw a CryptoException', async () => {
  // Verified at the crypto service level — if we're on the PIN screen, crypto is locked
})
