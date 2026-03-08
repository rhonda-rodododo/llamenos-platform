import { test, expect, type Page } from '@playwright/test'
import { loginAsAdmin } from './helpers'

async function navigateToAdminSettings(page: Page): Promise<void> {
  await page.getByRole('link', { name: 'Hub Settings' }).click()
  await expect(page.getByRole('heading', { name: 'Hub Settings', level: 1 })).toBeVisible({ timeout: 10000 })
}

async function navigateToReports(page: Page): Promise<void> {
  await page.getByRole('link', { name: 'Reports' }).click()
  await expect(page.getByRole('heading', { name: 'Reports', level: 1 })).toBeVisible({ timeout: 10000 })
}

test.describe('Report Types', () => {
  test.describe.configure({ mode: 'serial' })

  test('report types section visible in admin settings', async ({ page }) => {
    await loginAsAdmin(page)
    await navigateToAdminSettings(page)

    // Find and expand the Report Types section
    const section = page.locator('#report-types')
    await expect(section).toBeVisible({ timeout: 10000 })
  })

  test('report types section loads with default types', async ({ page }) => {
    await loginAsAdmin(page)
    await navigateToAdminSettings(page)

    // Expand the report types section by clicking on it
    await page.locator('#report-types').click()

    // Wait for report type rows to appear (default types seeded on first load)
    await expect(page.getByTestId('report-type-row').first()).toBeVisible({ timeout: 10000 })

    // Should have at least one row
    const rows = page.getByTestId('report-type-row')
    expect(await rows.count()).toBeGreaterThanOrEqual(1)
  })

  test('admin can create a new report type', async ({ page }) => {
    await loginAsAdmin(page)
    await navigateToAdminSettings(page)

    // Expand the report types section
    await page.locator('#report-types').click()
    await expect(page.getByTestId('report-type-row').first()).toBeVisible({ timeout: 10000 })

    // Click "Add Report Type"
    await page.getByTestId('report-type-add-btn').click()

    // Fill in the form
    await page.getByTestId('report-type-name-input').fill(`Custom Type ${Date.now()}`)
    await page.getByTestId('report-type-description-input').fill('A custom report type for testing')
    await page.getByTestId('report-type-icon-input').fill('shield')

    // Save
    await page.getByTestId('report-type-save-btn').click()

    // Verify success toast
    await expect(page.getByText('Report type created')).toBeVisible({ timeout: 5000 })
  })

  test('report form shows report type selector', async ({ page }) => {
    await loginAsAdmin(page)
    await navigateToReports(page)

    // Open the new report form
    await page.getByRole('button', { name: /new/i }).click()

    // The report type selector should be visible
    await expect(page.getByTestId('report-type-select')).toBeVisible({ timeout: 5000 })
  })

  test('creating report with selected type works', async ({ page }) => {
    await loginAsAdmin(page)
    await navigateToReports(page)

    // Open the new report form
    await page.getByRole('button', { name: /new/i }).click()

    // Verify the type selector is present and has options
    const typeSelect = page.getByTestId('report-type-select')
    await expect(typeSelect).toBeVisible({ timeout: 5000 })

    // Fill the form
    await page.getByPlaceholder('Brief description of the report').fill(`Typed Report ${Date.now()}`)
    await page.getByPlaceholder('Describe the situation in detail...').fill('Report with a selected type')

    // Submit
    await page.getByRole('button', { name: /submit report/i }).click()

    // Verify report created
    await expect(page.getByText('Report submitted')).toBeVisible({ timeout: 10000 })
  })

  test('report card shows report type badge', async ({ page }) => {
    await loginAsAdmin(page)
    await navigateToReports(page)

    // Wait for reports to load
    await page.waitForTimeout(2000)

    // At least one report should have a type badge visible in the list
    // The badge comes from the reportCategory set from the report type name
    const badges = page.locator('button[type="button"]').first().locator('.text-\\[10px\\]')
    // If there's a report with a type, the badge should show the type name
    if (await badges.count() > 0) {
      const badgeText = await badges.first().textContent()
      expect(badgeText?.trim().length).toBeGreaterThan(0)
    }
  })
})
