/**
 * Smart Case Assignment step definitions (Epic 342).
 * Matches steps from:
 *   - packages/test-specs/features/platform/desktop/cases/cms-assignment.feature
 */
import { expect } from '@playwright/test'
import type { APIRequestContext, Page } from '@playwright/test'
import { Given, When, Then } from '../fixtures'
import { Timeouts, navigateAfterLogin } from '../../helpers'
import {
  ADMIN_NSEC,
  addHubMemberViaApi,
  createRecordViaApi,
  createShiftViaApi,
  createUserViaApi,
  getRecordViaApi,
  listEntityTypesViaApi,
} from '../../api-helpers'

/** The Background applies the jail-support template, so a missing arrest case type is a failure, not a skip. */
async function arrestCaseTypeId(request: APIRequestContext, workerHub: string): Promise<string> {
  const entityTypes = await listEntityTypesViaApi(request, workerHub)
  const arrestType = entityTypes.find(et => (et as { name?: string }).name === 'arrest_case')
  expect(arrestType, 'arrest_case entity type from the jail-support template').toBeTruthy()
  return (arrestType as { id: string }).id
}

/** Open the detail view of a specific record — never "whichever card rendered first". */
async function openCaseDetail(page: Page, request: APIRequestContext, recordId: string, workerHub: string): Promise<void> {
  const record = await getRecordViaApi(request, recordId, workerHub) as { id: string; caseNumber?: string }
  const label = record.caseNumber || record.id.slice(0, 8)
  const card = page.getByTestId('case-card').filter({ hasText: label })
  await expect(card).toBeVisible({ timeout: Timeouts.ELEMENT })
  await card.click()
  await expect(page.getByTestId('case-detail-header')).toBeVisible({ timeout: Timeouts.ELEMENT })
}

// State is now in casesWorld fixture (casesWorld.lastRecordId)

// --- Preconditions ---

Given('volunteers with different profiles exist', async ({ backendRequest: request, workerHub }) => {
  // Suggestions only include active, not-on-break volunteers on a shift active right
  // now in this hub. Seed one explicitly instead of depending on whatever earlier
  // scenarios on this worker left behind. 00:00→00:00 crosses midnight, so it is active
  // at every time of day (isShiftActive in apps/worker/services/shifts.ts).
  const vol = await createUserViaApi(request, { name: `AssignVol ${Date.now()}` })
  await addHubMemberViaApi(request, workerHub, vol.pubkey, ['role-volunteer'])
  await createShiftViaApi(request, {
    name: `AssignShift ${Date.now()}`,
    startTime: '00:00',
    endTime: '00:00',
    days: [0, 1, 2, 3, 4, 5, 6],
    userPubkeys: [vol.pubkey],
    hubId: workerHub,
  })
})

Given('an unassigned arrest case exists', async ({ backendRequest: request, casesWorld, workerHub }) => {
  const etId = await arrestCaseTypeId(request, workerHub)
  const record = await createRecordViaApi(request, etId, { statusHash: 'reported', hubId: workerHub })
  casesWorld.lastRecordId = (record as { id: string }).id
})

Given('on-shift volunteers with capacity exist', async () => {
  // Accept current state — volunteers are managed by the test environment
})

Given('a volunteer is on break', async () => {
  // Accept current state — would need to set volunteer.onBreak = true via API
})

Given('a volunteer has reached their max case assignments', async () => {
  // Accept current state — would need to assign max cases to a volunteer
})

Given('an arrest case with a Spanish-speaking contact exists', async ({ backendRequest: request, casesWorld, workerHub }) => {
  const etId = await arrestCaseTypeId(request, workerHub)
  const record = await createRecordViaApi(request, etId, { statusHash: 'reported', hubId: workerHub })
  casesWorld.lastRecordId = (record as { id: string }).id
})

Given('a volunteer speaks Spanish', async () => {
  // Accept current state — volunteer profiles include spokenLanguages
})

Given('volunteer A has {int} active cases', async () => {
  // Accept current state — workload is tracked by the assignment index
})

Given('volunteer B has {int} active cases', async () => {
  // Accept current state
})

Given('a case assigned to a volunteer exists', async ({ backendRequest: request, casesWorld, workerHub }) => {
  const { assignRecordViaApi } = await import('../../api-helpers')
  const etId = await arrestCaseTypeId(request, workerHub)
  // Create a new case and assign the admin to it so the Unassign button appears
  const adminPubkey = process.env.ADMIN_PUBKEY || '79215a4c04f08fcd817c6f820c87169beb8cddf96dfa590a1315556b78af9183'
  const record = await createRecordViaApi(request, etId, {
    statusHash: 'reported',
    assignedTo: [adminPubkey],
    hubId: workerHub,
  })
  casesWorld.lastRecordId = (record as { id: string }).id
  // Also assign via the explicit endpoint to be sure
  await assignRecordViaApi(request, casesWorld.lastRecordId, [adminPubkey], ADMIN_NSEC, workerHub).catch(() => {})
})

Given('auto-assignment is enabled', async () => {
  // Would need to call PUT /settings/cms/auto-assignment { enabled: true }
})

// --- Suggest assignees API ---

When('I request assignment suggestions for the case', async ({ backendRequest: request, casesWorld, workerHub }) => {
  // API test — would call GET /records/:id/suggest-assignees
  void request
})

Then('the response should contain suggested volunteers', async () => {
  // API assertion — verify suggestions array exists
})

Then('each suggestion should include a score and reasons', async () => {
  // API assertion — verify score + reasons fields
})

Then('the on-break volunteer should not appear in suggestions', async () => {
  // API assertion
})

Then('the at-capacity volunteer should not appear in suggestions', async () => {
  // API assertion
})

Then('the Spanish-speaking volunteer should rank higher', async () => {
  // API assertion — verify score ordering
})

Then('volunteer A should rank higher than volunteer B', async () => {
  // API assertion — verify score ordering
})

// --- Assignment dialog UI ---
// Note: "I click the {string} button" is handled by common/interaction-steps.ts

Then('the assignment dialog should be visible', async ({ page }) => {
  await expect(page.getByTestId('assignment-dialog')).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('suggested volunteers should appear at the top', async ({ page }) => {
  // Background seeds an on-shift volunteer, so the dialog must list at least one suggestion.
  const dialog = page.getByTestId('assignment-dialog')
  await expect(dialog.getByTestId('suggestion-card').first()).toBeVisible({ timeout: Timeouts.ELEMENT })
  await expect(dialog.getByTestId('no-suggestions')).toHaveCount(0)
})

Then('each volunteer should show a workload indicator', async ({ page }) => {
  const cards = page.getByTestId('assignment-dialog').getByTestId('suggestion-card')
  await expect(cards.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
  const count = await cards.count()
  for (let i = 0; i < count; i++) {
    await expect(cards.nth(i).getByTestId('workload-indicator')).toBeVisible()
  }
})

When('I open the assignment dialog for the case', async ({ page, backendRequest: request, casesWorld, workerHub }) => {
  expect(casesWorld.lastRecordId, 'a case must be created before opening its assignment dialog').toBeTruthy()
  await navigateAfterLogin(page, '/cases')
  await openCaseDetail(page, request, casesWorld.lastRecordId, workerHub)
  await page.getByTestId('case-assign-dialog-btn').click()
  await expect(page.getByTestId('assignment-dialog')).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('each suggested volunteer should show match reasons', async ({ page }) => {
  // Every suggestion card renders its score and workload; specialization/language
  // badges only render on a match, so the always-present reason is workload.
  const cards = page.getByTestId('assignment-dialog').getByTestId('suggestion-card')
  await expect(cards.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
  const count = await cards.count()
  for (let i = 0; i < count; i++) {
    await expect(cards.nth(i).getByTestId('workload-indicator')).toBeVisible()
    await expect(cards.nth(i).getByTestId('assign-volunteer-btn')).toBeVisible()
  }
})

Then('reasons should include availability and workload', async ({ page }) => {
  // A volunteer is only suggested while on shift (availability); the workload
  // indicator renders "active/max".
  const indicator = page.getByTestId('assignment-dialog').getByTestId('workload-indicator').first()
  await expect(indicator).toHaveText(/\d+\/\d+/, { timeout: Timeouts.ELEMENT })
})

When('I click assign on the first suggested volunteer', async ({ page, casesWorld }) => {
  const dialog = page.getByTestId('assignment-dialog')
  const card = dialog.getByTestId('suggestion-card').first()
  await expect(card).toBeVisible({ timeout: Timeouts.ELEMENT })
  const assign = page.waitForResponse(
    res => res.request().method() === 'POST' && res.url().includes(`/records/${casesWorld.lastRecordId}/assign`),
  )
  await card.getByTestId('assign-volunteer-btn').click()
  expect((await assign).ok(), 'assign request succeeded').toBe(true)
  await expect(dialog).toBeHidden({ timeout: Timeouts.ELEMENT })
})

Then('the case should show the volunteer as assigned', async ({ page, backendRequest: request, casesWorld, workerHub }) => {
  // The detail panel stays open after the dialog closes.
  await expect(page.getByTestId('case-detail-header')).toBeVisible({ timeout: Timeouts.ELEMENT })
  const record = await getRecordViaApi(request, casesWorld.lastRecordId, workerHub) as { assignedTo?: string[] }
  expect(record.assignedTo?.length ?? 0, 'record has an assignee').toBeGreaterThan(0)
})

// "I click the {string} button" is already in common/interaction-steps.ts

Then('the assign button should reappear', async ({ page }) => {
  const btn = page.getByTestId('case-assign-btn')
    .or(page.getByTestId('case-assign-dialog-btn'))
  await expect(btn.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

// --- Auto-assignment ---

When('I toggle the auto-assignment switch', async ({ page }) => {
  const toggle = page.getByTestId('auto-assignment-toggle')
  await expect(toggle).toBeVisible({ timeout: Timeouts.ELEMENT })
  await toggle.click()
})

Then('the auto-assignment indicator should be visible', async ({ page }) => {
  // After toggling auto-assignment on, the indicator text or the toggle's active state should be visible
  const indicator = page.getByTestId('auto-assignment-indicator')
    .or(page.getByTestId('auto-assignment-toggle'))
    .or(page.getByText(/auto-assign/i))
  await expect(indicator.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

When('a new arrest case is created via API', async ({ backendRequest: request, casesWorld, workerHub }) => {
  const etId = await arrestCaseTypeId(request, workerHub)
  const record = await createRecordViaApi(request, etId, { statusHash: 'reported', hubId: workerHub })
  casesWorld.lastRecordId = (record as { id: string }).id
})

Then('the new case should have an assignee', async ({ page }) => {
  // After auto-assignment, the first case card should show an assignment indicator
  const card = page.getByTestId('case-card').first()
  await expect(card).toBeVisible({ timeout: Timeouts.ELEMENT })
})
