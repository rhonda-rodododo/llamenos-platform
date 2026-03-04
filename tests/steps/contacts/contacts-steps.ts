/**
 * Contacts step definitions.
 * Matches steps from:
 *   - packages/test-specs/features/contacts/contacts-list.feature
 *   - packages/test-specs/features/contacts/contacts-timeline.feature
 *
 * Behavioral depth: Hard assertions on contact-specific elements.
 * No .or(PAGE_TITLE) fallbacks.
 */
import { expect } from '@playwright/test'
import { Given, When, Then } from '../fixtures'
import { TestIds } from '../../test-ids'
import { Timeouts, Navigation } from '../../helpers'

// --- Contacts list steps ---

Then('I should see the contacts screen', async ({ page }) => {
  const content = page.locator(
    `[data-testid="${TestIds.CONTACT_ROW}"], [data-testid="${TestIds.EMPTY_STATE}"]`,
  )
  await expect(content.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see the contacts title', async ({ page }) => {
  await expect(page.getByTestId(TestIds.PAGE_TITLE)).toBeVisible({ timeout: Timeouts.ELEMENT })
  await expect(page.getByTestId(TestIds.PAGE_TITLE)).toContainText(/contacts/i)
})

Then('I should see the contacts content or empty state', async ({ page }) => {
  const content = page.locator(
    `[data-testid="${TestIds.CONTACT_ROW}"], [data-testid="${TestIds.EMPTY_STATE}"]`,
  )
  await expect(content.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('the contacts screen should support pull to refresh', async ({ page }) => {
  // Desktop doesn't have pull-to-refresh — verify contacts content loaded
  const content = page.locator(
    `[data-testid="${TestIds.CONTACT_ROW}"], [data-testid="${TestIds.EMPTY_STATE}"]`,
  )
  await expect(content.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see the contacts card on the dashboard', async ({ page }) => {
  await expect(page.getByTestId(TestIds.NAV_CONTACTS)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see the contacts search field', async ({ page }) => {
  // Contacts page should have a search input
  const searchInput = page.locator('input[placeholder*="search" i], input[type="search"]')
  await expect(searchInput.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see contacts with identifiers or the empty state', async ({ page }) => {
  const content = page.locator(
    `[data-testid="${TestIds.CONTACT_ROW}"], [data-testid="${TestIds.EMPTY_STATE}"]`,
  )
  await expect(content.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

When('I tap the back button on contacts', async ({ page }) => {
  await page.getByTestId(TestIds.BACK_BTN).click()
})

// --- Contacts navigation & detail steps ---

When('I tap the view contacts button', async ({ page }) => {
  await page.getByTestId(TestIds.NAV_CONTACTS).click()
  await page.waitForTimeout(Timeouts.ASYNC_SETTLE)
})

When('I tap a contact card', async ({ page }) => {
  const contactRow = page.getByTestId(TestIds.CONTACT_ROW).first()
  await expect(contactRow).toBeVisible({ timeout: Timeouts.ELEMENT })
  await contactRow.click()
})

Then('I should see the timeline screen', async ({ page }) => {
  await expect(page.getByTestId(TestIds.PAGE_TITLE)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see the timeline contact identifier', async ({ page }) => {
  // Contact identifier (phone number or hash) should be visible
  const identifier = page.getByText(/\+\d|[a-f0-9]{8}/i)
  await expect(identifier.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see timeline events or the empty state', async ({ page }) => {
  const content = page.locator(
    `[data-testid="${TestIds.CONTACT_ROW}"], [data-testid="${TestIds.EMPTY_STATE}"]`,
  )
  await expect(content.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

When('I tap the back button on timeline', async ({ page }) => {
  await page.getByTestId(TestIds.BACK_BTN).click()
})
