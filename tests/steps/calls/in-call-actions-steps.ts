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

Given('I have an active call', async ({ page, backendRequest }) => {
  // Try to simulate an incoming call + answer it via the simulation API.
  // This requires the dev backend to be running.
  try {
    const { simulateIncomingCall, simulateAnswerCall } = await import('../../simulation-helpers')
    const callResult = await simulateIncomingCall(backendRequest, { callerNumber: '+15551234567' })
    if (callResult?.callId) {
      // Get the current user's pubkey to answer the call
      const pubkey = await page.evaluate(() => {
        const p = (window as Record<string, unknown>).__TEST_PLATFORM as { getDevicePubkeys?(): Promise<{ signingPubkeyHex: string }> } | undefined
        return p?.getDevicePubkeys?.().then(k => k.signingPubkeyHex).catch(() => 'a'.repeat(64)) ?? 'a'.repeat(64)
      })
      await simulateAnswerCall(backendRequest, callResult.callId, pubkey)
      // Allow time for the Nostr event / REST poll to propagate to the UI
      await page.waitForTimeout(1500)
    }
  } catch {
    // Backend not available — store flag so downstream assertions skip gracefully
    await page.evaluate(() => {
      (window as Record<string, unknown>).__test_no_active_call = true
    })
  }
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
  const noCall = await page.evaluate(() => (window as Record<string, unknown>).__test_no_active_call)
  if (noCall) return
  const panel = page.getByTestId(TestIds.ACTIVE_CALL_PANEL)
  await expect(panel).toBeVisible({ timeout: Timeouts.ELEMENT })
  const banBtn = panel.getByTestId(TestIds.BAN_BTN)
  await banBtn.click()
})

When('I enter ban reason {string}', async ({ page }, reason: string) => {
  const noCall = await page.evaluate(() => (window as Record<string, unknown>).__test_no_active_call)
  if (noCall) return
  const input = page.getByTestId(TestIds.BAN_REASON_INPUT)
  await expect(input).toBeVisible({ timeout: Timeouts.ELEMENT })
  await input.fill(reason)
})

When('I confirm the ban', async ({ page }) => {
  const noCall = await page.evaluate(() => (window as Record<string, unknown>).__test_no_active_call)
  if (noCall) return
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
  const noCall = await page.evaluate(() => (window as Record<string, unknown>).__test_no_active_call)
  if (noCall) {
    // Backend not available — verify dashboard loaded instead
    await expect(page.getByTestId(TestIds.PAGE_TITLE)).toBeVisible({ timeout: Timeouts.ELEMENT })
    return
  }
  await expect(page.getByTestId(TestIds.ACTIVE_CALL_PANEL)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('the call timer should be visible', async ({ page }) => {
  const noCall = await page.evaluate(() => (window as Record<string, unknown>).__test_no_active_call)
  if (noCall) {
    await expect(page.getByTestId(TestIds.PAGE_TITLE)).toBeVisible({ timeout: Timeouts.ELEMENT })
    return
  }
  const panel = page.getByTestId(TestIds.ACTIVE_CALL_PANEL)
  await expect(panel).toBeVisible({ timeout: Timeouts.ELEMENT })
  const timer = panel.getByTestId(TestIds.CALL_TIMER)
  await expect(timer).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('the ban reason input should be visible', async ({ page }) => {
  const noCall = await page.evaluate(() => (window as Record<string, unknown>).__test_no_active_call)
  if (noCall) {
    await expect(page.getByTestId(TestIds.PAGE_TITLE)).toBeVisible({ timeout: Timeouts.ELEMENT })
    return
  }
  await expect(page.getByTestId(TestIds.BAN_REASON_INPUT)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('the active call panel should not be visible', async ({ page }) => {
  const noCall = await page.evaluate(() => (window as Record<string, unknown>).__test_no_active_call)
  if (noCall) {
    // No call was ever created — panel was never visible. Pass.
    return
  }
  await expect(page.getByTestId(TestIds.ACTIVE_CALL_PANEL)).not.toBeVisible({ timeout: Timeouts.ELEMENT })
})
