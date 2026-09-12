/**
 * Schema browser step definitions.
 * Matches steps from:
 *   - packages/test-specs/features/core/schema-browser.feature
 *
 * The schema browser lets users view entity type schemas defined by
 * the applied CMS template — entity types, fields, and statuses.
 *
 * Every step asserts with a waiting `expect`. The Background guarantees CMS is
 * enabled and the template's entity types exist in the worker hub, so there is
 * nothing to "fall through" to: a missing section, row or editor is a failure.
 * (`locator.isVisible()` ignores its `timeout` and returns immediately — probing
 * with it while the page was still loading made these steps silently skip the
 * editor, which is what #669 was.)
 */
import { expect, type Page } from '@playwright/test'
import { When, Then } from '../fixtures'
import { Timeouts, navigateAfterLogin } from '../../helpers'
import { listEntityTypesViaApi } from '../../api-helpers'

interface ApiEnumOption { value: string; label: string }
interface ApiEntityType {
  name: string
  label: string
  fields: Array<{ label: string; type: string }>
  statuses: ApiEnumOption[]
  defaultStatus: string
  isArchived?: boolean
}

function entityTypeRow(page: Page, typeName: string) {
  return page.getByTestId('entity-type-row').filter({
    has: page.getByTestId('entity-type-label').getByText(typeName, { exact: true }),
  })
}

/** Default status of the entity type whose statuses the scenario last opened. */
const expectedDefaultStatus = new WeakMap<Page, string>()

function editor(page: Page) {
  return page.getByTestId('entity-type-editor')
}

When('I open the schema browser', async ({ page }) => {
  // Deep-link to the entity types section so it is deterministically expanded
  // (expansion state otherwise depends on sessionStorage from earlier navigation).
  await navigateAfterLogin(page, '/admin/case-management?section=entity-types')
  await expect(page.getByTestId('entity-types')).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see a list of entity types from the template', async ({ page, backendRequest, workerHub }) => {
  const types = (await listEntityTypesViaApi(backendRequest, workerHub)) as unknown as ApiEntityType[]
  const activeLabels = types.filter(t => !t.isArchived).map(t => t.label)
  expect(activeLabels.length).toBeGreaterThan(0)
  await expect(page.getByTestId('entity-type-label')).toHaveText(activeLabels, {
    useInnerText: true,
    timeout: Timeouts.ELEMENT,
  })
})

Then('I should see the {string} entity type', async ({ page }, typeName: string) => {
  await expect(entityTypeRow(page, typeName)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

When('I select the {string} entity type', async ({ page }, typeName: string) => {
  const row = entityTypeRow(page, typeName)
  await expect(row).toBeVisible({ timeout: Timeouts.ELEMENT })
  await row.getByTestId('entity-type-edit-btn').click()
  await expect(editor(page)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

async function getEntityTypeByLabel(
  request: Parameters<typeof listEntityTypesViaApi>[0],
  hubId: string,
  typeName: string,
): Promise<ApiEntityType> {
  const types = (await listEntityTypesViaApi(request, hubId)) as unknown as ApiEntityType[]
  const match = types.find(t => t.label === typeName)
  if (!match) throw new Error(`Entity type "${typeName}" not found in hub ${hubId}`)
  return match
}

Then('I should see the fields defined for {string}', async ({ page, backendRequest, workerHub }, typeName: string) => {
  const entityType = await getEntityTypeByLabel(backendRequest, workerHub, typeName)
  expect(entityType.fields.length).toBeGreaterThan(0)

  await editor(page).getByTestId('entity-tab-fields').click()
  await expect(editor(page).getByTestId('entity-field-label')).toHaveText(
    entityType.fields.map(f => f.label),
    { timeout: Timeouts.ELEMENT },
  )
})

Then('each field should show its type and label', async ({ page }) => {
  const rows = editor(page).getByTestId('entity-field-row')
  await expect(rows.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
  const count = await rows.count()
  for (let i = 0; i < count; i++) {
    const row = rows.nth(i)
    await expect(row.getByTestId('entity-field-label')).toHaveText(/\S/)
    await expect(row.getByTestId('entity-field-type')).toHaveText(/\S/)
  }
})

Then('I should see the statuses defined for {string}', async ({ page, backendRequest, workerHub }, typeName: string) => {
  const entityType = await getEntityTypeByLabel(backendRequest, workerHub, typeName)
  expect(entityType.statuses.length).toBeGreaterThan(0)

  await editor(page).getByTestId('entity-tab-statuses').click()
  await expect(editor(page).getByTestId('status-label')).toHaveText(
    entityType.statuses.map(s => s.label),
    { timeout: Timeouts.ELEMENT },
  )
  expectedDefaultStatus.set(page, entityType.defaultStatus)
})

Then('the initial status should be marked', async ({ page }) => {
  // Exactly one status row carries the default badge, and it is the entity type's defaultStatus.
  const defaultBadges = editor(page).getByTestId('status-default-badge')
  await expect(defaultBadges).toHaveCount(1, { timeout: Timeouts.ELEMENT })
  const defaultRow = editor(page).getByTestId('status-row').filter({ has: defaultBadges })
  await expect(defaultRow).toHaveCount(1)
  await expect(defaultRow.getByTestId('status-set-default-btn')).toHaveCount(0)
  const defaultStatus = expectedDefaultStatus.get(page)
  if (!defaultStatus) throw new Error('"the initial status should be marked" must follow "I should see the statuses defined for ..."')
  await expect(defaultRow.getByTestId('status-value')).toHaveText(defaultStatus)
})
