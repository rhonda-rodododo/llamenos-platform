/**
 * Unit tests for apps/worker/lib/storage-monitor.ts
 *
 * Tests size estimation, key size checking, and storage health scanning.
 */
import { describe, it, expect } from 'vitest'
import {
  DO_STORAGE_VALUE_LIMIT,
  estimateValueSize,
  checkKeySize,
  scanStorageHealth,
  logStorageWarnings,
} from '@worker/lib/storage-monitor'

describe('storage-monitor', () => {
  describe('DO_STORAGE_VALUE_LIMIT', () => {
    it('is 128 KiB (131072 bytes)', () => {
      expect(DO_STORAGE_VALUE_LIMIT).toBe(128 * 1024)
    })
  })

  describe('estimateValueSize', () => {
    it('returns byte length of JSON-serialized string', () => {
      const value = 'hello'
      // JSON.stringify('hello') → '"hello"' → 7 bytes
      expect(estimateValueSize(value)).toBe(7)
    })

    it('returns byte length of JSON-serialized object', () => {
      const value = { a: 1 }
      // JSON.stringify({a:1}) → '{"a":1}' → 7 bytes
      expect(estimateValueSize(value)).toBe(7)
    })

    it('returns byte length for array', () => {
      const value = [1, 2, 3]
      // JSON.stringify([1,2,3]) → '[1,2,3]' → 7 bytes
      expect(estimateValueSize(value)).toBe(7)
    })

    it('returns 0 for circular references (non-serializable)', () => {
      const obj: Record<string, unknown> = {}
      obj.self = obj
      expect(estimateValueSize(obj)).toBe(0)
    })

    it('returns 0 for undefined (non-serializable to JSON)', () => {
      // JSON.stringify(undefined) returns undefined (not a string)
      // TextEncoder will throw on undefined, so catch returns 0
      expect(estimateValueSize(undefined)).toBe(0)
    })

    it('handles null', () => {
      // JSON.stringify(null) → 'null' → 4 bytes
      expect(estimateValueSize(null)).toBe(4)
    })

    it('handles multi-byte characters (UTF-8)', () => {
      // '€' is 3 bytes in UTF-8, JSON.stringify adds quotes: '"€"' → 2 + 3 = 5 bytes
      const size = estimateValueSize('€')
      expect(size).toBe(5)
    })

    it('handles empty object', () => {
      // JSON.stringify({}) → '{}' → 2 bytes
      expect(estimateValueSize({})).toBe(2)
    })

    it('handles large nested objects', () => {
      const large = { data: 'x'.repeat(1000) }
      const expected = new TextEncoder().encode(JSON.stringify(large)).byteLength
      expect(estimateValueSize(large)).toBe(expected)
    })
  })

  describe('checkKeySize', () => {
    it('returns metrics for a small value below threshold', () => {
      const metrics = checkKeySize('test-key', { small: true })
      expect(metrics.key).toBe('test-key')
      expect(metrics.estimatedSize).toBeGreaterThan(0)
      expect(metrics.percentOfLimit).toBeLessThan(0.75)
      expect(metrics.overThreshold).toBe(false)
    })

    it('marks overThreshold when value exceeds 75% of limit', () => {
      // Create value that's about 100KB (> 75% of 128KB)
      const bigValue = 'x'.repeat(100_000)
      const metrics = checkKeySize('big-key', bigValue)
      expect(metrics.overThreshold).toBe(true)
      expect(metrics.percentOfLimit).toBeGreaterThanOrEqual(0.75)
    })

    it('correctly calculates percentOfLimit', () => {
      const value = 'x'.repeat(DO_STORAGE_VALUE_LIMIT / 2)
      const metrics = checkKeySize('half-key', value)
      // The JSON serialization adds quotes, so it'll be slightly over 50%
      expect(metrics.percentOfLimit).toBeGreaterThan(0.49)
      expect(metrics.percentOfLimit).toBeLessThan(0.52)
    })
  })

  describe('scanStorageHealth', () => {
    it('reports zero hot keys when all values are small', async () => {
      const entries = new Map<string, unknown>()
      entries.set('key1', { small: true })
      entries.set('key2', 'hello')
      const storage = {
        list: async () => entries,
      }

      const report = await scanStorageHealth(storage)
      expect(report.totalKeys).toBe(2)
      expect(report.hotKeys).toHaveLength(0)
      expect(report.warnings).toHaveLength(0)
    })

    it('identifies hot keys above threshold', async () => {
      const bigValue = 'x'.repeat(100_000)
      const entries = new Map<string, unknown>()
      entries.set('small-key', 'hello')
      entries.set('big-key', bigValue)
      const storage = {
        list: async () => entries,
      }

      const report = await scanStorageHealth(storage)
      expect(report.totalKeys).toBe(2)
      expect(report.hotKeys).toHaveLength(1)
      expect(report.hotKeys[0].key).toBe('big-key')
      expect(report.warnings).toHaveLength(1)
    })

    it('sorts hot keys by size descending', async () => {
      const bigValue = 'x'.repeat(100_000)
      const biggerValue = 'x'.repeat(120_000)
      const entries = new Map<string, unknown>()
      entries.set('big-key', bigValue)
      entries.set('bigger-key', biggerValue)
      const storage = {
        list: async () => entries,
      }

      const report = await scanStorageHealth(storage)
      expect(report.hotKeys[0].key).toBe('bigger-key')
      expect(report.hotKeys[1].key).toBe('big-key')
    })

    it('passes prefix to storage.list', async () => {
      let capturedOpts: { prefix?: string } | undefined
      const storage = {
        list: async (opts?: { prefix?: string }) => {
          capturedOpts = opts
          return new Map<string, unknown>()
        },
      }

      await scanStorageHealth(storage, 'my-prefix')
      expect(capturedOpts).toEqual({ prefix: 'my-prefix' })
    })

    it('calls list with no prefix when prefix is undefined', async () => {
      let capturedOpts: { prefix?: string } | undefined
      const storage = {
        list: async (opts?: { prefix?: string }) => {
          capturedOpts = opts
          return new Map<string, unknown>()
        },
      }

      await scanStorageHealth(storage)
      expect(capturedOpts).toBeUndefined()
    })

    it('includes percentage in warning message', async () => {
      const bigValue = 'x'.repeat(110_000)
      const entries = new Map<string, unknown>()
      entries.set('big', bigValue)
      const storage = {
        list: async () => entries,
      }

      const report = await scanStorageHealth(storage)
      expect(report.warnings[0]).toContain('%')
      expect(report.warnings[0]).toContain('big')
    })
  })

  describe('logStorageWarnings', () => {
    it('does not throw when report has no warnings', () => {
      const report = { totalKeys: 0, hotKeys: [], warnings: [] }
      expect(() => logStorageWarnings(report)).not.toThrow()
    })

    it('does not throw when report has warnings', () => {
      const report = {
        totalKeys: 1,
        hotKeys: [{ key: 'big', estimatedSize: 100_000, percentOfLimit: 0.76, overThreshold: true }],
        warnings: ['Key "big" is at 76.3% of limit'],
      }
      expect(() => logStorageWarnings(report)).not.toThrow()
    })
  })
})
