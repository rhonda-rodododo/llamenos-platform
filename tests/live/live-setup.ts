import { test } from '@playwright/test'
import { resetStaging } from './helpers'

test('reset staging state', async ({ request }) => {
  // Retry in case the staging instance is cold-starting
  for (let i = 0; i < 5; i++) {
    try {
      await resetStaging(request)
      return
    } catch {
      // Server not ready yet
    }
    await new Promise(r => setTimeout(r, 2000))
  }
  // Final attempt — let it throw if it fails
  await resetStaging(request)
})
