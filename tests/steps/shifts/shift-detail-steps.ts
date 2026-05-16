/**
 * Shift detail step definitions.
 * Matches steps from: packages/test-specs/features/admin/shift-management.feature
 *
 * Desktop: Shifts are managed inline (edit form in-page), not via a detail screen.
 * "Tap a shift card" opens the edit form; "back button" cancels it.
 */
import { expect } from '@playwright/test'
import { When, Then } from '../fixtures'
import { TestIds } from '../../test-ids'
import { Timeouts } from '../../helpers'
import { listShiftsViaApi, createShiftViaApi } from '../../api-helpers'

When('I tap a shift card', async ({ page, backendRequest: request, workerHub }) => {
  // Ensure at least one shift exists so the tap has something to click.
  const existingShifts = await listShiftsViaApi(request, workerHub).catch(() => [])
  if (existingShifts.length === 0) {
    await createShiftViaApi(request, { name: `Auto-seeded Shift ${Date.now()}`, hubId: workerHub })
  }
  // Navigate to /shifts using React Router (soft SPA navigation) so the React app stays
  // alive and the key manager remains unlocked.
  // page.goto('/shifts') would cause a full browser reload which evicts the in-memory
  // key manager state, landing the user on the PIN entry screen instead of /shifts.
  const navLink = page.getByTestId(TestIds.NAV_SHIFTS)
  const navVisible = await navLink.isVisible({ timeout: 3000 }).catch(() => false)
  if (navVisible) {
    await navLink.click()
  } else {
    // Fallback: use the exposed router for soft navigation if sidebar is collapsed.
    await page.evaluate(() => {
      const w = window as unknown as { __TEST_ROUTER?: { navigate: (opts: { to: string }) => void } }
      w.__TEST_ROUTER?.navigate({ to: '/shifts' })
    })
  }
  await page.waitForURL('**/shifts', { timeout: Timeouts.NAVIGATION })

  // Set up response waiter BEFORE triggering the invalidation so we don't miss the
  // response if the refetch fires synchronously in the next microtask.
  // This is required because the shifts query may have cached stale/empty data from a
  // prior fetch (if the component mounted before setActiveHub() was called by
  // ConfigProvider, the query used a null hub prefix and returned empty results).
  const shiftsResponse = page.waitForResponse(
    r => {
      const url = r.url()
      return (
        url.includes('/shifts') &&
        !url.includes('/active') &&
        !url.includes('/fallback') &&
        !url.includes('/requests') &&
        !url.includes('/availability') &&
        !url.includes('/overrides') &&
        r.status() === 200
      )
    },
    { timeout: Timeouts.API },
  )
  // Invalidate the shifts list so React Query re-fetches with the correct hub.
  await page.evaluate(() => {
    const w = window as unknown as { __TEST_QUERY_CLIENT?: { invalidateQueries: (opts: { queryKey: string[] }) => void } }
    w.__TEST_QUERY_CLIENT?.invalidateQueries({ queryKey: ['shifts', 'list'] })
  })
  // Wait for the HTTP response to confirm the hub-scoped data has been fetched.
  await shiftsResponse
  const shiftCard = page.getByTestId(TestIds.SHIFT_CARD).first()
  await expect(shiftCard).toBeVisible({ timeout: Timeouts.ELEMENT })
  // Desktop: click the edit button on the shift card to open the inline edit form
  const editBtn = shiftCard.getByTestId(TestIds.SHIFT_EDIT_BTN)
  await editBtn.click()
  // Wait for the edit form to appear
  await expect(page.getByTestId(TestIds.SHIFT_FORM)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see the shift detail screen', async ({ page }) => {
  // Desktop: the shift edit form is the "detail screen"
  await expect(page.getByTestId(TestIds.SHIFT_FORM)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see the shift info card', async ({ page }) => {
  // Desktop: shift form contains shift info (name, times)
  await expect(page.getByTestId(TestIds.SHIFT_NAME_INPUT)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see the volunteer assignment section', async ({ page }) => {
  // Desktop: UserMultiSelect combobox in the shift form
  const form = page.getByTestId(TestIds.SHIFT_FORM)
  const combobox = form.getByRole('combobox')
  await expect(combobox).toBeVisible({ timeout: Timeouts.ELEMENT })
})

When('I tap a volunteer assignment card', async ({ page }) => {
  // Desktop: volunteer assignment is via UserMultiSelect combobox, not cards
  const form = page.getByTestId(TestIds.SHIFT_FORM)
  const combobox = form.getByRole('combobox')
  await expect(combobox).toBeVisible({ timeout: Timeouts.ELEMENT })

  // Count currently selected badges before toggling
  const badgesBefore = await combobox.locator('[role="button"]').count()
  await page.evaluate((count) => {
    (window as Record<string, unknown>).__test_badge_count_before = count
  }, badgesBefore)

  // Open the dropdown and click the first volunteer
  await combobox.click()
  const firstOption = page.locator('[cmdk-item]').first()
  await expect(firstOption).toBeVisible({ timeout: Timeouts.ELEMENT })
  await firstOption.click()
})

Then('the volunteer assignment should toggle', async ({ page }) => {
  // Desktop: verify the badge count changed (volunteer added or removed)
  const form = page.getByTestId(TestIds.SHIFT_FORM)
  const combobox = form.getByRole('combobox')
  const badgesBefore = (await page.evaluate(() =>
    (window as Record<string, unknown>).__test_badge_count_before,
  )) as number
  const badgesAfter = await combobox.locator('[role="button"]').count()
  expect(badgesAfter).not.toBe(badgesBefore)
})

When('I tap the back button on the shift detail', async ({ page }) => {
  // Desktop: "back" means cancel the edit form
  const cancelBtn = page.getByTestId(TestIds.FORM_CANCEL_BTN)
  await expect(cancelBtn).toBeVisible({ timeout: Timeouts.ELEMENT })
  await cancelBtn.click()
})
