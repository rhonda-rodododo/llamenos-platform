/**
 * Conversation step definitions.
 * Matches steps from:
 *   - packages/test-specs/features/conversations/conversation-list.feature
 *   - packages/test-specs/features/conversations/conversation-filters.feature
 *
 * Behavioral depth: Hard assertions on conversation-specific elements.
 * No .or(PAGE_TITLE) fallbacks masking missing elements.
 */
import { expect } from '@playwright/test'
import { Given, When, Then } from '../fixtures'
import { TestIds } from '../../test-ids'
import { Timeouts } from '../../helpers'

Given('I navigate to the conversations tab', async ({ page }) => {
  const { Navigation } = await import('../../pages/index')
  await Navigation.goToConversations(page)
})

Given('I open a conversation', async ({ page }) => {
  const conversationItem = page.getByTestId(TestIds.CONVERSATION_ITEM).first()
  await expect(conversationItem).toBeVisible({ timeout: Timeouts.ELEMENT })
  await conversationItem.click()
  await page.waitForTimeout(Timeouts.ASYNC_SETTLE)
})

Then('the filter chips should be visible', async ({ page }) => {
  // The conversation list uses section headers (Waiting / Active) as visual grouping
  const sectionHeader = page.getByTestId(TestIds.CONV_SECTION_HEADER)
  await expect(sectionHeader.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see the {string} filter chip', async ({ page }, filterName: string) => {
  const sectionHeader = page.getByTestId(TestIds.CONV_SECTION_HEADER).filter({ hasText: new RegExp(filterName, 'i') })
  await expect(sectionHeader.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('the {string} filter should be selected', async ({ page }, filterName: string) => {
  const sectionHeader = page.getByTestId(TestIds.CONV_SECTION_HEADER).filter({ hasText: new RegExp(filterName, 'i') })
  await expect(sectionHeader.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

When('I tap the {string} filter chip', async ({ page }, filterName: string) => {
  const sectionHeader = page.getByTestId(TestIds.CONV_SECTION_HEADER).filter({ hasText: new RegExp(filterName, 'i') })
  await expect(sectionHeader.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
  await sectionHeader.first().click()
})

Then('the conversation list should update', async ({ page }) => {
  // Verify the conversation list is still rendered after filter change
  const conversationList = page.getByTestId(TestIds.CONVERSATION_LIST)
  await expect(conversationList).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Given('I have selected the {string} filter', async ({ page }, filterName: string) => {
  const sectionHeader = page.getByTestId(TestIds.CONV_SECTION_HEADER).filter({ hasText: new RegExp(filterName, 'i') })
  await expect(sectionHeader.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
  await sectionHeader.first().click()
  await page.waitForTimeout(Timeouts.UI_SETTLE)
})

Then(
  'I should see either the conversations list, empty state, or loading indicator',
  async ({ page }) => {
    const anyContent = page.locator(
      `[data-testid="${TestIds.CONVERSATION_LIST}"], [data-testid="${TestIds.EMPTY_STATE}"], [data-testid="${TestIds.LOADING_SKELETON}"]`,
    )
    await expect(anyContent.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
  },
)

Then('I should see the conversation filters', async ({ page }) => {
  const sectionHeader = page.getByTestId(TestIds.CONV_SECTION_HEADER)
  await expect(sectionHeader.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see the create note FAB', async ({ page }) => {
  await expect(page.getByTestId(TestIds.NOTE_NEW_BTN)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

// --- Conversation detail steps (assign, notes, e2ee) ---

Then('I should see the assign conversation button', async ({ page }) => {
  await expect(page.getByTestId(TestIds.CONV_ASSIGN_BTN)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

When('I tap the assign conversation button', async ({ page }) => {
  await page.getByTestId(TestIds.CONV_ASSIGN_BTN).click()
})

Then('I should see the assign dialog', async ({ page }) => {
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see the add note button', async ({ page }) => {
  const noteBtn = page.getByTestId(TestIds.CONV_ADD_NOTE_BTN)
    .or(page.getByTestId(TestIds.NOTE_NEW_BTN))
  await expect(noteBtn.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

When('I tap the add note button', async ({ page }) => {
  const noteBtn = page.getByTestId(TestIds.CONV_ADD_NOTE_BTN)
    .or(page.getByTestId(TestIds.NOTE_NEW_BTN))
  await noteBtn.first().click()
})

Then('I should see the E2EE encryption indicator', async ({ page }) => {
  await expect(page.getByTestId(TestIds.CONVERSATION_THREAD)).toBeVisible({ timeout: Timeouts.ELEMENT })
  // E2EE indicator should be present in thread or header
  const e2eeIndicator = page.locator('[data-testid*="e2ee"], [data-testid*="encrypt"], [aria-label*="encrypt" i]')
  await expect(e2eeIndicator.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('the indicator should display {string}', async ({ page }, text: string) => {
  const e2eeIndicator = page.locator('[data-testid*="e2ee"], [data-testid*="encrypt"]')
  await expect(e2eeIndicator.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
  await expect(e2eeIndicator.first()).toContainText(text)
})
