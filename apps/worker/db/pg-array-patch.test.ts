/**
 * Unit tests for the Bun SQL PgArray monkey-patch.
 *
 * The patch fixes two Bun SQL quirks vs. node-postgres:
 * 1. Bun returns null/undefined for NULL array columns; original code throws TypeError
 * 2. Bun returns native JS arrays (or typed arrays like Int32Array) instead of
 *    PostgreSQL wire-format strings like "{1,2,3}"
 *
 * This test suite verifies all three code paths:
 *   - null/undefined → []
 *   - native JS array / typed array → mapped through base column
 *   - string → original behaviour (node-postgres compat)
 */
import { describe, it, expect } from 'vitest'
import { pgTable, integer, text, doublePrecision } from 'drizzle-orm/pg-core'

// Apply the patch first (side-effecting import — MUST come before column access)
await import('./pg-array-patch')

// Use pgTable to build real columns with proper base column mapFromDriverValue
const testTable = pgTable('test', {
  ids: integer('ids').array(),
  tags: text('tags').array(),
  scores: doublePrecision('scores').array(),
})

describe('pg-array-patch', () => {
  describe('null / undefined guard (Bun NULL fix)', () => {
    it('returns [] for null (prevents TypeError on NULL column)', () => {
      expect(testTable.ids.mapFromDriverValue(null)).toEqual([])
    })

    it('returns [] for null text array', () => {
      expect(testTable.tags.mapFromDriverValue(null)).toEqual([])
    })

    it('returns [] for undefined', () => {
      expect(testTable.ids.mapFromDriverValue(undefined)).toEqual([])
    })

    it('result is a real Array, not null', () => {
      const result = testTable.ids.mapFromDriverValue(null)
      expect(Array.isArray(result)).toBe(true)
    })
  })

  describe('native JS array handling (Bun array fix)', () => {
    it('handles a plain JS number array from Bun SQL', () => {
      const result = testTable.ids.mapFromDriverValue([1, 2, 3])
      expect(Array.isArray(result)).toBe(true)
      expect(result).toHaveLength(3)
    })

    it('handles a plain JS string array from Bun SQL', () => {
      const result = testTable.tags.mapFromDriverValue(['foo', 'bar'])
      expect(Array.isArray(result)).toBe(true)
      expect(result).toEqual(['foo', 'bar'])
    })

    it('handles an empty JS array', () => {
      expect(testTable.ids.mapFromDriverValue([])).toEqual([])
    })

    it('handles a single-element array', () => {
      const result = testTable.ids.mapFromDriverValue([42])
      expect(result).toHaveLength(1)
    })

    it('handles Int32Array (Bun typed array for integer[])', () => {
      const typed = new Int32Array([10, 20, 30])
      const result = testTable.ids.mapFromDriverValue(typed)
      expect(Array.isArray(result)).toBe(true)
      expect(result).toHaveLength(3)
    })

    it('Int32Array values are correctly mapped', () => {
      const typed = new Int32Array([7, 8, 9])
      const result = testTable.ids.mapFromDriverValue(typed) as unknown[]
      expect(result[0]).toBe(7)
      expect(result[1]).toBe(8)
      expect(result[2]).toBe(9)
    })

    it('handles Float64Array (Bun typed array for double precision[])', () => {
      const typed = new Float64Array([1.5, 2.5, 3.5])
      const result = testTable.scores.mapFromDriverValue(typed)
      expect(Array.isArray(result)).toBe(true)
      expect(result).toHaveLength(3)
    })

    it('handles BigInt64Array without crashing', () => {
      const typed = new BigInt64Array([BigInt(1), BigInt(2)])
      const result = testTable.ids.mapFromDriverValue(typed)
      expect(Array.isArray(result)).toBe(true)
      expect(result).toHaveLength(2)
    })

    it('does NOT produce a corrupted object (the pre-patch bug was: keys like "0", "1", "2")', () => {
      // Pre-patch: PgArray iterated typed array as string characters → {0: char, 1: char, ...}
      const typed = new Int32Array([7, 8, 9])
      const result = testTable.ids.mapFromDriverValue(typed) as unknown[]
      // Must be a real Array
      expect(Array.isArray(result)).toBe(true)
      // Must NOT look like {0: '0', 1: '8', ...} from string iteration
      expect(result[0]).not.toBe('7') // was corrupted to char '7' pre-patch
    })
  })

  describe('string passthrough (node-postgres compat)', () => {
    it('falls through to original behaviour for pg-format strings', () => {
      expect(() => testTable.ids.mapFromDriverValue('{1,2,3}')).not.toThrow()
    })

    it('returns an array for pg-format integer string', () => {
      const result = testTable.ids.mapFromDriverValue('{1,2,3}')
      expect(Array.isArray(result)).toBe(true)
    })

    it('returns the correct values for pg-format integer string', () => {
      const result = testTable.ids.mapFromDriverValue('{1,2,3}')
      expect(result).toHaveLength(3)
    })

    it('returns an empty array for empty pg-format string "{}"', () => {
      const result = testTable.ids.mapFromDriverValue('{}')
      expect(Array.isArray(result)).toBe(true)
      expect(result).toHaveLength(0)
    })

    it('handles pg-format text array string', () => {
      const result = testTable.tags.mapFromDriverValue('{foo,bar}')
      expect(Array.isArray(result)).toBe(true)
    })
  })
})
