/**
 * Theme step definitions.
 * Matches steps from: packages/test-specs/features/settings/theme.feature
 */
import { expect } from '@playwright/test'
import { When, Then } from '../fixtures'
import { Timeouts } from '../../helpers'

// --- Theme button clicks ---

When('I click the dark theme button', async ({ page }) => {
  const darkBtn = page.locator(
    'button[aria-label*="dark" i], button:has-text("Dark"), [data-testid="theme-dark"]',
  )
  await darkBtn.first().click()
  await page.waitForTimeout(Timeouts.UI_SETTLE)
})

When('I click the light theme button', async ({ page }) => {
  const lightBtn = page.locator(
    'button[aria-label*="light" i], button:has-text("Light"), [data-testid="theme-light"]',
  )
  await lightBtn.first().click()
  await page.waitForTimeout(Timeouts.UI_SETTLE)
})

When('I click the system theme button', async ({ page }) => {
  const systemBtn = page.locator(
    'button[aria-label*="system" i], button:has-text("System"), [data-testid="theme-system"]',
  )
  await systemBtn.first().click()
  await page.waitForTimeout(Timeouts.UI_SETTLE)
})

// --- Theme assertions on login page ---

Then('I should see the dark theme button on the login page', async ({ page }) => {
  const darkBtn = page.locator(
    'button[aria-label*="dark" i], button:has-text("Dark"), [data-testid="theme-dark"]',
  )
  await expect(darkBtn.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see the light theme button on the login page', async ({ page }) => {
  const lightBtn = page.locator(
    'button[aria-label*="light" i], button:has-text("Light"), [data-testid="theme-light"]',
  )
  await expect(lightBtn.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see the system theme button on the login page', async ({ page }) => {
  const systemBtn = page.locator(
    'button[aria-label*="system" i], button:has-text("System"), [data-testid="theme-system"]',
  )
  await expect(systemBtn.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})
