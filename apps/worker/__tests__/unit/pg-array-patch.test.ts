/**
 * Unit tests for apps/worker/db/pg-array-patch.ts
 *
 * Tests the monkey-patch on PgArray.mapFromDriverValue that handles
 * Bun SQL's native array return types.
 */
import { describe, it, expect } from 'vitest'

// Import the patch (side-effect import — mutates PgArray.prototype)
import '@worker/db/pg-array-patch'
import { PgArray } from 'drizzle-orm/pg-core/columns/common'

describe('pg-array-patch', () => {
  // Access the patched method directly on the prototype
  const mapFromDriverValue = PgArray.prototype.mapFromDriverValue

  // Create a mock "this" context with a baseColumn that has mapFromDriverValue
  function createMockContext() {
    return {
      baseColumn: {
        mapFromDriverValue: (v: unknown) => v,
      },
    }
  }

  describe('null/undefined handling', () => {
    it('returns empty array for null', () => {
      // Bun SQL returns null for NULL array columns — patch handles this
      const result = mapFromDriverValue.call(createMockContext(), null as unknown as string)
      expect(result).toEqual([])
    })

    it('returns empty array for undefined', () => {
      const result = mapFromDriverValue.call(createMockContext(), undefined as unknown as string)
      expect(result).toEqual([])
    })
  })

  describe('native JS array handling (Bun SQL)', () => {
    it('handles regular JS arrays', () => {
      const result = mapFromDriverValue.call(createMockContext(), [1, 2, 3])
      expect(result).toEqual([1, 2, 3])
    })

    it('handles empty JS arrays', () => {
      const result = mapFromDriverValue.call(createMockContext(), [])
      expect(result).toEqual([])
    })

    it('handles Int32Array (Bun SQL integer[])', () => {
      const typedArray = new Int32Array([10, 20, 30])
      // Bun SQL returns typed arrays at runtime; the patch handles them
      const result = mapFromDriverValue.call(createMockContext(), typedArray as unknown as string)
      expect(result).toEqual([10, 20, 30])
    })

    it('handles Float64Array (Bun SQL numeric[])', () => {
      const typedArray = new Float64Array([1.5, 2.5, 3.5])
      const result = mapFromDriverValue.call(createMockContext(), typedArray as unknown as string)
      expect(result).toEqual([1.5, 2.5, 3.5])
    })

    it('handles Uint8Array', () => {
      const typedArray = new Uint8Array([255, 128, 0])
      const result = mapFromDriverValue.call(createMockContext(), typedArray as unknown as string)
      expect(result).toEqual([255, 128, 0])
    })

    it('handles Int16Array', () => {
      const typedArray = new Int16Array([100, -200, 300])
      const result = mapFromDriverValue.call(createMockContext(), typedArray as unknown as string)
      expect(result).toEqual([100, -200, 300])
    })
  })

  describe('base column mapping', () => {
    it('applies baseColumn.mapFromDriverValue to each element', () => {
      const ctx = {
        baseColumn: {
          mapFromDriverValue: (v: unknown) => Number(v) * 2,
        },
      }
      const result = mapFromDriverValue.call(ctx, [1, 2, 3])
      expect(result).toEqual([2, 4, 6])
    })

    it('handles missing baseColumn gracefully', () => {
      const ctx = { baseColumn: undefined }
      const result = mapFromDriverValue.call(ctx, [1, 2, 3])
      expect(result).toEqual([1, 2, 3])
    })

    it('handles baseColumn without mapFromDriverValue', () => {
      const ctx = { baseColumn: {} }
      const result = mapFromDriverValue.call(ctx, [1, 2, 3])
      expect(result).toEqual([1, 2, 3])
    })
  })

  describe('string fallback (pg-node wire format)', () => {
    it('delegates to original for string values', () => {
      // The original PgArray.mapFromDriverValue handles "{1,2,3}" format
      const ctx = createMockContext()
      const result = mapFromDriverValue.call(ctx, '{1,2,3}')
      // The original parser should handle this — it returns string elements
      expect(Array.isArray(result)).toBe(true)
    })

    it('handles empty PostgreSQL array string "{}"', () => {
      const ctx = createMockContext()
      const result = mapFromDriverValue.call(ctx, '{}')
      expect(result).toEqual([])
    })
  })
})
