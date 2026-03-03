/**
 * Auth guard step definitions.
 * Matches steps from: packages/test-specs/features/desktop/auth/auth-guards.feature
 * Covers route protection, PIN re-entry after reload, logout clearing session, and API 401.
 */
import { expect } from '@playwright/test'
import { Given, When, Then } from '../fixtures'
import { enterPin, TEST_PIN } from '../../helpers'

Given('I am not authenticated', async ({ page }) => {
  await page.goto('/login')
  await page.evaluate(() => {
    localStorage.clear()
    sessionStorage.clear()
  })
})

// "I visit {string} without authentication" is defined in navigation-steps.ts

When('I reload the page', async ({ page }) => {
  await page.reload()
})

When('I re-enter the correct PIN', async ({ page }) => {
  await enterPin(page, TEST_PIN)
})

When('I make an unauthenticated API request to {string}', async ({ page }, endpoint: string) => {
  const response = await page.request.get(endpoint)
  await page.evaluate((status) => {
    ;(window as Record<string, unknown>).__test_api_response_status = status
  }, response.status())
})

Then('the response status should be {int}', async ({ page }, expectedStatus: number) => {
  const status = await page.evaluate(
    () => (window as Record<string, unknown>).__test_api_response_status,
  )
  expect(status).toBe(expectedStatus)
})
