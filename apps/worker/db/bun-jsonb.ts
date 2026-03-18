/**
 * Custom jsonb column type for Bun SQL compatibility.
 *
 * Drizzle's built-in jsonb() calls JSON.stringify() in mapToDriverValue,
 * which was designed for node-postgres (pg). Bun's native SQL driver
 * natively serializes objects for JSONB params, so drizzle's stringify
 * causes double-serialization: objects are stored as JSONB strings
 * instead of JSONB objects.
 *
 * This custom column type passes objects through to the driver as-is,
 * letting Bun SQL handle serialization correctly.
 *
 * Usage: Replace `import { jsonb } from 'drizzle-orm/pg-core'` with
 *        `import { jsonb } from '../bun-jsonb'` in all schema files.
 */
import { customType } from 'drizzle-orm/pg-core'

/**
 * JSONB column that works correctly with Bun SQL.
 * Passes values through without JSON.stringify — Bun SQL handles serialization.
 */
export function jsonb<TName extends string>(name: TName) {
  return customType<{ data: unknown; driverData: unknown }>({
    dataType() {
      return 'jsonb'
    },
    // No toDriver — pass the value as-is to Bun SQL
    // Bun SQL natively handles object → JSONB serialization
    fromDriver(value: unknown): unknown {
      return value
    },
  })(name)
}
