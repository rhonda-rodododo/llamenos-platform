/**
 * Bun SQL compatibility patch for Drizzle's PgArray column.
 *
 * Drizzle's PgArray.mapFromDriverValue assumes the value is always a string
 * (PostgreSQL wire format like "{1,2,3}"). However, Bun's native SQL driver:
 *
 * 1. Returns native JS arrays OR typed arrays (Int32Array, Float64Array, etc.)
 *    for array columns (not the string form), causing Drizzle's parsePgArray
 *    to iterate the value as if it were a string, which corrupts the result
 *    (e.g., `days` comes back as `{"0":1,"1":2}` object or garbled strings).
 *
 * 2. Returns `null` (or `undefined`) for NULL array column values instead of
 *    the empty string "{}". Calling parsePgArray(null) throws a TypeError that
 *    corrupts the entire Bun SQL connection pool.
 *
 * This patch intercepts mapFromDriverValue and:
 *   - Returns `[]` for null/undefined (preserves original null-guard fix)
 *   - When value is a JS array or typed array (Int32Array, etc.), converts to
 *     a regular Array and maps each element through the base column's
 *     mapFromDriverValue instead of trying to parse it as a string
 *   - Falls through to original behaviour for string values (pg-node driver
 *     compatibility)
 *
 * This must be imported before any schema is accessed.
 */
import { PgArray } from 'drizzle-orm/pg-core/columns/common'

const original = PgArray.prototype.mapFromDriverValue as (value: unknown) => unknown[]

PgArray.prototype.mapFromDriverValue = function (value: unknown): unknown[] {
  if (value == null) return []
  // Bun SQL returns native JS arrays or typed arrays (Int32Array for integer[],
  // Float64Array for numeric[], etc.). Convert to a regular Array and map each
  // element through the base column type's deserializer.
  if (Array.isArray(value) || ArrayBuffer.isView(value)) {
    const arr = Array.from(value as Iterable<unknown>)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- accessing Drizzle internals
    const baseColumn = (this as any).baseColumn
    if (baseColumn && typeof baseColumn.mapFromDriverValue === 'function') {
      return arr.map((v: unknown) => baseColumn.mapFromDriverValue(v))
    }
    return arr
  }
  return original.call(this, value)
}
