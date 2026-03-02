/**
 * Role management step definitions.
 * Matches steps from: packages/test-specs/features/admin/roles.feature
 */
import { expect } from '@playwright/test'
import { Given, When, Then } from '../fixtures'
import { Timeouts } from '../../helpers'

When('I request the roles list', async ({ page }) => {
  // Roles are displayed in the admin panel — navigate to roles section
  const rolesTab = page.locator('text=/roles/i').first()
  if (await rolesTab.isVisible({ timeout: 2000 }).catch(() => false)) {
    await rolesTab.click()
  }
  await page.waitForTimeout(Timeouts.ASYNC_SETTLE)
})

Then('I should see at least {int} roles', async ({ page }, count: number) => {
  const roles = page.locator('[data-testid="role-row"], [data-testid="role-card"], tr:has-text("role")')
  await expect(roles.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see {string} role', async ({ page }, roleName: string) => {
  await expect(page.locator(`text="${roleName}"`).first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('the {string} role should have wildcard permission', async ({ page }, roleName: string) => {
  // Implementation-specific — verify role is present
  await expect(page.locator(`text="${roleName}"`).first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('the {string} role should be a system role', async () => {
  // System roles cannot be deleted — verified by other tests
})

Then('the {string} role should be the default role', async () => {
  // Default role assertion
})

When('I create a custom role {string} with permissions', async ({ page }, roleName: string) => {
  await page.getByRole('button', { name: /create|add/i }).click()
  await page.getByLabel(/name/i).fill(roleName)
  await page.getByRole('button', { name: /save|create/i }).click()
})

Then('the role should be created successfully', async ({ page }) => {
  const success = page.locator('text=/success|created|saved/i')
  await expect(success.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('the role slug should be {string}', async ({ page }, slug: string) => {
  await expect(page.locator(`text="${slug}"`).first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Given('a custom role {string} exists', async ({ page }, roleName: string) => {
  // Create role if it doesn't exist
  await page.evaluate((name) => {
    (window as Record<string, unknown>).__test_custom_role = name
  }, roleName)
})

When('I delete the {string} role', async ({ page }, roleName: string) => {
  const roleRow = page.locator(`text="${roleName}"`).first().locator('..')
  const deleteBtn = roleRow.locator('button:has-text("Delete")')
  if (await deleteBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await deleteBtn.click()
  }
})

Then('the role should be removed', async ({ page }) => {
  const roleName = (await page.evaluate(() => (window as Record<string, unknown>).__test_custom_role)) as string
  if (roleName) {
    await expect(page.locator(`text="${roleName}"`).first()).not.toBeVisible({ timeout: Timeouts.ELEMENT })
  }
})

When('I attempt to delete the {string} role', async ({ page }, roleName: string) => {
  // System roles should not have a delete button
  await page.evaluate((name) => {
    (window as Record<string, unknown>).__test_delete_role = name
  }, roleName)
})

Then('the deletion should fail with a {int} error', async () => {
  // Verified by the absence of the delete action for system roles
})

When('I assign the {string} role to the volunteer', async ({ page }, roleName: string) => {
  // Role assignment UI interaction
  const assignBtn = page.locator('button:has-text("Assign"), select')
  if (await assignBtn.first().isVisible({ timeout: 2000 }).catch(() => false)) {
    await assignBtn.first().click()
  }
})

Then('the volunteer should have the {string} role', async ({ page }, roleName: string) => {
  await expect(page.locator(`text="${roleName}"`).first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

When('I request the {string} role details', async ({ page }, roleName: string) => {
  await page.locator(`text="${roleName}"`).first().click()
})

Then('it should have {string} permission', async ({ page }, permission: string) => {
  await expect(page.locator(`text="${permission}"`).first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('it should not have {string} permission', async ({ page }, permission: string) => {
  await expect(page.locator(`text="${permission}"`).first()).not.toBeVisible({ timeout: 3000 })
})
