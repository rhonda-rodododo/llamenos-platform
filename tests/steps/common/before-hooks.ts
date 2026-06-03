import { test, Before } from '../fixtures'

Before(async ({ page, workerHub }) => {
  const { workerIndex } = test.info()

  // Use addInitScript so the hub ID persists across page navigations.
  // The ConfigProvider in config.tsx checks window.__TEST_WORKER_HUB and uses it
  // instead of the server's default hub, ensuring all API calls are hub-scoped
  // to this worker's isolated test hub.
  await page.addInitScript((hubId) => {
    (window as Record<string, unknown>).__TEST_WORKER_HUB = hubId
  }, workerHub)

  // Also set immediately if the page is already loaded (subsequent scenarios)
  await page.evaluate((id) => {
    (window as Record<string, unknown>).__TEST_WORKER_HUB = id
    ;(window as { __TEST_SET_ACTIVE_HUB?: (id: string | null) => void }).__TEST_SET_ACTIVE_HUB?.(id)
  }, workerHub).catch(() => {})

  // When per-worker DB isolation is enabled, inject X-Test-Worker-Index header
  // into all API calls from the browser. The Vite proxy forwards these to the
  // backend, which routes the request to the worker's isolated PostgreSQL schema.
  if (process.env.TEST_WORKER_COUNT) {
    await page.route('**/api/**', async (route) => {
      await route.continue({
        headers: {
          ...route.request().headers(),
          'x-test-worker-index': String(workerIndex),
        },
      })
    })
  }
})
