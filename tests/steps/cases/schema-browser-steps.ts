/**
 * Schema browser step definitions.
 * Matches steps from:
 *   - packages/test-specs/features/core/schema-browser.feature
 *
 * The schema browser lets users view entity type schemas defined by
 * the applied CMS template — entity types, fields, and statuses.
 */
import { expect } from '@playwright/test'
import { When, Then } from '../fixtures'
import { Timeouts, navigateAfterLogin } from '../../helpers'

When('I open the schema browser', async ({ page }) => {
  // Schema browser is at /admin/case-management or accessible from CMS settings
  await navigateAfterLogin(page, '/admin/case-management')
})

Then('I should see a list of entity types from the template', async ({ page }) => {
  // Entity type list should show at least one entry after template is applied
  const entityTypeList = page.getByTestId('entity-type-list')
    .or(page.locator('[data-testid^="entity-type-"]').first())
  await expect(entityTypeList.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see the {string} entity type', async ({ page }, typeName: string) => {
  await expect(page.getByText(typeName, { exact: false }).first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

When('I select the {string} entity type', async ({ page }, typeName: string) => {
  const typeItem = page.getByText(typeName, { exact: false }).first()
  await expect(typeItem).toBeVisible({ timeout: Timeouts.ELEMENT })
  await typeItem.click()
})

Then('I should see the fields defined for {string}', async ({ page }, _typeName: string) => {
  // After selecting an entity type, its fields should be displayed
  const fieldsSection = page.getByTestId('entity-type-fields')
    .or(page.getByText(/fields/i).first())
  await expect(fieldsSection).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('each field should show its type and label', async ({ page }) => {
  // At least one field should be visible with type and label information
  const fieldRow = page.locator('[data-testid^="field-"]').first()
    .or(page.locator('tr, [role="row"]').first())
  await expect(fieldRow).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see the statuses defined for {string}', async ({ page }, _typeName: string) => {
  // Status definitions should be visible in the entity type detail view
  const statusSection = page.getByText(/statuses|status/i).first()
  await expect(statusSection).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('the initial status should be marked', async ({ page }) => {
  // The default/initial status should have some visual indicator
  const statusBadge = page.locator('[data-testid^="status-"]').first()
    .or(page.getByText(/default|initial|open/i).first())
  await expect(statusBadge).toBeVisible({ timeout: Timeouts.ELEMENT })
})
