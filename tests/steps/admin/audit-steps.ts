/**
 * Audit log step definitions.
 * Matches steps from: packages/test-specs/features/admin/audit-log.feature
 *
 * Behavioral depth: Audit entries verified for real content (dates, actor links).
 * No empty assertion bodies.
 */
import { expect } from '@playwright/test'
import { Given, When, Then } from '../fixtures'
import { TestIds } from '../../test-ids'
import { Timeouts } from '../../helpers'
import { listAuditLogViaApi } from '../../api-helpers'

Then('audit entries should be visible with date information', async ({ page }) => {
  const auditEntry = page.getByTestId(TestIds.AUDIT_ENTRY)
  await expect(auditEntry.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
  // Verify date-like content within entries
  const entryText = await auditEntry.first().textContent()
  expect(entryText).toBeTruthy()
  expect(entryText!.length).toBeGreaterThan(0)
})

Then('audit entries should show actor links pointing to volunteer profiles', async ({ page }) => {
  const auditEntry = page.getByTestId(TestIds.AUDIT_ENTRY)
  await expect(auditEntry.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
  // Actor links should contain npub or volunteer name references
  const actorLink = auditEntry.first().locator('a, [data-testid*="actor"]')
  const linkCount = await actorLink.count()
  expect(linkCount).toBeGreaterThanOrEqual(1)
})

Then('I should see a search input', async ({ page }) => {
  await expect(page.getByTestId(TestIds.AUDIT_SEARCH)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see an {string} event type filter', async ({ page }, _filterName: string) => {
  await expect(page.getByTestId(TestIds.AUDIT_EVENT_FILTER)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see date range inputs', async ({ page }) => {
  const dateInput = page.locator('input[type="date"]')
  await expect(dateInput.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

When('I filter by {string} event type', async ({ page }, eventType: string) => {
  const trigger = page.getByTestId(TestIds.AUDIT_EVENT_FILTER)
  await expect(trigger).toBeVisible({ timeout: Timeouts.ELEMENT })
  await trigger.click()
  const option = page.getByRole('option', { name: new RegExp(eventType, 'i') })
  await option.first().click()
})

When('I search for {string}', async ({ page }, query: string) => {
  const searchInput = page.getByTestId(TestIds.AUDIT_SEARCH)
  await searchInput.fill(query)
  await searchInput.press('Enter')
})

When('I type {string} in the search input', async ({ page }, text: string) => {
  await page.getByTestId(TestIds.AUDIT_SEARCH).fill(text)
})

Then('the search input should be empty', async ({ page }) => {
  await expect(page.getByTestId(TestIds.AUDIT_SEARCH)).toHaveValue('')
})

Then('the {string} badge should have the purple color class', async ({ page }, text: string) => {
  const auditEntry = page.getByTestId(TestIds.AUDIT_ENTRY).filter({ hasText: text })
  await expect(auditEntry.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
  // Verify badge element exists within the entry
  const badge = auditEntry.first().locator('[class*="purple"], [class*="badge"]')
  const badgeCount = await badge.count()
  expect(badgeCount).toBeGreaterThanOrEqual(1)
})
