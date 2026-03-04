/**
 * Key backup settings step definitions.
 * Matches steps from: packages/test-specs/features/settings/key-backup.feature
 *
 * Behavioral depth: Hard assertions on key-backup section.
 */
import { expect } from '@playwright/test'
import { When, Then } from '../fixtures'
import { Timeouts } from '../../helpers'

Then('I should see the key backup section', async ({ page }) => {
  await expect(page.getByTestId('key-backup')).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see the key backup warning', async ({ page }) => {
  const keyBackup = page.getByTestId('key-backup')
  await expect(keyBackup).toBeVisible({ timeout: Timeouts.ELEMENT })
  // Warning text should be present within the section
  const warningText = keyBackup.getByText(/backup|secure|nsec|recovery/i)
  await expect(warningText.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})
