import { Before } from '../fixtures'

Before(async ({ page, workerHub }) => {
  await page.evaluate((id) => {
    window.__TEST_SET_ACTIVE_HUB?.(id)
  }, workerHub).catch(() => {})
})
