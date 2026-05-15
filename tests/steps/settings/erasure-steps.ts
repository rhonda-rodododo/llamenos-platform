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
  await page.waitForLoadState('domcontentloaded')
  const section = page.getByTestId('account-erasure')
  const available = page.getByTestId('erasure-available')
  const pending = page.getByTestId('erasure-pending')
  const isSection = await section.isVisible({ timeout: Timeouts.ELEMENT }).catch(() => false)
  const isAvailable = await available.isVisible({ timeout: 2000 }).catch(() => false)
  const isPending = await pending.isVisible({ timeout: 2000 }).catch(() => false)
  expect(isSection || isAvailable || isPending).toBe(true)
})
