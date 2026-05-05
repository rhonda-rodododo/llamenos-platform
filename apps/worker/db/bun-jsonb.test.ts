/**
 * Unit tests for the custom bun-jsonb column type.
 *
 * Critical behavior: the custom type MUST NOT call JSON.stringify on values.
 * Bun SQL natively serializes objects for JSONB — double-serialization stores
 * a JSON string instead of a JSONB object, silently corrupting data.
 */
import { describe, it, expect } from 'vitest'
import { pgTable } from 'drizzle-orm/pg-core'
import { jsonb } from './bun-jsonb'

// Build a real table to get built columns (builders don't expose mapFromDriverValue)
const testTable = pgTable('test', {
  data: jsonb('data'),
  nested: jsonb('nested'),
})

describe('jsonb custom column type', () => {
  describe('dataType', () => {
    it('reports sql type as "jsonb"', () => {
      expect(testTable.data.getSQLType()).toBe('jsonb')
    })

    it('each column instance reports "jsonb"', () => {
      expect(testTable.nested.getSQLType()).toBe('jsonb')
    })

    it('jsonb columns in different tables both report "jsonb"', () => {
      const t2 = pgTable('t2', { payload: jsonb('payload') })
      expect(t2.payload.getSQLType()).toBe('jsonb')
    })
  })

  describe('mapFromDriverValue — no-op passthrough', () => {
    it('returns plain objects as-is', () => {
      const obj = { id: 1, name: 'test' }
      expect(testTable.data.mapFromDriverValue(obj)).toBe(obj)
    })

    it('returns arrays as-is', () => {
      const arr = [1, 2, 3]
      expect(testTable.data.mapFromDriverValue(arr)).toBe(arr)
    })

    it('returns null as null', () => {
      expect(testTable.data.mapFromDriverValue(null)).toBeNull()
    })

    it('returns undefined as undefined', () => {
      expect(testTable.data.mapFromDriverValue(undefined)).toBeUndefined()
    })

    it('returns strings as-is (e.g. for legacy pre-parsed data)', () => {
      expect(testTable.data.mapFromDriverValue('hello')).toBe('hello')
    })

    it('returns numbers as-is', () => {
      expect(testTable.data.mapFromDriverValue(42)).toBe(42)
    })

    it('returns booleans as-is', () => {
      expect(testTable.data.mapFromDriverValue(true)).toBe(true)
      expect(testTable.data.mapFromDriverValue(false)).toBe(false)
    })

    it('returns deeply nested objects as-is', () => {
      const nested = { a: { b: { c: [1, 2, { d: 'e' }] } } }
      expect(testTable.data.mapFromDriverValue(nested)).toBe(nested)
    })

    it('returns object identity (no copy or transformation)', () => {
      const obj = { payload: 'value' }
      const result = testTable.data.mapFromDriverValue(obj)
      expect(result).toBe(obj) // Same reference, not a copy
    })
  })

  describe('no double-serialization (critical)', () => {
    it('mapFromDriverValue does NOT JSON.stringify objects', () => {
      const obj = { payload: 'value' }
      const result = testTable.data.mapFromDriverValue(obj)
      // Must NOT be a string — would be if JSON.stringify was called
      expect(typeof result).not.toBe('string')
      expect(result).toBe(obj)
    })

    it('mapFromDriverValue does NOT JSON.stringify arrays', () => {
      const arr = [{ x: 1 }, { x: 2 }]
      const result = testTable.data.mapFromDriverValue(arr)
      expect(typeof result).not.toBe('string')
      expect(result).toBe(arr)
    })

    it('mapToDriverValue is absent or returns value unchanged (no stringify)', () => {
      // Drizzle's customType only defines a toDriver if explicitly provided.
      // This column intentionally omits toDriver so Bun SQL gets raw objects.
      const obj = { key: 'value' }
      const driverVal = testTable.data.mapToDriverValue?.(obj)
      // If mapToDriverValue exists it must NOT return a string
      if (driverVal !== undefined) {
        expect(typeof driverVal).not.toBe('string')
        expect(driverVal).toEqual(obj)
      }
    })
  })

  describe('multiple column instances are independent', () => {
    it('two jsonb columns with different names work independently', () => {
      const t = pgTable('multi', {
        field_a: jsonb('field_a'),
        field_b: jsonb('field_b'),
      })
      expect(t.field_a.getSQLType()).toBe('jsonb')
      expect(t.field_b.getSQLType()).toBe('jsonb')
      const obj1 = { a: 1 }
      const obj2 = { b: 2 }
      expect(t.field_a.mapFromDriverValue(obj1)).toBe(obj1)
      expect(t.field_b.mapFromDriverValue(obj2)).toBe(obj2)
    })
  })
})
