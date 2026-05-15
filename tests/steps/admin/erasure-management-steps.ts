/**
 * Admin erasure management step definitions.
 * Matches steps from: packages/test-specs/features/platform/desktop/admin/erasure-management.feature
 */
import { expect } from '@playwright/test'
import { When, Then } from '../fixtures'
import { Timeouts } from '../../helpers'

Then('I should see the erasure queue or empty state', async ({ page }) => {
  await page.waitForLoadState('domcontentloaded')
  const requestList = page.getByTestId('erasure-request-list')
  const empty = page.getByTestId('erasure-empty')
  const section = page.locator('[data-testid^="erasure-"]').first()
  const hasList = await requestList.isVisible({ timeout: Timeouts.API }).catch(() => false)
  const hasEmpty = await empty.isVisible({ timeout: 2000 }).catch(() => false)
  const hasSection = await section.isVisible({ timeout: 2000 }).catch(() => false)
  expect(hasList || hasEmpty || hasSection).toBe(true)
})

Then('I should see the erasure config form', async ({ page }) => {
  await page.waitForLoadState('domcontentloaded')
  // Erasure config section shows delay hours input
  const form = page.locator('input[type="number"]').first()
  const section = page.getByTestId('admin-section')
  const hasForm = await form.isVisible({ timeout: Timeouts.ELEMENT }).catch(() => false)
  const hasSection = await section.isVisible({ timeout: Timeouts.ELEMENT }).catch(() => false)
  expect(hasForm || hasSection).toBe(true)
})

Then('I should see the admin erase button', async ({ page }) => {
  const btn = page.getByTestId('erasure-admin-erase-btn')
  await expect(btn).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see the admin wipe button', async ({ page }) => {
  const btn = page.getByTestId('erasure-admin-wipe-btn')
  await expect(btn).toBeVisible({ timeout: Timeouts.ELEMENT })
})

When('I click the admin erase button', async ({ page }) => {
  await page.getByTestId('erasure-admin-erase-btn').click()
})

When('I click the admin wipe button', async ({ page }) => {
  await page.getByTestId('erasure-admin-wipe-btn').click()
})

Then('I should see a dialog for entering user ID and justification', async ({ page }) => {
  const userIdInput = page.getByTestId('erase-user-id-input')
  const justificationInput = page.getByTestId('erase-justification-input')
  await expect(userIdInput).toBeVisible({ timeout: Timeouts.ELEMENT })
  await expect(justificationInput).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see a dialog for entering user ID and device pubkey', async ({ page }) => {
  const userIdInput = page.getByTestId('wipe-user-id-input')
  const pubkeyInput = page.getByTestId('wipe-device-pubkey-input')
  await expect(userIdInput).toBeVisible({ timeout: Timeouts.ELEMENT })
  await expect(pubkeyInput).toBeVisible({ timeout: Timeouts.ELEMENT })
})
