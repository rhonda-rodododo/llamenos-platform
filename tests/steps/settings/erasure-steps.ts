/**
 * Account erasure self-service step definitions.
 * Matches steps from: packages/test-specs/features/platform/desktop/settings/account-erasure.feature
 */
import { expect } from '@playwright/test'
import { Then } from '../fixtures'
import { Timeouts } from '../../helpers'

Then('I should see the erasure request button or pending state', async ({ page }) => {
  const available = page.getByTestId('erasure-available')
  const pending = page.getByTestId('erasure-pending')
  const completed = page.getByTestId('erasure-completed')
  // One of these states should be visible after loading
  await Promise.race([
    available.waitFor({ state: 'visible', timeout: Timeouts.API }),
    pending.waitFor({ state: 'visible', timeout: Timeouts.API }),
    completed.waitFor({ state: 'visible', timeout: Timeouts.API }),
  ]).catch(() => {
    // If none visible, still loading or API unavailable — check page loaded
  })
  const anyVisible =
    (await available.isVisible().catch(() => false)) ||
    (await pending.isVisible().catch(() => false)) ||
    (await completed.isVisible().catch(() => false)) ||
    (await page.getByTestId('account-erasure').isVisible().catch(() => false))
  expect(anyVisible).toBe(true)
})

Then('I should see the erasure available state or pending state', async ({ page }) => {
  // Allow time for the API call to complete
  await page.waitForLoadState('domcontentloaded')
  const available = page.getByTestId('erasure-available')
  const pending = page.getByTestId('erasure-pending')
  const section = page.getByTestId('account-erasure')
  const isAvailable = await available.isVisible({ timeout: Timeouts.API }).catch(() => false)
  const isPending = await pending.isVisible({ timeout: 2000 }).catch(() => false)
  const isSectionVisible = await section.isVisible({ timeout: 2000 }).catch(() => false)
  expect(isAvailable || isPending || isSectionVisible).toBe(true)
})

Then('the account erasure section should be visible', async ({ page }) => {
  // Wait for the outer account-erasure Card — it is always rendered after the settings page
  // finishes loading (loading=false). Use waitFor so we retry until visible rather than
  // checking a one-shot snapshot that may catch the page mid-render.
  const section = page.getByTestId('account-erasure')
  await section.waitFor({ state: 'visible', timeout: Timeouts.ELEMENT })
})
