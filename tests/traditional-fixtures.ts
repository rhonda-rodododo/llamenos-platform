import { test as base, expect } from '@playwright/test'
import { createHubViaApi } from './api-helpers'

/**
 * Traditional Playwright test fixtures.
 *
 * These fixtures are shared between BDD and traditional-style tests.
 * The workerHub fixture is worker-scoped to provide isolated hubs per worker
 * for safe parallel test execution.
 */
export const test = base.extend<
  {},
  {
    workerHub: string
  }
>({
  // Worker-scoped hub: created once per Playwright worker process.
  // Each worker gets its own isolated hub so parallel tests don't share state.
  // Hub is NOT deleted after tests — stale hubs accumulate and are purged separately.
  workerHub: [async ({ playwright }, use, workerInfo) => {
    const backendUrl = process.env.TEST_HUB_URL || 'http://localhost:3000'
    const ctx = await playwright.request.newContext({ baseURL: backendUrl, timeout: 60_000 })
    const name = `test-hub-${workerInfo.workerIndex}-${Date.now()}`
    const hubId = await createHubViaApi(ctx, name)
    await ctx.dispose()
    await use(hubId)
  }, { scope: 'worker', timeout: 60_000 }],
})

export { expect }
