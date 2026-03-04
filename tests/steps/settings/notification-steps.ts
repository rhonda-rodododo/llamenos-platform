/**
 * Notification preferences step definitions.
 * Matches steps from: packages/test-specs/features/settings/notifications.feature
 *
 * Behavioral depth: Hard assertions on notification section elements.
 */
import { expect } from '@playwright/test'
import { When, Then } from '../fixtures'
import { Timeouts } from '../../helpers'

Then('I should see the notifications section', async ({ page }) => {
  await expect(page.getByTestId('notifications')).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see the notification toggles', async ({ page }) => {
  const section = page.getByTestId('notifications')
  await expect(section).toBeVisible({ timeout: Timeouts.ELEMENT })
  // Verify at least one toggle exists within the section
  const toggles = section.locator('input[type="checkbox"], [role="switch"]')
  const count = await toggles.count()
  expect(count).toBeGreaterThanOrEqual(1)
})
