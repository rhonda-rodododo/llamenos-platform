import type { FullConfig } from '@playwright/test'

export default async function globalTeardown(_config: FullConfig): Promise<void> {
  const workerCount = parseInt(process.env.TEST_WORKER_COUNT || '0', 10)
  if (workerCount <= 0) return

  console.log(`[global-teardown] Dropping ${workerCount} per-worker PostgreSQL schemas...`)
  const { dropWorkerSchemas } = await import('./worker-db-setup')
  await dropWorkerSchemas(workerCount)
  console.log('[global-teardown] Per-worker schemas dropped')
}
