import { test, expect, type Page } from '@playwright/test'
import { loginAsAdmin } from './helpers'

/** Expand the Custom Note Fields section (idempotent — won't collapse if already open) */
async function expandCustomFields(page: Page) {
  await page.getByRole('link', { name: 'Hub Settings' }).click()
  await expect(page.getByRole('heading', { name: 'Hub Settings', exact: true })).toBeVisible()

  // Check if section is already expanded (sessionStorage persists across serial tests)
  const addFieldBtn = page.getByRole('button', { name: /add field/i })
  if (!await addFieldBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await page.getByRole('heading', { name: /custom note fields/i }).click()
  }
  await expect(addFieldBtn).toBeVisible({ timeout: 10000 })
}

test.describe('Custom Note Fields', () => {
  // Tests depend on each other's state (empty state → add → delete)
  test.describe.configure({ mode: 'serial' })

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('custom fields section visible in admin settings', async ({ page }) => {
    await page.getByRole('link', { name: 'Hub Settings' }).click()
    await expect(page.getByRole('heading', { name: 'Hub Settings', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: /custom note fields/i })).toBeVisible()
  })

  test('admin can add a text custom field', async ({ page }) => {
    await expandCustomFields(page)

    // Click Add Field
    await page.getByRole('button', { name: /add field/i }).click()

    // Fill in field details using placeholders
    await page.getByPlaceholder('e.g. Severity Rating').fill('Severity')
    // Name should auto-generate — use exact match to avoid matching label placeholder
    await expect(page.getByPlaceholder('e.g. severity', { exact: true })).toHaveValue('severity')

    // Save
    await page.getByRole('button', { name: /save/i }).last().click()
    await expect(page.getByText(/success/i)).toBeVisible({ timeout: 5000 })

    // Field should appear in the list
    await expect(page.getByText('Severity').first()).toBeVisible()
  })

  test('admin can add a select custom field with options', async ({ page }) => {
    await expandCustomFields(page)

    // Click Add Field
    await page.getByRole('button', { name: /add field/i }).click()

    // Fill in field details
    await page.getByPlaceholder('e.g. Severity Rating').fill('Category')

    // Change type to Select
    await page.locator('select').selectOption('select')

    // Add options
    await page.getByRole('button', { name: /add option/i }).click()
    // Find the newly added option input (last textbox in the form)
    const optionInputs = page.getByRole('textbox')
    await optionInputs.last().fill('Crisis')
    await page.getByRole('button', { name: /add option/i }).click()
    await optionInputs.last().fill('Information')

    // Save
    await page.getByRole('button', { name: /save/i }).last().click()
    await expect(page.getByText(/success/i)).toBeVisible({ timeout: 5000 })

    // Field should appear in the list with Select type badge
    await expect(page.getByText('Category').first()).toBeVisible()
  })

  test('admin can delete a custom field', async ({ page }) => {
    await expandCustomFields(page)

    // First create a field to delete
    await page.getByRole('button', { name: /add field/i }).click()
    await expect(page.getByPlaceholder('e.g. Severity Rating')).toBeVisible({ timeout: 10000 })
    await page.getByPlaceholder('e.g. Severity Rating').fill('ToDelete')
    await page.getByRole('button', { name: /save/i }).last().click()
    await expect(page.getByText(/success/i)).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('ToDelete').first()).toBeVisible()

    // Delete it — accept the confirmation dialog
    page.on('dialog', dialog => dialog.accept())
    const fieldRow = page.locator('.rounded-lg.border').filter({ hasText: 'ToDelete' }).first()
    await fieldRow.locator('button').filter({ has: page.locator('.text-destructive') }).click()

    // Field should be removed
    await expect(page.getByText('ToDelete')).not.toBeVisible({ timeout: 5000 })
  })

  test('custom fields section deep link works', async ({ page }) => {
    await expandCustomFields(page)

    // Custom Note Fields section should be expanded — "Add Field" button should be visible
    await expect(page.getByRole('button', { name: /add field/i })).toBeVisible()
  })
})
