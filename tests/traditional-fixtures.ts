import { test as base, expect } from '@playwright/test'
import { createHubViaApi } from './api-helpers'

interface TraditionalFixtures {
}

interface WorkerFixtures {
  workerHub: string
}

export const test = base.extend<TraditionalFixtures, WorkerFixtures>({
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
