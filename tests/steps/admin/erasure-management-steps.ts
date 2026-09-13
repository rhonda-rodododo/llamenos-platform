/**
 * Admin erasure management step definitions.
 * Matches steps from: packages/test-specs/features/platform/desktop/admin/erasure-management.feature
 */
import { expect } from '@playwright/test'
import { When, Then } from '../fixtures'
import { Timeouts } from '../../helpers'

Then('I should see the erasure queue or empty state', async ({ page }) => {
  // The section only mounts once its request list has loaded (erasure-loading renders
  // until then), so either the list or the empty state proves the queue rendered.
  const queue = page.getByTestId('erasure-queue')
  await expect(
    queue.getByTestId('erasure-request-list').or(queue.getByTestId('erasure-empty')),
  ).toBeVisible({ timeout: Timeouts.API })
})

Then('I should see the erasure config form', async ({ page }) => {
  const config = page.getByTestId('erasure-config')
  await expect(config.getByTestId('erasure-delay-input')).toBeVisible({ timeout: Timeouts.API })
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
