/**
 * Background alarm poller for PostgreSQL storage.
 * Polls the alarms table every 30s, fires due alarms.
 * Uses SELECT ... FOR UPDATE SKIP LOCKED to prevent duplicate
 * alarm firing across multiple replicas.
 */
import { getPool } from './postgres-pool'
import type { PostgresStorage } from './postgres-storage'

const POLL_INTERVAL_MS = 30_000

let pollTimer: ReturnType<typeof setInterval> | null = null
let storageInstances: Map<string, PostgresStorage> | null = null

/**
 * Start the alarm polling loop.
 * @param instances Map of namespace → PostgresStorage instances to fire alarms on
 */
export function startAlarmPoller(instances: Map<string, PostgresStorage>): void {
  if (pollTimer) return
  storageInstances = instances

  // Initial poll after 5s to let the app start
  setTimeout(() => pollAlarms(), 5000)
  pollTimer = setInterval(() => pollAlarms(), POLL_INTERVAL_MS)
  console.log(`[alarm-poller] Started (interval: ${POLL_INTERVAL_MS / 1000}s)`)
}

/**
 * Stop the alarm polling loop.
 */
export function stopAlarmPoller(): void {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
    storageInstances = null
    console.log('[alarm-poller] Stopped')
  }
}

async function pollAlarms(): Promise<void> {
  if (!storageInstances) return

  const sql = getPool()
  const now = Date.now()

  try {
    // Atomically claim due alarms using FOR UPDATE SKIP LOCKED
    const dueAlarms = await sql.begin(async (tx: any) => {
      const rows = await tx`
        DELETE FROM alarms
        WHERE namespace IN (
          SELECT namespace FROM alarms
          WHERE scheduled_at <= ${now}
          FOR UPDATE SKIP LOCKED
        )
        RETURNING namespace
      `
      return rows
    })

    for (const row of dueAlarms) {
      const storage = storageInstances.get(row.namespace)
      if (storage) {
        // Fire asynchronously — don't block the poll loop
        storage.fireAlarm().catch((err) => {
          console.error(`[alarm-poller] Failed to fire alarm for ${row.namespace}:`, err)
        })
      }
    }
  } catch (err) {
    console.error('[alarm-poller] Poll error:', err)
  }
}
