/**
 * Bun SQL compatibility patch for Drizzle's PgArray column.
 *
 * Drizzle's PgArray.mapFromDriverValue assumes the value is always a string
 * (PostgreSQL wire format like "{1,2,3}"). However, Bun's native SQL driver:
 *
 * 1. Returns native JS arrays for array columns (not the string form), causing
 *    Drizzle's parsePgArray to iterate the array as if it were a string, which
 *    corrupts the result (e.g., `days` comes back as `["1","2"]` of strings or
 *    worse, a garbled single-element array from index access on the array object).
 *
 * 2. Returns `null` (or `undefined`) for NULL array column values instead of
 *    the empty string "{}". Calling parsePgArray(null) throws a TypeError that
 *    corrupts the entire Bun SQL connection pool.
 *
 * This patch intercepts mapFromDriverValue and:
 *   - Returns `[]` for null/undefined (preserves original null-guard fix)
 *   - When value is already a JS array, maps each element through the base
 *     column's mapFromDriverValue instead of trying to parse it as a string
 *   - Falls through to original behaviour for string values (pg-node driver
 *     compatibility)
 *
 * This must be imported before any schema is accessed.
 */
import { PgArray } from 'drizzle-orm/pg-core/columns/common'

const original = PgArray.prototype.mapFromDriverValue as (value: unknown) => unknown[]

PgArray.prototype.mapFromDriverValue = function (value: unknown): unknown[] {
  if (value == null) return []
  // Bun SQL returns native JS arrays — map each element through the base column
  // type's deserializer (e.g., integer coercion) instead of trying to parse the
  // array as a PostgreSQL wire-format string.
  if (Array.isArray(value)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- accessing Drizzle internals
    const baseColumn = (this as any).baseColumn
    if (baseColumn && typeof baseColumn.mapFromDriverValue === 'function') {
      return value.map((v: unknown) => baseColumn.mapFromDriverValue(v))
    }
    return value
  }
  return original.call(this, value)
}
