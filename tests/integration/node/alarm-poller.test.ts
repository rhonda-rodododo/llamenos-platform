/**
 * Integration tests for the alarm poller — polls the alarms table and fires
 * due callbacks on PostgresStorage instances.
 *
 * Requires DATABASE_URL env var pointing to a real PostgreSQL instance.
 *
 * Because pollAlarms() is a module-private function, these tests exercise the
 * alarm system by:
 * 1. Using PostgresStorage to set alarms directly in the DB
 * 2. Starting the poller via startAlarmPoller() with a registry
 * 3. Verifying that fireAlarm() is called on the correct storage instances
 *
 * The poller has a 30s interval and a 5s initial delay, so for faster tests
 * we manually query the DB the same way the poller does.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import { initPostgresPool, getPool, closePool } from '../../../src/platform/bun/storage/postgres-pool'
import { PostgresStorage } from '../../../src/platform/bun/storage/postgres-storage'

const skipIfNoDB = !process.env.DATABASE_URL

/**
 * Simulate a single poll cycle — exactly what pollAlarms() does internally.
 * This avoids waiting for the 30s interval timer.
 */
async function simulatePoll(instances: Map<string, PostgresStorage>): Promise<string[]> {
  const sql = getPool()
  const now = Date.now()

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

  const fired: string[] = []
  for (const row of dueAlarms) {
    const storage = instances.get(row.namespace)
    if (storage) {
      await storage.fireAlarm()
      fired.push(row.namespace)
    }
  }
  return fired
}

describe.skipIf(skipIfNoDB)('AlarmPoller', () => {
  let testId: string

  beforeAll(async () => {
    await initPostgresPool()
  })

  afterAll(async () => {
    await closePool()
  })

  beforeEach(() => {
    testId = `alarm-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  })

  describe('due alarm fires', () => {
    it('fires callback for an alarm scheduled in the past', async () => {
      const ns = `${testId}-due`
      const storage = new PostgresStorage(ns)
      let firedCount = 0

      storage.setAlarmCallback(async () => {
        firedCount++
      })

      // Schedule an alarm 1 second in the past
      await storage.setAlarm(Date.now() - 1000)

      const instances = new Map<string, PostgresStorage>()
      instances.set(ns, storage)

      const fired = await simulatePoll(instances)
      expect(fired).toContain(ns)
      expect(firedCount).toBe(1)
    })

    it('fires callback for an alarm scheduled at exactly now', async () => {
      const ns = `${testId}-now`
      const storage = new PostgresStorage(ns)
      let firedCount = 0

      storage.setAlarmCallback(async () => {
        firedCount++
      })

      await storage.setAlarm(Date.now())

      const instances = new Map<string, PostgresStorage>()
      instances.set(ns, storage)

      const fired = await simulatePoll(instances)
      expect(fired).toContain(ns)
      expect(firedCount).toBe(1)
    })
  })

  describe('future alarm does not fire', () => {
    it('does not fire callback for an alarm scheduled in the future', async () => {
      const ns = `${testId}-future`
      const storage = new PostgresStorage(ns)
      let firedCount = 0

      storage.setAlarmCallback(async () => {
        firedCount++
      })

      // Schedule an alarm 60 seconds in the future
      await storage.setAlarm(Date.now() + 60_000)

      const instances = new Map<string, PostgresStorage>()
      instances.set(ns, storage)

      const fired = await simulatePoll(instances)
      expect(fired).not.toContain(ns)
      expect(firedCount).toBe(0)

      // Verify the alarm is still in the DB (wasn't deleted)
      expect(await storage.getAlarm()).not.toBeNull()
    })
  })

  describe('alarm cancellation', () => {
    it('does not fire after deleteAlarm()', async () => {
      const ns = `${testId}-cancel`
      const storage = new PostgresStorage(ns)
      let firedCount = 0

      storage.setAlarmCallback(async () => {
        firedCount++
      })

      // Set alarm in the past, then cancel it
      await storage.setAlarm(Date.now() - 1000)
      await storage.deleteAlarm()

      const instances = new Map<string, PostgresStorage>()
      instances.set(ns, storage)

      const fired = await simulatePoll(instances)
      expect(fired).not.toContain(ns)
      expect(firedCount).toBe(0)
    })
  })

  describe('alarm rescheduling', () => {
    it('only the latest scheduled time matters', async () => {
      const ns = `${testId}-resched`
      const storage = new PostgresStorage(ns)
      let firedCount = 0

      storage.setAlarmCallback(async () => {
        firedCount++
      })

      // Schedule in the past, then reschedule to the future
      await storage.setAlarm(Date.now() - 5000)
      await storage.setAlarm(Date.now() + 60_000)

      const instances = new Map<string, PostgresStorage>()
      instances.set(ns, storage)

      const fired = await simulatePoll(instances)
      expect(fired).not.toContain(ns)
      expect(firedCount).toBe(0)

      // Alarm should still be in the DB
      expect(await storage.getAlarm()).not.toBeNull()
    })

    it('reschedule from future to past makes it fire', async () => {
      const ns = `${testId}-resched2`
      const storage = new PostgresStorage(ns)
      let firedCount = 0

      storage.setAlarmCallback(async () => {
        firedCount++
      })

      // Schedule in the future, then reschedule to the past
      await storage.setAlarm(Date.now() + 60_000)
      await storage.setAlarm(Date.now() - 1000)

      const instances = new Map<string, PostgresStorage>()
      instances.set(ns, storage)

      const fired = await simulatePoll(instances)
      expect(fired).toContain(ns)
      expect(firedCount).toBe(1)
    })
  })

  describe('FOR UPDATE SKIP LOCKED', () => {
    it('two concurrent poll cycles do not fire the same alarm twice', async () => {
      const ns = `${testId}-skiplock`
      const storage = new PostgresStorage(ns)
      let firedCount = 0

      storage.setAlarmCallback(async () => {
        firedCount++
      })

      await storage.setAlarm(Date.now() - 1000)

      const instances = new Map<string, PostgresStorage>()
      instances.set(ns, storage)

      // Run two polls concurrently
      const [fired1, fired2] = await Promise.all([
        simulatePoll(instances),
        simulatePoll(instances),
      ])

      // Exactly one poll should have claimed the alarm
      const totalFired = fired1.filter(n => n === ns).length + fired2.filter(n => n === ns).length
      expect(totalFired).toBe(1)
      expect(firedCount).toBe(1)
    })

    it('multiple due alarms across namespaces all fire', async () => {
      const namespaces = Array.from({ length: 5 }, (_, i) => `${testId}-multi-${i}`)
      const instances = new Map<string, PostgresStorage>()
      const firedNamespaces: string[] = []

      for (const ns of namespaces) {
        const storage = new PostgresStorage(ns)
        storage.setAlarmCallback(async () => {
          firedNamespaces.push(ns)
        })
        await storage.setAlarm(Date.now() - 1000)
        instances.set(ns, storage)
      }

      await simulatePoll(instances)

      expect(firedNamespaces).toHaveLength(5)
      for (const ns of namespaces) {
        expect(firedNamespaces).toContain(ns)
      }
    })
  })

  describe('alarm deleted after firing', () => {
    it('fired alarm is removed from the database', async () => {
      const ns = `${testId}-cleanup`
      const storage = new PostgresStorage(ns)

      storage.setAlarmCallback(async () => {
        // no-op
      })

      await storage.setAlarm(Date.now() - 1000)
      expect(await storage.getAlarm()).not.toBeNull()

      const instances = new Map<string, PostgresStorage>()
      instances.set(ns, storage)

      await simulatePoll(instances)

      // The alarm row should be deleted by the poll
      expect(await storage.getAlarm()).toBeNull()
    })
  })

  describe('unregistered namespace', () => {
    it('due alarm for unknown namespace is deleted but no callback fires', async () => {
      const ns = `${testId}-unknown`
      const storage = new PostgresStorage(ns)

      // Set alarm directly but don't register the storage in the instances map
      await storage.setAlarm(Date.now() - 1000)

      const instances = new Map<string, PostgresStorage>()
      // Intentionally not adding 'storage' to instances

      const fired = await simulatePoll(instances)
      // The alarm namespace was returned but no callback found
      expect(fired).not.toContain(ns)

      // The alarm row should still have been deleted by the DELETE...RETURNING
      expect(await storage.getAlarm()).toBeNull()
    })
  })
})
