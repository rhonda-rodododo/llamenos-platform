/**
 * Cross-Hub Case Visibility step definitions (Epic 328).
 *
 * Tests the cross-hub sharing toggle — enable, disable, and default state.
 * Reuses the existing "case management is enabled" and "the server is reset"
 * steps from entity-schema.steps.ts and common.steps.ts respectively.
 */
import { expect } from '@playwright/test'
import { Given, When, Then, Before, getState, setState } from './fixtures'
import {
  enableCrossHubSharingViaApi,
  getCrossHubSharingViaApi,
} from '../../api-helpers'

// ── Local State ────────────────────────────────────────────────────

interface CrossHubState {
  crossHubEnabled?: boolean
}

const CROSS_HUB_KEY = 'cross_hub'

function getCrossHubState(world: Record<string, unknown>): CrossHubState {
  return getState<CrossHubState>(world, CROSS_HUB_KEY)
}


Before({ tags: '@cases' }, async ({ request, world }) => {
  // Reset cross-hub sharing to disabled before each scenario to prevent
  // test pollution (systemSettings is shared across all scenarios).
  try { await enableCrossHubSharingViaApi(request, false) } catch { /* ignore if not supported */ }
  const crossHub = {}
  setState(world, CROSS_HUB_KEY, crossHub)
})

// ── Given ──────────────────────────────────────────────────────────

Given('cross-hub sharing is enabled', async ({ request, world }) => {
  const result = await enableCrossHubSharingViaApi(request, true)
  getCrossHubState(world).crossHubEnabled = result.enabled
})

// ── When ───────────────────────────────────────────────────────────

When('the admin enables cross-hub sharing', async ({ request, world }) => {
  const result = await enableCrossHubSharingViaApi(request, true)
  getCrossHubState(world).crossHubEnabled = result.enabled
})

When('the admin disables cross-hub sharing', async ({ request, world }) => {
  const result = await enableCrossHubSharingViaApi(request, false)
  getCrossHubState(world).crossHubEnabled = result.enabled
})

// ── Then ───────────────────────────────────────────────────────────

Then('cross-hub sharing should be enabled', async ({ request }) => {
  const result = await getCrossHubSharingViaApi(request)
  expect(result.enabled).toBe(true)
})

Then('cross-hub sharing should be disabled', async ({ request }) => {
  const result = await getCrossHubSharingViaApi(request)
  expect(result.enabled).toBe(false)
})
