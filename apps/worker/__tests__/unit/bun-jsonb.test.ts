import { describe, it, expect } from 'vitest'
import { jsonb } from '../../db/bun-jsonb'
import { jsonb as drizzleJsonb, pgTable } from 'drizzle-orm/pg-core'

// Build columns in a table context to access mapToDriverValue/mapFromDriverValue
const testTable = pgTable('test_table', {
  custom: jsonb('custom'),
  builtin: drizzleJsonb('builtin'),
})

const customCol = testTable.custom
const builtinCol = testTable.builtin

describe('bun-jsonb custom column type', () => {
  describe('mapToDriverValue — does NOT JSON.stringify (prevents double-serialization)', () => {
    it('passes objects through as-is (not stringified)', () => {
      const obj = { key: 'value', nested: { a: 1 } }
      const result = customCol.mapToDriverValue(obj)
      expect(result).toEqual(obj)
      expect(typeof result).toBe('object')
    })

    it('passes arrays through as-is', () => {
      const arr = [1, 'two', { three: 3 }]
      const result = customCol.mapToDriverValue(arr)
      expect(result).toEqual(arr)
      expect(Array.isArray(result)).toBe(true)
    })

    it('passes null through', () => {
      expect(customCol.mapToDriverValue(null)).toBeNull()
    })

    it('passes nested objects through without transformation', () => {
      const nested = { a: { b: { c: { d: [1, 2, 3] } } } }
      expect(customCol.mapToDriverValue(nested)).toEqual(nested)
    })

    it('differs from builtin jsonb which DOES JSON.stringify (proving the bug it fixes)', () => {
      const obj = { key: 'value' }
      const customResult = customCol.mapToDriverValue(obj)
      const builtinResult = builtinCol.mapToDriverValue(obj)

      // Custom: object passes through → Bun SQL serializes natively → stored as JSONB object
      expect(typeof customResult).toBe('object')
      // Builtin: JSON.stringify called → Bun SQL serializes the STRING → stored as JSONB string
      expect(typeof builtinResult).toBe('string')
      expect(builtinResult).toBe('{"key":"value"}')
    })
  })

  describe('mapFromDriverValue — passes values through as-is', () => {
    it('passes objects through', () => {
      const obj = { key: 'value', nested: [1, 2, 3] }
      expect(customCol.mapFromDriverValue(obj)).toEqual(obj)
    })

    it('passes null through', () => {
      expect(customCol.mapFromDriverValue(null)).toBeNull()
    })

    it('passes arrays through', () => {
      const arr = [1, 'two', { three: 3 }]
      expect(customCol.mapFromDriverValue(arr)).toEqual(arr)
    })

    it('passes nested objects through', () => {
      const nested = { a: { b: { c: { d: [1, 2, 3] } } } }
      expect(customCol.mapFromDriverValue(nested)).toEqual(nested)
    })

    it('passes primitive values through', () => {
      expect(customCol.mapFromDriverValue(42)).toBe(42)
      expect(customCol.mapFromDriverValue('hello')).toBe('hello')
      expect(customCol.mapFromDriverValue(true)).toBe(true)
    })
  })

  describe('round-trip behavior', () => {
    it('object round-trips correctly (toDriver → fromDriver = identity)', () => {
      const original = { name: 'test', tags: ['a', 'b'], meta: { x: 1 } }
      const afterDriver = customCol.mapToDriverValue(original)
      const afterRead = customCol.mapFromDriverValue(afterDriver)
      expect(afterRead).toEqual(original)
    })

    it('null round-trips correctly', () => {
      const afterDriver = customCol.mapToDriverValue(null)
      expect(customCol.mapFromDriverValue(afterDriver)).toBeNull()
    })

    it('complex nested structure round-trips', () => {
      const complex = {
        users: [{ id: 1, roles: ['admin'] }],
        config: { nested: { deep: true } },
        empty: {},
        nullField: null,
      }
      const afterDriver = customCol.mapToDriverValue(complex)
      expect(customCol.mapFromDriverValue(afterDriver)).toEqual(complex)
    })
  })
})
