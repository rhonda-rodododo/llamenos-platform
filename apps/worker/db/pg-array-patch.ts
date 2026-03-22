/**
 * Bun SQL compatibility patch for Drizzle's PgArray column.
 *
 * Drizzle's PgArray.mapFromDriverValue assumes the value is always a string
 * or already-parsed array. However, Bun's native SQL driver returns `null`
 * (or in some edge cases `undefined`) for NULL array column values instead of
 * the empty array string "{}". This causes a TypeError crash that corrupts
 * the entire Bun SQL connection pool, making the server unresponsive.
 *
 * The patch guards the value before calling `.map()` — returning `[]` for
 * null/undefined so the connection pool stays healthy.
 *
 * This must be imported before any schema is accessed.
 */
import { PgArray } from 'drizzle-orm/pg-core/columns/common'

const original = PgArray.prototype.mapFromDriverValue as (value: unknown) => unknown[]

PgArray.prototype.mapFromDriverValue = function (value: unknown): unknown[] {
  if (value == null) return []
  return original.call(this, value)
}
