/**
 * Account erasure self-service step definitions.
 * Matches steps from: packages/test-specs/features/platform/desktop/settings/account-erasure.feature
 */
import { expect } from '@playwright/test'
import { Then } from '../fixtures'
import { Timeouts } from '../../helpers'

Then('I should see the erasure request button or pending state', async ({ page }) => {
  // Waits for the section to leave its loading state and render one of its three
  // terminal states. `.or()` keeps this a single retrying assertion — no snapshot probes.
  const section = page.getByTestId('account-erasure')
  const settled = section.getByTestId('erasure-available')
    .or(section.getByTestId('erasure-pending'))
    .or(section.getByTestId('erasure-completed'))
  await expect(settled).toBeVisible({ timeout: Timeouts.API })
})

Then('I should see the erasure available state or pending state', async ({ page }) => {
  // Background logs in a freshly created volunteer, who cannot have an erasure request
  // yet, so the only correct terminal state is "available" with the request button.
  const section = page.getByTestId('account-erasure')
  await expect(section.getByTestId('erasure-available')).toBeVisible({ timeout: Timeouts.API })
  await expect(section.getByTestId('erasure-request-btn')).toBeVisible()
  await expect(section.getByTestId('erasure-pending')).toHaveCount(0)
})

Then('the account erasure section should be visible', async ({ page }) => {
  // Wait for the outer account-erasure Card — it is always rendered after the settings page
  // finishes loading (loading=false). Use waitFor so we retry until visible rather than
  // checking a one-shot snapshot that may catch the page mid-render.
  const section = page.getByTestId('account-erasure')
  await section.waitFor({ state: 'visible', timeout: Timeouts.ELEMENT })
})
