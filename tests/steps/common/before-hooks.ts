import { Before } from '../fixtures'

Before(async ({ page, workerHub }) => {
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
})
