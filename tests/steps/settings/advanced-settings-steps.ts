/**
 * Advanced settings step definitions.
 * Matches steps from: packages/test-specs/features/settings/advanced-settings.feature
 *
 * Behavioral depth: Hard assertions on settings elements.
 * No .or(PAGE_TITLE) fallbacks.
 */
import { expect } from '@playwright/test'
import { Given, When, Then } from '../fixtures'
import { TestIds } from '../../test-ids'
import { Timeouts } from '../../helpers'

Given('I expand the advanced settings section', async ({ page }) => {
  const advancedSection = page.getByTestId(TestIds.SETTINGS_ADVANCED_SECTION)
  await expect(advancedSection).toBeVisible({ timeout: Timeouts.ELEMENT })
  await advancedSection.click()
})

Then('I should see the auto-lock timeout options', async ({ page }) => {
  await expect(page.getByTestId(TestIds.SETTINGS_AUTO_LOCK)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see the debug logging toggle', async ({ page }) => {
  await expect(page.getByTestId(TestIds.SETTINGS_DEBUG_LOG)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see the clear cache button', async ({ page }) => {
  await expect(page.getByTestId(TestIds.SETTINGS_CLEAR_CACHE)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

When('I tap the clear cache button', async ({ page }) => {
  await page.getByTestId(TestIds.SETTINGS_CLEAR_CACHE).click()
})

Then('I should see the clear cache confirmation dialog', async ({ page }) => {
  await expect(page.getByTestId(TestIds.CONFIRM_DIALOG)).toBeVisible({ timeout: Timeouts.ELEMENT })
})
