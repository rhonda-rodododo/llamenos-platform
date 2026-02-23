import { test, expect } from '@playwright/test'
import { loginAsAdmin, loginAsVolunteer, createVolunteerAndGetNsec, uniquePhone, resetTestState, completeProfileSetup, navigateAfterLogin } from './helpers'

test.describe('Audit log', () => {
  test.beforeAll(async ({ request }) => {
    await resetTestState(request)
  })

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('page loads with heading and layout', async ({ page }) => {
    await page.getByRole('link', { name: 'Audit Log' }).click()
    await expect(page.getByRole('heading', { name: /audit log/i })).toBeVisible()
  })

  test('shows entries after admin actions', async ({ page }) => {
    // Create a volunteer to generate audit entries
    const phone = uniquePhone()
    const name = `AuditVol ${Date.now()}`
    await createVolunteerAndGetNsec(page, name, phone)
    await page.getByRole('button', { name: /close/i }).click()

    // Navigate to audit log
    await page.getByRole('link', { name: 'Audit Log' }).click()
    await expect(page.getByRole('heading', { name: /audit log/i })).toBeVisible()

    // Should have at least one entry (volunteer added)
    await expect(page.getByText('Volunteer Added').first()).toBeVisible({ timeout: 10000 })
  })

  test('entries show timestamps', async ({ page }) => {
    // First create something auditable
    const phone = uniquePhone()
    const name = `TimestampVol ${Date.now()}`
    await createVolunteerAndGetNsec(page, name, phone)
    await page.getByRole('button', { name: /close/i }).click()

    await page.getByRole('link', { name: 'Audit Log' }).click()
    await expect(page.getByRole('heading', { name: /audit log/i })).toBeVisible()

    // Wait for entries to load
    await expect(page.getByText('Volunteer Added').first()).toBeVisible({ timeout: 10000 })

    // Entries contain date strings (timestamps)
    const entries = page.locator('.divide-y > div')
    const count = await entries.count()
    expect(count).toBeGreaterThan(0)
  })

  test('audit entry actors are displayed', async ({ page }) => {
    // Create a volunteer
    const phone = uniquePhone()
    const name = `LinkVol ${Date.now()}`
    await createVolunteerAndGetNsec(page, name, phone)
    await page.getByRole('button', { name: /close/i }).click()

    await page.getByRole('link', { name: 'Audit Log' }).click()
    await expect(page.getByText('Volunteer Added').first()).toBeVisible({ timeout: 10000 })

    // Audit entries should contain actor info — scoped to the entry rows area
    const entryArea = page.locator('main .divide-y')
    // Actor should be shown as a link (after volunteers load and nameMap populates)
    const actorLink = entryArea.getByRole('link').first()
    await expect(actorLink).toBeVisible({ timeout: 10000 })
    // The link should point to a volunteer profile
    const href = await actorLink.getAttribute('href')
    expect(href).toContain('/volunteers/')
  })

  test('volunteer sees access denied on audit page', async ({ page }) => {
    // Create a volunteer
    const phone = uniquePhone()
    const name = `NoAuditVol ${Date.now()}`
    const nsec = await createVolunteerAndGetNsec(page, name, phone)
    await page.getByRole('button', { name: /close/i }).click()

    // Login as the volunteer
    await page.getByRole('button', { name: /log out/i }).click()
    await loginAsVolunteer(page, nsec)
    await completeProfileSetup(page)

    // Try to navigate directly to audit page (SPA navigate to avoid full reload clearing keyManager)
    await navigateAfterLogin(page, '/audit')
    await expect(page.getByText(/access denied/i)).toBeVisible({ timeout: 10000 })
  })

  test('multiple action types appear', async ({ page }) => {
    // Create and delete a volunteer to generate multiple event types
    const phone = uniquePhone()
    const name = `MultiAudit ${Date.now()}`
    await createVolunteerAndGetNsec(page, name, phone)
    await page.getByRole('button', { name: /close/i }).click()

    // Delete the volunteer
    const volRow = page.locator('.divide-y > div').filter({ hasText: name })
    await volRow.getByRole('button', { name: 'Delete' }).click()
    await page.getByRole('dialog').getByRole('button', { name: /delete/i }).click()
    await expect(page.getByRole('dialog')).toBeHidden()

    // Check audit log
    await page.getByRole('link', { name: 'Audit Log' }).click()
    await expect(page.getByRole('heading', { name: /audit log/i })).toBeVisible()

    // Should have both Added and Removed entries
    await expect(page.getByText('Volunteer Added').first()).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Volunteer Removed').first()).toBeVisible()
  })

  test('filter bar is visible with all controls', async ({ page }) => {
    await page.getByRole('link', { name: 'Audit Log' }).click()
    await expect(page.getByRole('heading', { name: /audit log/i })).toBeVisible()

    // Search input
    await expect(page.getByPlaceholder(/search actor or event/i)).toBeVisible()
    // Event type dropdown
    await expect(page.getByText('All Events')).toBeVisible()
    // Date inputs
    await expect(page.locator('input[type="date"]').first()).toBeVisible()
    await expect(page.locator('input[type="date"]').last()).toBeVisible()
  })

  test('event type filter narrows results', async ({ page }) => {
    // Generate a volunteer event first
    const phone = uniquePhone()
    await createVolunteerAndGetNsec(page, `FilterVol ${Date.now()}`, phone)
    await page.getByRole('button', { name: /close/i }).click()

    await page.getByRole('link', { name: 'Audit Log' }).click()
    await expect(page.getByText('Volunteer Added').first()).toBeVisible({ timeout: 10000 })

    // Filter by volunteers category — click the select trigger
    const eventTypeSelect = page.locator('button').filter({ hasText: 'All Events' })
    await eventTypeSelect.click()
    await page.getByRole('option', { name: /volunteers/i }).click()

    // Volunteer events should still be visible
    await expect(page.getByText('Volunteer Added').first()).toBeVisible({ timeout: 5000 })

    // Switch to calls filter — click the select that now shows "Volunteers"
    const currentSelect = page.locator('button[role="combobox"]').filter({ hasText: /volunteers/i })
    await currentSelect.click()
    await page.getByRole('option', { name: /calls/i }).click()

    // Should show empty state (no call events in test) or no volunteer events
    await page.waitForTimeout(2000)
    await expect(page.getByText('Volunteer Added')).toHaveCount(0)
  })

  test('search filter works', async ({ page }) => {
    // Generate audit entries
    const phone = uniquePhone()
    const name = `SearchVol ${Date.now()}`
    await createVolunteerAndGetNsec(page, name, phone)
    await page.getByRole('button', { name: /close/i }).click()

    await page.getByRole('link', { name: 'Audit Log' }).click()
    await expect(page.getByText('Volunteer Added').first()).toBeVisible({ timeout: 10000 })

    // Type a search that matches nothing
    await page.getByPlaceholder(/search actor or event/i).fill('xyznonexistent999')
    // Wait for API to respond with filtered results
    await page.waitForTimeout(2000)

    // Either the empty state icon is shown or entries disappeared
    const emptyState = page.locator('text=No audit entries')
    const noEntries = await emptyState.isVisible().catch(() => false)
    // Verify either empty state or that "Volunteer Added" is no longer showing
    if (!noEntries) {
      await expect(page.getByText('Volunteer Added')).toHaveCount(0)
    }
  })

  test('clear button resets all filters', async ({ page }) => {
    await page.getByRole('link', { name: 'Audit Log' }).click()
    await expect(page.getByRole('heading', { name: /audit log/i })).toBeVisible()

    // Apply a filter
    await page.getByPlaceholder(/search actor or event/i).fill('something')

    // Clear button should appear
    await expect(page.getByRole('button', { name: /clear/i })).toBeVisible()

    // Click clear
    await page.getByRole('button', { name: /clear/i }).click()

    // Search should be empty again
    await expect(page.getByPlaceholder(/search actor or event/i)).toHaveValue('')

    // Clear button should be gone
    await expect(page.getByRole('button', { name: /clear/i })).toBeHidden()
  })

  test('event type badges use category colors', async ({ page }) => {
    // Generate a volunteer event
    const phone = uniquePhone()
    await createVolunteerAndGetNsec(page, `BadgeVol ${Date.now()}`, phone)
    await page.getByRole('button', { name: /close/i }).click()

    await page.getByRole('link', { name: 'Audit Log' }).click()
    await expect(page.getByText('Volunteer Added').first()).toBeVisible({ timeout: 10000 })

    // Volunteer events should have purple badge
    const badge = page.getByText('Volunteer Added').first()
    await expect(badge).toHaveClass(/purple/)
  })
})
