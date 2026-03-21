import { test as base, createBdd } from 'playwright-bdd'
import { createHubViaApi, deleteHubViaApi } from '../../api-helpers'

/**
 * Backend BDD fixture — API-only, no browser page required.
 *
 * Uses Playwright's APIRequestContext for HTTP calls to the backend.
 * All backend step definitions import Given/When/Then from this file.
 *
 * `world` is a scenario-scoped key/value store. Each step file stores its
 * typed local state under a unique key, avoiding module-level `let` variables
 * that would collide under parallel execution.
 *
 * `workerHub` is a test-scoped hub ID — each scenario gets its own isolated
 * hub so tests never see state created by other scenarios.
 */
export const test = base.extend<
  { world: Record<string, unknown>; workerHub: string }
>({
  world: async ({}, use) => {
    await use({})
  },
  workerHub: async ({ request }, use) => {
    const name = `bdd-hub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const hubId = await createHubViaApi(request, name)
    await use(hubId)
    // Teardown: clean up hub and all its data after scenario completes
    await deleteHubViaApi(request, hubId)
  },
})

export const { Given, When, Then, Before, After } = createBdd(test)

/**
 * Typed accessor for per-file state stored in the world fixture.
 * Each step file calls `getState<MyState>(world, 'myKey')` to retrieve
 * its state, and `setState(world, 'myKey', value)` to store it.
 */
export function getState<T>(world: Record<string, unknown>, key: string): T {
  return world[key] as T
}

export function setState<T>(world: Record<string, unknown>, key: string, value: T): void {
  world[key] = value
}
