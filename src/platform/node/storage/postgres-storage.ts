/**
 * PostgreSQL-backed storage implementing StorageApi.
 * Uses advisory locks to emulate CF's single-writer DO guarantee.
 */
import type { StorageApi } from '../../types'
import type { JSONValue } from 'postgres'
import { getPool } from './postgres-pool'
/**
 * postgres.js TransactionSql loses call signatures through Omit<>.
 * We use `any` cast inside begin() callbacks for tagged template calls.
 */

export class PostgresStorage implements StorageApi {
  private namespace: string
  private alarmCallback: (() => Promise<void>) | null = null

  constructor(namespace: string) {
    this.namespace = namespace
  }

  setAlarmCallback(cb: () => Promise<void>) {
    this.alarmCallback = cb
  }

  /** Fire the alarm callback (called by AlarmPoller) */
  async fireAlarm(): Promise<void> {
    if (this.alarmCallback) {
      try {
        await this.alarmCallback()
      } catch (err) {
        console.error(`[alarm] Error in alarm callback for ${this.namespace}:`, err)
      }
    }
  }

  async get<T = unknown>(key: string): Promise<T | undefined> {
    const sql = getPool()
    const rows = await sql`
      SELECT value FROM kv_store
      WHERE namespace = ${this.namespace} AND key = ${key}
    `
    if (rows.length === 0) return undefined
    return rows[0].value as T
  }

  async put(keyOrEntries: string | Record<string, unknown>, value?: unknown): Promise<void> {
    // Batch overload: put({ key1: val1, key2: val2, ... })
    if (typeof keyOrEntries === 'object' && keyOrEntries !== null) {
      const entries = keyOrEntries as Record<string, unknown>
      const keys = Object.keys(entries)
      if (keys.length === 0) return
      const sql = getPool()
      await sql.begin(async (tx: any) => {
        await tx`SELECT pg_advisory_xact_lock(hashtext(${this.namespace}))`
        for (const k of keys) {
          const v = entries[k]
          if (v === null || v === undefined) {
            await tx`
              INSERT INTO kv_store (namespace, key, value)
              VALUES (${this.namespace}, ${k}, 'null'::jsonb)
              ON CONFLICT (namespace, key)
              DO UPDATE SET value = EXCLUDED.value
            `
          } else {
            const jsonValue = sql.json(v as JSONValue)
            await tx`
              INSERT INTO kv_store (namespace, key, value)
              VALUES (${this.namespace}, ${k}, ${jsonValue})
              ON CONFLICT (namespace, key)
              DO UPDATE SET value = EXCLUDED.value
            `
          }
        }
      })
      return
    }

    // Single key-value overload: put(key, value)
    const key = keyOrEntries as string
    const sql = getPool()
    await sql.begin(async (tx: any) => {
      // Advisory lock scoped to transaction — serializes writes per namespace
      await tx`SELECT pg_advisory_xact_lock(hashtext(${this.namespace}))`
      if (value === null || value === undefined) {
        // sql.json(null) produces SQL NULL which violates NOT NULL constraint.
        // Use 'null'::jsonb to store JSONB literal null (distinct from SQL NULL).
        await tx`
          INSERT INTO kv_store (namespace, key, value)
          VALUES (${this.namespace}, ${key}, 'null'::jsonb)
          ON CONFLICT (namespace, key)
          DO UPDATE SET value = EXCLUDED.value
        `
      } else {
        const jsonValue = sql.json(value as JSONValue)
        await tx`
          INSERT INTO kv_store (namespace, key, value)
          VALUES (${this.namespace}, ${key}, ${jsonValue})
          ON CONFLICT (namespace, key)
          DO UPDATE SET value = EXCLUDED.value
        `
      }
    })
  }

  async delete(keyOrKeys: string | string[]): Promise<void> {
    const sql = getPool()
    if (Array.isArray(keyOrKeys)) {
      // Batch delete overload
      if (keyOrKeys.length === 0) return
      await sql`
        DELETE FROM kv_store
        WHERE namespace = ${this.namespace} AND key = ANY(${keyOrKeys})
      `
    } else {
      await sql`
        DELETE FROM kv_store
        WHERE namespace = ${this.namespace} AND key = ${keyOrKeys}
      `
    }
  }

  async deleteAll(): Promise<void> {
    const sql = getPool()
    await sql.begin(async (tx: any) => {
      await tx`SELECT pg_advisory_xact_lock(hashtext(${this.namespace}))`
      await tx`DELETE FROM kv_store WHERE namespace = ${this.namespace}`
      await tx`DELETE FROM alarms WHERE namespace = ${this.namespace}`
    })
  }

  async list(options?: { prefix?: string }): Promise<Map<string, unknown>> {
    const sql = getPool()
    const result = new Map<string, unknown>()

    let rows
    if (options?.prefix) {
      // Escape LIKE wildcards
      const escaped = options.prefix.replace(/[%_\\]/g, '\\$&')
      rows = await sql`
        SELECT key, value FROM kv_store
        WHERE namespace = ${this.namespace} AND key LIKE ${escaped + '%'}
      `
    } else {
      rows = await sql`
        SELECT key, value FROM kv_store
        WHERE namespace = ${this.namespace}
      `
    }

    for (const row of rows) {
      result.set(row.key, row.value)
    }
    return result
  }

  async setAlarm(scheduledTime: number | Date): Promise<void> {
    const ms = typeof scheduledTime === 'number' ? scheduledTime : scheduledTime.getTime()
    const sql = getPool()
    await sql`
      INSERT INTO alarms (namespace, scheduled_at)
      VALUES (${this.namespace}, ${ms})
      ON CONFLICT (namespace)
      DO UPDATE SET scheduled_at = EXCLUDED.scheduled_at
    `
  }

  async getAlarm(): Promise<number | null> {
    const sql = getPool()
    const rows = await sql`
      SELECT scheduled_at FROM alarms
      WHERE namespace = ${this.namespace}
    `
    if (rows.length === 0) return null
    return Number(rows[0].scheduled_at)
  }

  async deleteAlarm(): Promise<void> {
    const sql = getPool()
    await sql`
      DELETE FROM alarms WHERE namespace = ${this.namespace}
    `
  }
}
