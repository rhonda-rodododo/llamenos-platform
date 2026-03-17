/**
 * Integration tests for the PostgreSQL startup migration framework.
 *
 * Validates that:
 * 1. initPostgresPool() creates the required tables (kv_store, alarms)
 * 2. Running initPostgresPool() twice is idempotent (no errors)
 * 3. The table schemas have the expected columns and constraints
 *
 * Requires DATABASE_URL env var pointing to a real PostgreSQL instance.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { initPostgresPool, getPool, closePool } from '../../../src/platform/bun/storage/postgres-pool'

const skipIfNoDB = !process.env.DATABASE_URL

describe.skipIf(skipIfNoDB)('Startup migrations', () => {
  beforeAll(async () => {
    await initPostgresPool()
  })

  afterAll(async () => {
    await closePool()
  })

  describe('table creation', () => {
    it('kv_store table exists after initPostgresPool()', async () => {
      const sql = getPool()
      const rows = await sql`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'kv_store'
      `
      expect(rows).toHaveLength(1)
      expect(rows[0].table_name).toBe('kv_store')
    })

    it('alarms table exists after initPostgresPool()', async () => {
      const sql = getPool()
      const rows = await sql`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'alarms'
      `
      expect(rows).toHaveLength(1)
      expect(rows[0].table_name).toBe('alarms')
    })
  })

  describe('idempotent initialization', () => {
    it('calling initPostgresPool() twice does not error', async () => {
      // First call was in beforeAll. Second call should be no-op.
      await expect(initPostgresPool()).resolves.toBeDefined()
    })

    it('returns the same pool instance on second call', async () => {
      const pool1 = await initPostgresPool()
      const pool2 = await initPostgresPool()
      expect(pool1).toBe(pool2)
    })
  })

  describe('kv_store schema', () => {
    it('has namespace, key, and value columns', async () => {
      const sql = getPool()
      const columns = await sql`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'kv_store'
        ORDER BY ordinal_position
      `

      const colMap = new Map(columns.map((c: any) => [c.column_name, c.data_type]))
      expect(colMap.has('namespace')).toBe(true)
      expect(colMap.has('key')).toBe(true)
      expect(colMap.has('value')).toBe(true)
    })

    it('namespace column is TEXT', async () => {
      const sql = getPool()
      const rows = await sql`
        SELECT data_type FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'kv_store' AND column_name = 'namespace'
      `
      expect(rows[0].data_type).toBe('text')
    })

    it('key column is TEXT', async () => {
      const sql = getPool()
      const rows = await sql`
        SELECT data_type FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'kv_store' AND column_name = 'key'
      `
      expect(rows[0].data_type).toBe('text')
    })

    it('value column is JSONB', async () => {
      const sql = getPool()
      const rows = await sql`
        SELECT data_type FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'kv_store' AND column_name = 'value'
      `
      expect(rows[0].data_type).toBe('jsonb')
    })

    it('has a primary key on (namespace, key)', async () => {
      const sql = getPool()
      const rows = await sql`
        SELECT kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        WHERE tc.table_schema = 'public'
          AND tc.table_name = 'kv_store'
          AND tc.constraint_type = 'PRIMARY KEY'
        ORDER BY kcu.ordinal_position
      `
      const pkColumns = rows.map((r: any) => r.column_name)
      expect(pkColumns).toContain('namespace')
      expect(pkColumns).toContain('key')
      expect(pkColumns).toHaveLength(2)
    })
  })

  describe('alarms schema', () => {
    it('has namespace and scheduled_at columns', async () => {
      const sql = getPool()
      const columns = await sql`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'alarms'
        ORDER BY ordinal_position
      `

      const colMap = new Map(columns.map((c: any) => [c.column_name, c.data_type]))
      expect(colMap.has('namespace')).toBe(true)
      expect(colMap.has('scheduled_at')).toBe(true)
    })

    it('namespace column is TEXT', async () => {
      const sql = getPool()
      const rows = await sql`
        SELECT data_type FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'alarms' AND column_name = 'namespace'
      `
      expect(rows[0].data_type).toBe('text')
    })

    it('scheduled_at column is BIGINT', async () => {
      const sql = getPool()
      const rows = await sql`
        SELECT data_type FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'alarms' AND column_name = 'scheduled_at'
      `
      expect(rows[0].data_type).toBe('bigint')
    })

    it('has a primary key on namespace', async () => {
      const sql = getPool()
      const rows = await sql`
        SELECT kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        WHERE tc.table_schema = 'public'
          AND tc.table_name = 'alarms'
          AND tc.constraint_type = 'PRIMARY KEY'
        ORDER BY kcu.ordinal_position
      `
      const pkColumns = rows.map((r: any) => r.column_name)
      expect(pkColumns).toEqual(['namespace'])
    })

    it('has an index on scheduled_at', async () => {
      const sql = getPool()
      const rows = await sql`
        SELECT indexname FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'alarms'
          AND indexname = 'idx_alarms_scheduled'
      `
      expect(rows).toHaveLength(1)
    })
  })
})
