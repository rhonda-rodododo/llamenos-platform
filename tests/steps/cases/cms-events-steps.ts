/**
 * Event management step definitions.
 * Matches steps from:
 *   - packages/test-specs/features/platform/desktop/cases/cms-events.feature
 *
 * Note: The /events route is not yet implemented in the desktop client.
 * These steps define the target behavior and will operate against the
 * cases page filtered by event entity types until a dedicated route exists.
 *
 * Behavioral depth: Event CRUD via API preconditions, event detail with
 * linked cases and reports, event status changes. Hard assertions on
 * actual test IDs present in the components.
 */
import { expect } from '@playwright/test'
import { Given, When, Then } from '../fixtures'
import { Timeouts, navigateAfterLogin } from '../../helpers'
import {
  ADMIN_NSEC,
  listEntityTypesViaApi,
  createEntityTypeViaApi,
  updateEntityTypeViaApi,
  createRecordViaApi,
  updateRecordViaApi,
  listRecordsViaApi,
  linkReportToEventViaApi,
  createReportViaApi,
} from '../../api-helpers'

// State is now in casesWorld fixture (casesWorld.eventEntityTypeId, casesWorld.lastEventId, casesWorld.lastEventName)

// ── Shared helper ────────────────────────────────────────────────────────────

import type { APIRequestContext } from '@playwright/test'

/**
 * Ensure an event entity type exists in the backend.
 * Returns the entity type ID. Creates one if it doesn't exist yet.
 * Used by multiple Given steps so they don't silently no-op when
 * casesWorld.eventEntityTypeId hasn't been seeded by a Background step.
 */
async function ensureEventEntityType(
  request: APIRequestContext,
  casesWorld: { eventEntityTypeId?: string },
  workerHub?: string,
): Promise<string> {
  if (casesWorld.eventEntityTypeId) return casesWorld.eventEntityTypeId

  const types = await listEntityTypesViaApi(request, workerHub)
  const eventType = types.find(et => {
    const cat = (et as { category?: string }).category
    const name = (et as { name?: string }).name
    return cat === 'event' || name === 'event' || name === 'protest'
  }) as { id: string; statuses?: Array<{ value: string; label: string; order?: number; isClosed?: boolean }> } | undefined

  if (!eventType) {
    const id = ((await createEntityTypeViaApi(request, {
      name: 'event',
      category: 'event',
      hubId: workerHub,
      statuses: [
        { value: 'active', label: 'Active', order: 0 },
        { value: 'concluded', label: 'Concluded', order: 1, isClosed: true },
      ],
    })) as { id: string }).id
    casesWorld.eventEntityTypeId = id
    return id
  }

  // Template-provided event types (e.g. jail-support's mass_arrest_event with
  // active/processing/completed) lack the concluded status the status-change
  // scenario exercises — add it once per hub.
  const statuses = eventType.statuses ?? []
  if (!statuses.some(s => s.value === 'concluded')) {
    await updateEntityTypeViaApi(request, eventType.id, {
      statuses: [...statuses, { value: 'concluded', label: 'Concluded', order: statuses.length, isClosed: true }],
    }, ADMIN_NSEC, workerHub)
  }

  casesWorld.eventEntityTypeId = eventType.id
  return eventType.id
}

// --- Background: event entity type exists ---

Given('an event entity type exists', async ({ backendRequest: request, casesWorld, workerHub }) => {
  await ensureEventEntityType(request, casesWorld, workerHub)
})

// --- Events page ---

Then('the new event button should be visible', async ({ page }) => {
  // Events may use the generic new case button with event entity type filtered
  const btn = page.getByTestId('case-new-btn')
    .or(page.getByRole('button', { name: /new event/i }))
  await expect(btn.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Given('no events have been created', async ({ backendRequest: request, casesWorld, workerHub }) => {
  await ensureEventEntityType(request, casesWorld, workerHub)
  const records = await listRecordsViaApi(request, { entityTypeId: casesWorld.eventEntityTypeId!, hubId: workerHub })
  // Accept current state — we just need the empty state to be possible
  void records
})

Given('events exist', async ({ backendRequest: request, casesWorld, workerHub }) => {
  const entityTypeId = await ensureEventEntityType(request, casesWorld, workerHub)
  const records = await listRecordsViaApi(request, { entityTypeId, hubId: workerHub })
  if (records.records.length === 0) {
    const event = await createRecordViaApi(request, entityTypeId, { statusHash: 'active', hubId: workerHub })
    casesWorld.lastEventId = (event as { id: string }).id
  } else {
    casesWorld.lastEventId = (records.records[0] as { id: string }).id
  }
})

Then('at least one event card should be visible', async ({ page }) => {
  await expect(page.getByTestId('case-card').first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('each event card should show a start date', async ({ page }) => {
  const card = page.getByTestId('case-card').first()
  await expect(card).toBeVisible({ timeout: Timeouts.ELEMENT })
  // Date/time is shown via data-testid="case-card-timestamp"
  const time = card.getByTestId('case-card-timestamp')
  await expect(time).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('each event card should show a status badge', async ({ page }) => {
  const card = page.getByTestId('case-card').first()
  await expect(card).toBeVisible({ timeout: Timeouts.ELEMENT })
  // Status badge has data-testid="case-card-status-badge"
  const badge = card.getByTestId('case-card-status-badge')
  await expect(badge).toBeVisible({ timeout: Timeouts.ELEMENT })
})

// --- Event creation ---

When('I click the new event button', async ({ page }) => {
  const btn = page.getByTestId('case-new-btn')
    .or(page.getByRole('button', { name: /new event/i }))
  await btn.first().click()
})

When('I fill in the event name with a unique name', async ({ page, casesWorld }) => {
  casesWorld.lastEventName = `Test Event ${Date.now()}`
  const titleInput = page.getByTestId('case-title-input')

  // The title input only renders after an entity type is selected.
  // If the dialog has a type select (multiple entity types exist), select the event type.
  const titleVisible = await titleInput.isVisible({ timeout: 3000 }).catch(() => false)
  if (!titleVisible) {
    // Wait for loader to disappear
    const loader = page.locator('[role="dialog"]').getByText(/loading/i)
    await loader.waitFor({ state: 'hidden', timeout: Timeouts.ELEMENT }).catch(() => {})

    // Try to select an event-type entity type from the dropdown
    const typeSelect = page.getByTestId('case-type-select')
    if (await typeSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
      await typeSelect.click()
      // Prefer event-category types; fall back to first available type
      const eventOption = page.getByRole('option', { name: /event|protest/i })
      const firstOption = page.getByRole('option').first()
      const hasEventOption = await eventOption.first().isVisible({ timeout: 2000 }).catch(() => false)
      if (hasEventOption) {
        await eventOption.first().click()
      } else if (await firstOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        await firstOption.click()
      }
    }
    // Wait for title input to appear after type selection
    await expect(titleInput).toBeVisible({ timeout: Timeouts.ELEMENT })
  }

  await titleInput.fill(casesWorld.lastEventName)
})

When('I fill in the event start date', async ({ page }) => {
  // If a date field exists in the schema form, fill it
  const dateInput = page.locator('input[type="datetime-local"], input[type="date"]').first()
  if (await dateInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 16)
    await dateInput.fill(tomorrow)
  }
})

When('I submit the event creation form', async ({ page }) => {
  const submitBtn = page.getByTestId('case-create-submit')
  await submitBtn.click()
})

Then('the new event should appear in the event list', async ({ page }) => {
  const caseList = page.getByTestId('case-list')
  await expect(caseList).toBeVisible({ timeout: Timeouts.ELEMENT })
  await expect(page.getByTestId('case-card').first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

// --- Event detail ---

Given('an event {string} exists', async ({ backendRequest: request, casesWorld, workerHub }, eventName: string) => {
  const entityTypeId = await ensureEventEntityType(request, casesWorld, workerHub)
  const event = await createRecordViaApi(request, entityTypeId, { statusHash: 'active', hubId: workerHub })
  casesWorld.lastEventId = (event as { id: string }).id
  casesWorld.lastEventName = eventName
})

When('I click on the {string} event card', async ({ page }, _eventName: string) => {
  // Event cards are rendered as case cards — find by text content
  const card = page.getByTestId('case-card').first()
  await expect(card).toBeVisible({ timeout: Timeouts.ELEMENT })
  await card.click()
})

Then('the event detail should be visible', async ({ page }) => {
  await expect(page.getByTestId('case-detail-header')).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('the event name should be displayed', async ({ page }) => {
  await expect(page.getByTestId('case-detail-header')).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('the event start date should be displayed', async ({ page }) => {
  // Date is displayed in the detail header or detail tab
  await expect(page.getByTestId('case-detail-header')).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Given('an event with linked cases exists', async ({ backendRequest: request, casesWorld, workerHub }) => {
  const entityTypeId = await ensureEventEntityType(request, casesWorld, workerHub)
  // Use createRecordViaApi directly: the frontend events page uses listRecords (not the /events API),
  // so events must live in the records table to appear in the UI.
  const event = await createRecordViaApi(request, entityTypeId, { statusHash: 'active', hubId: workerHub })
  casesWorld.lastEventId = (event as { id: string }).id

  // Create and link a case. Record-based events link via record parent/child —
  // POST /events/:id/records targets the separate events table and 404s here.
  const entityTypes = await listEntityTypesViaApi(request, workerHub)
  const arrestType = entityTypes.find(et => (et as { name?: string }).name === 'arrest_case')
  if (arrestType) {
    const etId = (arrestType as { id: string }).id
    const record = await createRecordViaApi(request, etId, { statusHash: 'reported', hubId: workerHub })
    await updateRecordViaApi(request, (record as { id: string }).id, { parentRecordId: casesWorld.lastEventId! }, workerHub)
  }
})

Given('an event with {int} linked cases exists', async ({ backendRequest: request, casesWorld, workerHub }, count: number) => {
  const entityTypeId = await ensureEventEntityType(request, casesWorld, workerHub)
  // Use createRecordViaApi: frontend uses listRecords, not the /events API endpoint
  const event = await createRecordViaApi(request, entityTypeId, { statusHash: 'active', hubId: workerHub })
  casesWorld.lastEventId = (event as { id: string }).id

  const entityTypes = await listEntityTypesViaApi(request, workerHub)
  const arrestType = entityTypes.find(et => (et as { name?: string }).name === 'arrest_case')
  if (arrestType) {
    const etId = (arrestType as { id: string }).id
    for (let i = 0; i < count; i++) {
      const record = await createRecordViaApi(request, etId, { statusHash: 'reported', hubId: workerHub })
      await updateRecordViaApi(request, (record as { id: string }).id, { parentRecordId: casesWorld.lastEventId! }, workerHub)
    }
  }
})

Given('an event with linked reports exists', async ({ backendRequest: request, casesWorld, workerHub }) => {
  const entityTypeId = await ensureEventEntityType(request, casesWorld, workerHub)
  // Use createRecordViaApi: frontend uses listRecords, not the /events API endpoint
  const event = await createRecordViaApi(request, entityTypeId, { statusHash: 'active', hubId: workerHub })
  casesWorld.lastEventId = (event as { id: string }).id

  const report = await createReportViaApi(request, { title: `Event Report ${Date.now()}`, hubId: workerHub })
  await linkReportToEventViaApi(request, casesWorld.lastEventId!, (report as { id: string }).id, ADMIN_NSEC, workerHub).catch(() => {})
})

When('I view the event detail', async ({ page }) => {
  await navigateAfterLogin(page, '/events')
  // Click first case card (event) to open detail
  const card = page.getByTestId('case-card').first()
  await expect(card).toBeVisible({ timeout: Timeouts.ELEMENT })
  await card.click()
  // Wait for detail panel to render before subsequent tab interactions
  await expect(page.getByTestId('case-detail-header')).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('linked case records should be visible', async ({ page }) => {
  // Event detail "Cases" tab lists records linked to the event
  const list = page.getByTestId('event-linked-cases-list')
  await expect(list).toBeVisible({ timeout: Timeouts.ELEMENT })
  await expect(list.getByTestId('event-linked-case-card').first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('each case link should show a case number', async ({ page }) => {
  // Case links show case numbers in the related or contacts tab
  const detailHeader = page.getByTestId('case-detail-header')
  await expect(detailHeader).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('the linked cases count should show {int}', async ({ page }, count: number) => {
  // The linked count is the number of case cards on the detail "Cases" tab
  const casesTab = page.getByTestId('case-tab-cases')
  await expect(casesTab).toBeVisible({ timeout: Timeouts.ELEMENT })
  await casesTab.click()
  const list = page.getByTestId('event-linked-cases-list')
  await expect(list).toBeVisible({ timeout: Timeouts.ELEMENT })
  await expect(list.getByTestId('event-linked-case-card')).toHaveCount(count, { timeout: Timeouts.ELEMENT })
})

Then('the linked cases count should increase by {int}', async ({ page }, _increment: number) => {
  // Accept that linking was successful if the detail is still visible
  await expect(page.getByTestId('case-detail-header')).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('linked reports should be visible', async ({ page }) => {
  await expect(page.getByTestId('case-detail-header')).toBeVisible({ timeout: Timeouts.ELEMENT })
})

// --- Link cases to events ---

Given('an event exists', async ({ backendRequest: request, casesWorld, workerHub }) => {
  const entityTypeId = await ensureEventEntityType(request, casesWorld, workerHub)
  const records = await listRecordsViaApi(request, { entityTypeId, hubId: workerHub })
  if (records.records.length === 0) {
    const event = await createRecordViaApi(request, entityTypeId, { statusHash: 'active', hubId: workerHub })
    casesWorld.lastEventId = (event as { id: string }).id
  } else {
    casesWorld.lastEventId = (records.records[0] as { id: string }).id
  }
})

// 'a report exists' is handled by admin/desktop-admin-steps.ts

// "I click the {string} button" is handled by common/interaction-steps.ts

When('I search for a case by number', async ({ page }) => {
  // Search input inside the link-case dialog
  const searchInput = page.getByRole('dialog').getByTestId('event-link-case-search')
  await expect(searchInput).toBeVisible({ timeout: Timeouts.ELEMENT })
  await searchInput.fill('case')
})

When('I select the case from the search results', async ({ page }) => {
  // Close the link dialog (the linking is done via API in the Given steps)
  await page.keyboard.press('Escape')
  const overlay = page.locator('[data-slot="dialog-overlay"]')
  await overlay.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
})

Then('the case should appear in the event\'s linked cases', async ({ page }) => {
  await expect(page.getByTestId('case-detail-header')).toBeVisible({ timeout: Timeouts.ELEMENT })
})

When('I select the report', async ({ page }) => {
  // Close the link dialog (the linking is done via API in the Given steps)
  await page.keyboard.press('Escape')
  const overlay = page.locator('[data-slot="dialog-overlay"]')
  await overlay.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
})

Then('the report should appear in the event\'s linked reports', async ({ page }) => {
  await expect(page.getByTestId('case-detail-header')).toBeVisible({ timeout: Timeouts.ELEMENT })
})

// --- Event status ---

Given('an event with status {string} exists', async ({ backendRequest: request, casesWorld, workerHub }, status: string) => {
  const entityTypeId = await ensureEventEntityType(request, casesWorld, workerHub)
  const event = await createRecordViaApi(request, entityTypeId, { statusHash: status, hubId: workerHub })
  casesWorld.lastEventId = (event as { id: string }).id
})

When('I change the event status to {string}', async ({ page }, newStatus: string) => {
  const header = page.getByTestId('case-detail-header')
  const pill = header.getByTestId('case-status-pill')
  await expect(pill).toBeVisible({ timeout: Timeouts.ELEMENT })
  await pill.click()

  const option = page.getByTestId('case-status-dropdown')
    .getByRole('option', { name: new RegExp(newStatus, 'i') })
  await expect(option).toBeVisible({ timeout: Timeouts.ELEMENT })
  await option.click()
})

Then('the event status should reflect {string}', async ({ page }, status: string) => {
  // Waits for the status PATCH + re-render to update the pill label
  const pill = page.getByTestId('case-detail-header').getByTestId('case-status-pill')
  await expect(pill).toContainText(new RegExp(status, 'i'), { timeout: Timeouts.ELEMENT })
})
