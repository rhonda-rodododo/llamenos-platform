/**
 * Desktop step definitions for in-call UI actions (Epic 351).
 *
 * Tests the ActiveCallPanel component: visibility during calls,
 * ban dialog with custom reason, and panel dismissal on call end.
 */
import { expect } from '@playwright/test'
import { Given, When, Then } from '../fixtures'
import { TestIds } from '../../test-ids'
import { Timeouts } from '../../helpers'

// ── Given ──────────────────────────────────────────────────────────

Given('I have an active call', async ({ page }) => {
  // The test environment must simulate an active call state.
  // This is typically done via the mock WebSocket / call state provider.
  // For now, we verify the panel appears when the app reports an active call.
})

// ── When ───────────────────────────────────────────────────────────

When('I view the dashboard', async ({ page }) => {
  const dashboardNav = page.getByTestId(TestIds.NAV_DASHBOARD)
  const isVisible = await dashboardNav.isVisible({ timeout: Timeouts.ELEMENT }).catch(() => false)
  if (isVisible) {
    await dashboardNav.click()
  }
})

When('I click the ban button on the active call panel', async ({ page }) => {
  const panel = page.getByTestId(TestIds.ACTIVE_CALL_PANEL)
  await expect(panel).toBeVisible({ timeout: Timeouts.ELEMENT })
  const banBtn = panel.getByTestId(TestIds.BAN_BTN)
  await banBtn.click()
})

When('I enter ban reason {string}', async ({ page }, reason: string) => {
  const input = page.getByTestId(TestIds.BAN_REASON_INPUT)
  await expect(input).toBeVisible({ timeout: Timeouts.ELEMENT })
  await input.fill(reason)
})

When('I confirm the ban', async ({ page }) => {
  const confirmBtn = page.getByTestId(TestIds.BAN_CONFIRM_BTN)
  await expect(confirmBtn).toBeVisible({ timeout: Timeouts.ELEMENT })
  await confirmBtn.click()
})

When('the call ends', async ({ page }) => {
  // Simulate call end — the mock call state provider should clear the active call.
  // This step depends on the test harness providing a way to end calls programmatically.
})

// ── Then ───────────────────────────────────────────────────────────

Then('the active call panel should be visible', async ({ page }) => {
  await expect(page.getByTestId(TestIds.ACTIVE_CALL_PANEL)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('the call timer should be visible', async ({ page }) => {
  const panel = page.getByTestId(TestIds.ACTIVE_CALL_PANEL)
  await expect(panel).toBeVisible({ timeout: Timeouts.ELEMENT })
  const timer = panel.getByTestId(TestIds.CALL_TIMER)
  await expect(timer).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('the ban reason input should be visible', async ({ page }) => {
  await expect(page.getByTestId(TestIds.BAN_REASON_INPUT)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('the active call panel should not be visible', async ({ page }) => {
  await expect(page.getByTestId(TestIds.ACTIVE_CALL_PANEL)).not.toBeVisible({ timeout: Timeouts.ELEMENT })
})
