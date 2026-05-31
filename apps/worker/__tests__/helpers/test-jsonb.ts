/**
 * Test-environment JSONB column type for postgres.js / drizzle-orm/postgres-js.
 *
 * In production, apps/worker/db/bun-jsonb.ts uses a customType with NO
 * toDriver function. This works because Bun SQL's unsafe() automatically
 * calls JSON.stringify on objects for JSONB parameters. Passing a pre-
 * stringified value causes Bun SQL to double-encode (JSONB string ✗).
 *
 * drizzle-orm/postgres-js installs a transparent serializer for JSONB
 * (OID 3802), bypassing postgres.js's default type handling. Drizzle
 * therefore relies on mapToDriverValue to serialize JSONB parameters.
 * Without a toDriver function, the raw object reaches postgres.js's byte
 * encoder which rejects non-string values (TypeError).
 *
 * This file is aliased over bun-jsonb.ts in vitest.integration.config.ts
 * for integration tests. It adds toDriver: JSON.stringify so raw objects
 * are serialized to JSON strings before postgres.js encodes them as TEXT.
 * PostgreSQL then casts TEXT → JSONB (parses the JSON) → stores as object.
 *
 * fromDriver returns the value as-is because drizzle/postgres-js returns
 * JSONB columns as already-parsed JavaScript objects.
 */
import { customType } from 'drizzle-orm/pg-core'

export function jsonb<TName extends string>(name: TName) {
  return customType<{ data: unknown; driverData: unknown }>({
    dataType() {
      return 'jsonb'
    },
    toDriver(value: unknown): unknown {
      return typeof value === 'string' ? value : JSON.stringify(value)
    },
    fromDriver(value: unknown): unknown {
      return value
    },
  })(name)
}
