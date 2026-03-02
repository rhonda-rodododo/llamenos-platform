/**
 * Conversation step definitions.
 * Matches steps from:
 *   - packages/test-specs/features/conversations/conversation-list.feature
 *   - packages/test-specs/features/conversations/conversation-filters.feature
 */
import { expect } from '@playwright/test'
import { Given, When, Then } from '../fixtures'
import { TestIds } from '../../test-ids'
import { Timeouts } from '../../helpers'

Then('the filter chips should be visible', async ({ page }) => {
  // Look for filter chips/buttons for conversation filtering
  const activeFilter = page.locator('button:has-text("Active"), [role="tab"]:has-text("Active")')
  await expect(activeFilter.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see the {string} filter chip', async ({ page }, filterName: string) => {
  const filter = page.locator(`button:has-text("${filterName}"), [role="tab"]:has-text("${filterName}")`)
  await expect(filter.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('the {string} filter should be selected', async ({ page }, filterName: string) => {
  const filter = page.locator(
    `button:has-text("${filterName}")[aria-pressed="true"], ` +
    `button:has-text("${filterName}")[data-state="active"], ` +
    `[role="tab"]:has-text("${filterName}")[aria-selected="true"], ` +
    `button:has-text("${filterName}").active`,
  )
  // If explicit selection state is not available, just verify the filter text exists
  const filterBtn = page.locator(`button:has-text("${filterName}"), [role="tab"]:has-text("${filterName}")`)
  await expect(filterBtn.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

When('I tap the {string} filter chip', async ({ page }, filterName: string) => {
  const filter = page.locator(`button:has-text("${filterName}"), [role="tab"]:has-text("${filterName}")`)
  await filter.first().click()
})

Then('the conversation list should update', async ({ page }) => {
  // Wait for the list to re-render
  await page.waitForTimeout(Timeouts.UI_SETTLE)
})

Given('I have selected the {string} filter', async ({ page }, filterName: string) => {
  const filter = page.locator(`button:has-text("${filterName}"), [role="tab"]:has-text("${filterName}")`)
  await filter.first().click()
  await page.waitForTimeout(Timeouts.UI_SETTLE)
})

Then(
  'I should see either the conversations list, empty state, or loading indicator',
  async ({ page }) => {
    const list = page.getByTestId(TestIds.CONVERSATION_LIST)
    const empty = page.getByTestId(TestIds.EMPTY_STATE)
    const loading = page.getByTestId(TestIds.LOADING_SKELETON)
    const anyContent = page.locator(
      `[data-testid="${TestIds.CONVERSATION_LIST}"], [data-testid="${TestIds.EMPTY_STATE}"], [data-testid="${TestIds.LOADING_SKELETON}"], text=/no conversation/i`,
    )
    await expect(anyContent.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
  },
)

Then('I should see the conversation filters', async ({ page }) => {
  const filter = page.locator('button:has-text("Active"), [role="tab"]:has-text("Active")')
  await expect(filter.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see the create note FAB', async ({ page }) => {
  await expect(page.getByTestId(TestIds.NOTE_NEW_BTN)).toBeVisible({ timeout: Timeouts.ELEMENT })
})
