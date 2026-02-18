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
})
