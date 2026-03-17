/**
 * PostgreSQL-backed storage implementing StorageApi.
 * Uses advisory locks to emulate CF's single-writer DO guarantee.
 *
 * Uses Bun's built-in SQL driver. JSONB values are written via
 * JSON.stringify() with explicit ::jsonb cast since Bun.sql has
 * no sql.json() equivalent.
 */
import type { StorageApi } from '../../types'
import { getPool } from './postgres-pool'

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

  async get<T = unknown>(key: string): Promise<T | undefined>
  async get<T = unknown>(keys: string[]): Promise<Map<string, T>>
  async get<T = unknown>(keyOrKeys: string | string[]): Promise<T | undefined | Map<string, T>> {
    const sql = getPool()

    // Batch overload: get(['key1', 'key2', ...])
    if (Array.isArray(keyOrKeys)) {
      const result = new Map<string, T>()
      if (keyOrKeys.length === 0) return result
      const rows = await sql`
        SELECT key, value FROM kv_store
        WHERE namespace = ${this.namespace} AND key = ANY(${keyOrKeys})
      `
      for (const row of rows) {
        result.set(row.key, row.value as T)
      }
      return result
    }

    // Single key overload: get('key')
    const rows = await sql`
      SELECT value FROM kv_store
      WHERE namespace = ${this.namespace} AND key = ${keyOrKeys}
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
            await tx`
              INSERT INTO kv_store (namespace, key, value)
              VALUES (${this.namespace}, ${k}, ${JSON.stringify(v)}::jsonb)
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
        // JSON.stringify(null) → 'null' which is valid JSONB literal null.
        // Use 'null'::jsonb to store JSONB literal null (distinct from SQL NULL).
        await tx`
          INSERT INTO kv_store (namespace, key, value)
          VALUES (${this.namespace}, ${key}, 'null'::jsonb)
          ON CONFLICT (namespace, key)
          DO UPDATE SET value = EXCLUDED.value
        `
      } else {
        await tx`
          INSERT INTO kv_store (namespace, key, value)
          VALUES (${this.namespace}, ${key}, ${JSON.stringify(value)}::jsonb)
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

  async list(options?: { prefix?: string; limit?: number; start?: string; end?: string }): Promise<Map<string, unknown>> {
    const sql = getPool()
    const result = new Map<string, unknown>()

    // Use Bun.sql's unsafe() for dynamic WHERE construction since
    // tagged template fragments can't be composed like postgres.js
    const prefix = options?.prefix
    const start = options?.start
    const end = options?.end
    const limit = options?.limit

    let rows: Array<{ key: string; value: unknown }>

    if (prefix && start && end && limit) {
      const escaped = prefix.replace(/[%_\\]/g, '\\$&')
      rows = await sql`
        SELECT key, value FROM kv_store
        WHERE namespace = ${this.namespace} AND key LIKE ${escaped + '%'} AND key >= ${start} AND key < ${end}
        ORDER BY key ASC LIMIT ${limit}
      ` as any
    } else if (prefix && limit) {
      const escaped = prefix.replace(/[%_\\]/g, '\\$&')
      rows = await sql`
        SELECT key, value FROM kv_store
        WHERE namespace = ${this.namespace} AND key LIKE ${escaped + '%'}
        ORDER BY key ASC LIMIT ${limit}
      ` as any
    } else if (prefix && start) {
      const escaped = prefix.replace(/[%_\\]/g, '\\$&')
      rows = await sql`
        SELECT key, value FROM kv_store
        WHERE namespace = ${this.namespace} AND key LIKE ${escaped + '%'} AND key >= ${start}
        ORDER BY key ASC
      ` as any
    } else if (prefix && end) {
      const escaped = prefix.replace(/[%_\\]/g, '\\$&')
      rows = await sql`
        SELECT key, value FROM kv_store
        WHERE namespace = ${this.namespace} AND key LIKE ${escaped + '%'} AND key < ${end}
        ORDER BY key ASC
      ` as any
    } else if (prefix) {
      const escaped = prefix.replace(/[%_\\]/g, '\\$&')
      rows = await sql`
        SELECT key, value FROM kv_store
        WHERE namespace = ${this.namespace} AND key LIKE ${escaped + '%'}
        ORDER BY key ASC
      ` as any
    } else if (start && end && limit) {
      rows = await sql`
        SELECT key, value FROM kv_store
        WHERE namespace = ${this.namespace} AND key >= ${start} AND key < ${end}
        ORDER BY key ASC LIMIT ${limit}
      ` as any
    } else if (limit) {
      rows = await sql`
        SELECT key, value FROM kv_store
        WHERE namespace = ${this.namespace}
        ORDER BY key ASC LIMIT ${limit}
      ` as any
    } else {
      rows = await sql`
        SELECT key, value FROM kv_store
        WHERE namespace = ${this.namespace}
        ORDER BY key ASC
      ` as any
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
