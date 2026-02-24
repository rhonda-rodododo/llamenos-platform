import { test, expect } from '@playwright/test'

test('reset test state', async ({ request }) => {
  // Retry in case the server is still initializing
  for (let i = 0; i < 10; i++) {
    try {
      const res = await request.post('/api/test-reset')
      if (res.ok()) return
      // 404 means ENVIRONMENT !== 'development' — fatal, won't self-heal
      if (res.status() === 404) {
        throw new Error(
          'test-reset returned 404 — ENVIRONMENT must be set to "development". ' +
          'For Docker: use docker-compose.test.yml override. ' +
          'For wrangler: set ENVIRONMENT=development in .dev.vars',
        )
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('test-reset returned 404')) throw err
      // Server not ready yet — retry
    }
    await new Promise(r => setTimeout(r, 2000))
  }
  // Final attempt with assertion
  const res = await request.post('/api/test-reset')
  expect(res.ok(), `test-reset failed with status ${res.status()}: ${await res.text()}`).toBeTruthy()
})
