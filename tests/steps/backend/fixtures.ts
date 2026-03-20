import { test as base, createBdd } from 'playwright-bdd'
import { createHubViaApi } from '../../api-helpers'

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
 * `workerHub` is a worker-scoped hub ID — each Playwright worker gets its own
 * isolated hub for test data isolation.
 */
export const test = base.extend<
  { world: Record<string, unknown> },
  { workerHub: string }
>({
  world: async ({}, use) => {
    await use({})
  },
  workerHub: [async ({ playwright }, use, workerInfo) => {
    const backendUrl = process.env.TEST_HUB_URL || 'http://localhost:3000'
    const ctx = await playwright.request.newContext({ baseURL: backendUrl })
    const name = `backend-hub-${workerInfo.workerIndex}-${Date.now()}`
    const hubId = await createHubViaApi(ctx, name)
    await ctx.dispose()
    await use(hubId)
  }, { scope: 'worker' }],
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
