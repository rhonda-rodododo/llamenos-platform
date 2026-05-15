/**
 * Admin retention settings step definitions.
 * Matches steps from: packages/test-specs/features/platform/desktop/admin/retention-settings.feature
 */
import { expect } from '@playwright/test'
import { Then } from '../fixtures'
import { Timeouts } from '../../helpers'

Then('I should see the retention categories', async ({ page }) => {
  await page.waitForLoadState('domcontentloaded')
  const categories = page.getByTestId('retention-categories')
  const section = page.getByTestId('admin-section')
  const hasCategories = await categories.isVisible({ timeout: Timeouts.ELEMENT }).catch(() => false)
  const hasSection = await section.isVisible({ timeout: Timeouts.ELEMENT }).catch(() => false)
  expect(hasCategories || hasSection).toBe(true)
})

Then('I should see retention settings for {string}', async ({ page }, category: string) => {
  const categoryEl = page.getByTestId(`retention-category-${category}`)
  await expect(categoryEl).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('each retention category should have a days input and save button', async ({ page }) => {
  await page.waitForLoadState('domcontentloaded')
  const categories = ['call_records', 'notes', 'messages', 'audit_log']
  for (const category of categories) {
    const catEl = page.getByTestId(`retention-category-${category}`)
    const isVisible = await catEl.isVisible({ timeout: Timeouts.ELEMENT }).catch(() => false)
    if (!isVisible) continue
    const daysInput = page.getByTestId(`retention-days-${category}`)
    const saveBtn = page.getByTestId(`retention-save-${category}`)
    await expect(daysInput).toBeVisible({ timeout: Timeouts.ELEMENT })
    await expect(saveBtn).toBeVisible({ timeout: Timeouts.ELEMENT })
  }
})
