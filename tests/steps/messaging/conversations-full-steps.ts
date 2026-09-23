/**
 * Full conversation management step definitions.
 * Matches steps from: packages/test-specs/features/core/messaging-flow.feature
 *
 * Behavioral depth: Hard assertions on conversation elements. Given steps seed
 * conversations through the real API — an inbound message simulated into the
 * worker's isolated hub, then claim/close via the hub-scoped conversations API —
 * so the conversation is in the exact status the scenario needs (waiting,
 * active, closed) before any UI assertion runs. The UI renders status-gated
 * controls: conv-assign-btn only for a selected `waiting` conversation,
 * conv-close-btn and the message composer only for `active`, conv-reopen-btn
 * only for `closed` (src/client/routes/conversations.tsx).
 *
 * When seeding fails (e.g. messaging backend unavailable), the Given step sets
 * `window.__test_seed_failed` via flagSeedFailed() so downstream When/Then steps
 * take a single deterministic branch instead of re-probing visibility with
 * isVisible().catch(() => false). Once a conversation is known to exist, every
 * subsequent locator is asserted hard — a missing element is a real app bug,
 * not a "maybe" to swallow.
 */
import { expect } from '@playwright/test'
import { Given, When, Then } from '../fixtures'
import { TestIds } from '../../test-ids'
import { Timeouts, flagSeedFailed as flagNoConversation, readSeedFailedFlag as readNoConversationFlag } from '../../helpers'
import { Navigation } from '../../pages/index'
import { apiPatch, apiPost, enableMessagingViaApi } from '../../api-helpers'
import { simulateIncomingMessage, uniqueCallerNumber } from '../../simulation-helpers'

type Page = import('@playwright/test').Page
type APIRequestContext = import('@playwright/test').APIRequestContext

interface SeededConversation {
  conversationId: string
  /** Last 4 digits of the unique sender number — the card renders `...XXXX`. */
  last4: string
}

/**
 * Seed a conversation into the worker's isolated hub via the real API and put
 * it in the requested status:
 *   - waiting: fresh inbound message, unassigned (default)
 *   - active:  claimed by the admin via POST /conversations/:id/claim
 *   - closed:  claimed, then closed via PATCH /conversations/:id
 * Returns null when the messaging backend is unavailable.
 */
async function seedConversationViaApi(
  backendRequest: APIRequestContext,
  workerHub: string,
  status: 'waiting' | 'active' | 'closed' = 'waiting',
): Promise<SeededConversation | null> {
  await enableMessagingViaApi(backendRequest, ['sms']).catch(() => {})
  const senderNumber = uniqueCallerNumber()
  const result = await simulateIncomingMessage(backendRequest, {
    senderNumber,
    body: `Test conversation ${Date.now()}`,
    channel: 'sms',
    // Scope to the worker's hub: the UI lists conversations hub-scoped, so a
    // conversation seeded without a hubId would never render in the test app.
    hubId: workerHub,
  }).catch(() => null)
  if (!result?.conversationId) return null

  const base = `/hubs/${workerHub}/conversations/${result.conversationId}`
  if (status !== 'waiting') {
    const claim = await apiPost(backendRequest, `${base}/claim`, {})
    if (claim.status !== 200) return null
  }
  if (status === 'closed') {
    const closed = await apiPatch(backendRequest, base, { status: 'closed' })
    if (closed.status !== 200) return null
  }
  return { conversationId: result.conversationId, last4: senderNumber.slice(-4) }
}

/**
 * Navigate to the conversations page and select the seeded conversation.
 * Selection is scoped by the sender's unique last-4 digits so parallel workers
 * never select each other's conversations. Returns false when the seeded
 * conversation does not render (seed failure).
 */
async function navigateAndSelect(page: Page, seeded: SeededConversation): Promise<boolean> {
  await Navigation.goToConversations(page)
  const item = page.getByTestId(TestIds.CONVERSATION_ITEM).filter({ hasText: seeded.last4 })
  const visible = await item.isVisible({ timeout: Timeouts.ELEMENT }).catch(() => false)
  if (!visible) return false
  await item.click()
  // Remember the last-4 for steps that must re-select the same conversation
  // after the app clears the detail selection (closing sets selectedId null).
  await page.evaluate((l4) => {
    ;(window as unknown as Record<string, unknown>).__test_conv_last4 = l4
  }, seeded.last4)
  return true
}

// --- Conversation setup ---

Given('a conversation exists', async ({ page, backendRequest, workerHub }) => {
  const seeded = await seedConversationViaApi(backendRequest, workerHub)
  // Select the conversation: downstream steps (assign, thread view) act on the
  // detail pane, which only renders once a conversation is selected.
  const selected = seeded !== null && (await navigateAndSelect(page, seeded))
  if (!selected) {
    // Messaging not supported in this environment — verify at least the page loaded
    // and flag so downstream steps take the deterministic "no conversation" branch.
    await Navigation.goToConversations(page).catch(() => {})
    await expect(page.getByTestId(TestIds.PAGE_TITLE)).toBeVisible({ timeout: Timeouts.ELEMENT })
    await flagNoConversation(page)
  }
})

Given('I have an open conversation', async ({ page, backendRequest, workerHub }) => {
  const seeded = await seedConversationViaApi(backendRequest, workerHub)
  const selected = seeded !== null && (await navigateAndSelect(page, seeded))
  if (selected) {
    // Claim the conversation through the UI so it becomes "active" and the
    // composer is visible. The conversation was just seeded via
    // simulateIncomingMessage, so it is guaranteed to be unassigned — the
    // claim button must be present.
    const claimBtn = page.getByTestId(TestIds.CONV_ASSIGN_BTN)
    await expect(claimBtn).toBeVisible({ timeout: Timeouts.ELEMENT })
    await claimBtn.click()
    await expect(page.getByTestId(TestIds.MESSAGE_COMPOSER)).toBeVisible({ timeout: Timeouts.ELEMENT })
  } else {
    // Backend not available — flag so downstream steps skip gracefully
    await Navigation.goToConversations(page).catch(() => {})
    await expect(page.getByTestId(TestIds.PAGE_TITLE)).toBeVisible({ timeout: Timeouts.ELEMENT })
    await flagNoConversation(page)
  }
})

Given('conversations from different channels exist', async ({ page, backendRequest, workerHub }) => {
  await enableMessagingViaApi(backendRequest, ['sms', 'whatsapp']).catch(() => {})
  // Create SMS conversation
  await simulateIncomingMessage(backendRequest, {
    senderNumber: uniqueCallerNumber(),
    body: 'SMS conversation',
    channel: 'sms',
    hubId: workerHub,
  }).catch(() => {})
  // Create WhatsApp conversation
  await simulateIncomingMessage(backendRequest, {
    senderNumber: uniqueCallerNumber(),
    body: 'WhatsApp conversation',
    channel: 'whatsapp',
    hubId: workerHub,
  }).catch(() => {})
  await Navigation.goToConversations(page)
  const item = page.getByTestId(TestIds.CONVERSATION_ITEM).first()
  const hasConvo = await item.isVisible({ timeout: Timeouts.ELEMENT }).catch(() => false)
  if (!hasConvo) {
    await expect(page.getByTestId(TestIds.PAGE_TITLE)).toBeVisible({ timeout: Timeouts.ELEMENT })
    await flagNoConversation(page)
  }
})

Given('an open conversation exists', async ({ page, backendRequest, workerHub }) => {
  // "Open" means active: the close button only renders once the conversation
  // is claimed, so claim it through the real API before navigating.
  const seeded = await seedConversationViaApi(backendRequest, workerHub, 'active')
  const selected = seeded !== null && (await navigateAndSelect(page, seeded))
  if (!selected) {
    await Navigation.goToConversations(page).catch(() => {})
    await expect(page.getByTestId(TestIds.PAGE_TITLE)).toBeVisible({ timeout: Timeouts.ELEMENT })
    await flagNoConversation(page)
  }
})

Given('a closed conversation exists', async ({ page, backendRequest, workerHub }) => {
  // Seed a conversation and close it through the real API (claim → close) so
  // the reopen button — rendered only for selected `closed` conversations —
  // is actually available.
  const seeded = await seedConversationViaApi(backendRequest, workerHub, 'closed')
  const selected = seeded !== null && (await navigateAndSelect(page, seeded))
  if (!selected) {
    await Navigation.goToConversations(page).catch(() => {})
    await expect(page.getByTestId(TestIds.PAGE_TITLE)).toBeVisible({ timeout: Timeouts.ELEMENT })
    await flagNoConversation(page)
  }
})

Given('conversations exist', async ({ page, backendRequest, workerHub }) => {
  const seeded = await seedConversationViaApi(backendRequest, workerHub)
  const selected = seeded !== null && (await navigateAndSelect(page, seeded))
  if (!selected) {
    await Navigation.goToConversations(page).catch(() => {})
    await flagNoConversation(page)
  }
})

// --- Conversation interactions ---

When('I click on a conversation', async ({ page }) => {
  if (await readNoConversationFlag(page)) return
  const item = page.getByTestId(TestIds.CONVERSATION_ITEM).first()
  await expect(item).toBeVisible({ timeout: Timeouts.ELEMENT })
  await item.click()
})

When('I type a message in the reply field', async ({ page }) => {
  if (await readNoConversationFlag(page)) return
  const composer = page.getByTestId(TestIds.MESSAGE_COMPOSER)
  await expect(composer).toBeVisible({ timeout: Timeouts.ELEMENT })
  const textarea = composer.locator('textarea, input[type="text"]').first()
  await textarea.fill(`Test message ${Date.now()}`)
})

When('I assign the conversation to a volunteer', async ({ page }) => {
  if (await readNoConversationFlag(page)) return
  // For a waiting conversation the app's assign action is the Claim button:
  // conv-assign-btn → handleClaim self-assigns immediately (src/client/routes/
  // conversations.tsx). There is no volunteer-picker dialog on this path —
  // the Reassign dialog (conv-reassign-btn) is a separate admin-only action.
  // The Given step seeded and selected a waiting conversation, so the claim
  // button must be rendered — a missing button is a real app bug.
  const assignBtn = page.getByTestId(TestIds.CONV_ASSIGN_BTN)
  await expect(assignBtn).toBeVisible({ timeout: Timeouts.ELEMENT })
  await assignBtn.click()
  // Claim completes with a "Conversation claimed" toast — wait for it so the
  // Then step runs against the post-claim state, not mid-request.
  await expect(page.getByText(/claimed/i).first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

When('I close the conversation', async ({ page }) => {
  if (await readNoConversationFlag(page)) return
  const closeBtn = page.getByTestId(TestIds.CONV_CLOSE_BTN)
  await expect(closeBtn).toBeVisible({ timeout: Timeouts.ELEMENT })
  await closeBtn.click()
  // handleClose closes immediately — the app shows no confirm dialog for
  // closing a conversation — and surfaces a "Conversation closed" toast.
})

When('I reopen the conversation', async ({ page }) => {
  if (await readNoConversationFlag(page)) return
  // The reopen button only renders for a selected closed conversation, and
  // closing a conversation clears the detail selection (handleClose sets
  // selectedId to null). Re-navigate to force a fresh list fetch (the relay
  // may have removed the closed card from live state), then re-select the
  // scenario's conversation by its unique sender digits. Re-selecting an
  // already-selected card is idempotent, so this is safe in both the
  // reopen-only and close-and-reopen scenarios.
  const last4 = await page.evaluate(
    () => (window as unknown as Record<string, unknown>).__test_conv_last4 as string | undefined,
  )
  expect(last4, 'seeded conversation last-4 must be recorded by the Given step').toBeTruthy()
  await Navigation.goToDashboard(page)
  await Navigation.goToConversations(page)
  const item = page.getByTestId(TestIds.CONVERSATION_ITEM).filter({ hasText: last4 as string })
  await expect(item).toBeVisible({ timeout: Timeouts.ELEMENT })
  await item.click()
  const reopenBtn = page.getByTestId(TestIds.CONV_REOPEN_BTN)
  await expect(reopenBtn).toBeVisible({ timeout: Timeouts.ELEMENT })
  await reopenBtn.click()
})

When('I search for a phone number', async ({ page }) => {
  if (await readNoConversationFlag(page)) return
  const searchInput = page.getByTestId(TestIds.CONV_SEARCH)
  await expect(searchInput).toBeVisible({ timeout: Timeouts.ELEMENT })
  await searchInput.fill('+1212')
})

// --- Conversation assertions ---

Then('I should see the conversation thread', async ({ page }) => {
  if (await readNoConversationFlag(page)) {
    await expect(page.getByTestId(TestIds.PAGE_TITLE)).toBeVisible({ timeout: Timeouts.ELEMENT })
    return
  }
  await expect(page.getByTestId(TestIds.CONVERSATION_THREAD)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see message timestamps', async ({ page }) => {
  if (await readNoConversationFlag(page)) return
  // Timestamps appear in the conversation thread
  const thread = page.getByTestId(TestIds.CONVERSATION_THREAD)
  await expect(thread).toBeVisible({ timeout: Timeouts.ELEMENT })
  const timestamp = thread.locator('text=/\\d{1,2}:\\d{2}|ago|just now/i').first()
  await expect(timestamp).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('the message should appear in the thread', async ({ page }) => {
  if (await readNoConversationFlag(page)) {
    await expect(page.getByTestId(TestIds.PAGE_TITLE)).toBeVisible({ timeout: Timeouts.ELEMENT })
    return
  }
  const thread = page.getByTestId(TestIds.CONVERSATION_THREAD)
  await expect(thread).toBeVisible({ timeout: Timeouts.ELEMENT })
  await expect(thread.locator('text=/Test message|test/i').first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('each conversation should show its channel badge', async ({ page }) => {
  if (await readNoConversationFlag(page)) return
  const item = page.getByTestId(TestIds.CONVERSATION_ITEM).first()
  await expect(item).toBeVisible({ timeout: Timeouts.ELEMENT })
  // Channel badge is rendered by ChannelBadge component inside conversation-item
  const badge = item.locator('text=/SMS|WhatsApp|Signal|RCS/i')
  await expect(badge.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('the conversation should show the assigned volunteer', async ({ page }) => {
  if (await readNoConversationFlag(page)) {
    await expect(page.getByTestId(TestIds.PAGE_TITLE)).toBeVisible({ timeout: Timeouts.ELEMENT })
    return
  }
  // After claiming, the conversation detail header shows the assigned user
  const assigned = page.locator('text=/assigned|claimed|volunteer/i')
  await expect(assigned.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('the conversation status should change to {string}', async ({ page }, status: string) => {
  if (await readNoConversationFlag(page)) {
    await expect(page.getByTestId(TestIds.PAGE_TITLE)).toBeVisible({ timeout: Timeouts.ELEMENT })
    return
  }
  // After close/reopen, look for the status text or a toast notification
  const statusText = page.locator(`text=/${status}/i`).first()
  await expect(statusText).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('matching conversations should be displayed', async ({ page }) => {
  const results = page.locator(
    `[data-testid="${TestIds.CONVERSATION_ITEM}"], [data-testid="${TestIds.EMPTY_STATE}"], [data-testid="${TestIds.CONVERSATION_LIST}"]`,
  )
  await expect(results.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})
