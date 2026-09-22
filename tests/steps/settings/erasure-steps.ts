/**
 * Account erasure self-service step definitions.
 * Matches steps from: packages/test-specs/features/platform/desktop/settings/account-erasure.feature
 */
import { expect } from '@playwright/test'
import { Then } from '../fixtures'
import { Timeouts } from '../../helpers'

Then('I should see the erasure request button or pending state', async ({ page }) => {
  // One of these states should be visible once the settings API call resolves.
  // A combined `.or()` locator with a single waiting assertion replaces the old
  // Promise.race(waitFor) + isVisible() double-check — isVisible() never waits
  // (its `timeout` option is a documented no-op), so re-checking with it after
  // the race raced the page load a second time for no benefit.
  //
  // `section` (`account-erasure`) is the outer Card and `available`/`pending`/
  // `completed` render *inside* it, so they are not mutually exclusive from
  // `.or()`'s perspective: both the child testid and its ancestor testid match
  // at once, and the union resolves to 2 elements — tripping Playwright strict
  // mode on `toBeVisible()`. The outer `.first()` collapses the union to a
  // single DOM match, which is safe since any one of these states matching is
  // sufficient (CI evidence: PR #916, e2e shard 2, `strict mode violation: …
  // resolved to 2 elements` — `account-erasure` card + nested `erasure-available`).
  const available = page.getByTestId('erasure-available')
  const pending = page.getByTestId('erasure-pending')
  const completed = page.getByTestId('erasure-completed')
  const section = page.getByTestId('account-erasure')
  await expect(available.or(pending).or(completed).or(section).first()).toBeVisible({ timeout: Timeouts.API })
})

Then('I should see the erasure available state or pending state', async ({ page }) => {
  // See the comment above — `section` is an ancestor of `available`/`pending`, so the
  // outer `.first()` is required to keep the union to a single strict-mode match.
  const available = page.getByTestId('erasure-available')
  const pending = page.getByTestId('erasure-pending')
  const section = page.getByTestId('account-erasure')
  await expect(available.or(pending).or(section).first()).toBeVisible({ timeout: Timeouts.API })
})

Then('the account erasure section should be visible', async ({ page }) => {
  // Wait for the outer account-erasure Card — it is always rendered after the settings page
  // finishes loading (loading=false). Use waitFor so we retry until visible rather than
  // checking a one-shot snapshot that may catch the page mid-render.
  const section = page.getByTestId('account-erasure')
  await section.waitFor({ state: 'visible', timeout: Timeouts.ELEMENT })
})
