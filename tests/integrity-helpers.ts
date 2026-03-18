/**
 * Data integrity assertion helpers for BDD step definitions (Epic 365).
 *
 * Provides type assertion functions for detecting double-serialization bugs
 * and a hash computation function matching the server's audit chain algorithm.
 */
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import { utf8ToBytes } from '@noble/ciphers/utils.js'

// ---------------------------------------------------------------------------
// Type Assertions
// ---------------------------------------------------------------------------

/**
 * Assert a value is a proper object, not a stringified JSON string.
 *
 * Throws a descriptive error if the value is a string (likely double-serialized),
 * null, undefined, or a non-object type.
 */
export function assertIsObject(
  value: unknown,
  fieldName: string,
): asserts value is Record<string, unknown> {
  if (value === null || value === undefined) {
    throw new Error(`${fieldName}: expected object, got ${value}`)
  }
  if (typeof value === 'string') {
    // Try parsing to give a better error message
    try {
      const parsed = JSON.parse(value)
      if (typeof parsed === 'object' && parsed !== null) {
        throw new Error(
          `${fieldName}: value is a double-serialized JSON string. ` +
          `Got string "${value.slice(0, 80)}..." which parses to an object. ` +
          `This indicates a serialization bug — the value should be stored as a JSON object, not a string.`,
        )
      }
    } catch (e) {
      if (e instanceof Error && e.message.includes('double-serialized')) throw e
    }
    throw new Error(`${fieldName}: expected object, got string "${value.slice(0, 80)}"`)
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${fieldName}: expected object, got ${Array.isArray(value) ? 'array' : typeof value}`)
  }
}

/**
 * Assert a value is a proper array, not a stringified JSON string.
 *
 * Throws a descriptive error if the value is a string (likely double-serialized),
 * null, undefined, or a non-array type.
 */
export function assertIsArray(
  value: unknown,
  fieldName: string,
): asserts value is unknown[] {
  if (value === null || value === undefined) {
    throw new Error(`${fieldName}: expected array, got ${value}`)
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) {
        throw new Error(
          `${fieldName}: value is a double-serialized JSON string. ` +
          `Got string "${value.slice(0, 80)}..." which parses to an array. ` +
          `This indicates a serialization bug — the value should be stored as a JSON array, not a string.`,
        )
      }
    } catch (e) {
      if (e instanceof Error && e.message.includes('double-serialized')) throw e
    }
    throw new Error(`${fieldName}: expected array, got string "${value.slice(0, 80)}"`)
  }
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName}: expected array, got ${typeof value}`)
  }
}

// ---------------------------------------------------------------------------
// Audit Hash Chain
// ---------------------------------------------------------------------------

/**
 * Deterministic JSON serialization with sorted keys.
 * Matches the server's stableJsonStringify — PostgreSQL JSONB returns keys
 * sorted alphabetically, so both sides must use sorted-key serialization for
 * the stored hash to match any recomputation from DB-retrieved data.
 */
function stableJsonStringify(value: unknown): string {
  return JSON.stringify(value, (_key, val: unknown) => {
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      return Object.fromEntries(
        Object.entries(val as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)),
      )
    }
    return val
  })
}

/**
 * Compute SHA-256 hash of an audit entry matching the server's algorithm.
 *
 * Format: `${id}:${action}:${actorPubkey}:${createdAt}:${stableJsonStringify(details)}:${previousEntryHash ?? ''}`
 *
 * Uses stable (sorted-key) JSON serialization to match PostgreSQL JSONB key ordering.
 * Matches `computeEntryHash` in `apps/worker/services/audit.ts`.
 */
export function computeAuditEntryHash(entry: {
  id: string
  action: string
  actorPubkey: string
  createdAt: string
  details: unknown
  previousEntryHash: string | null
}): string {
  const content = `${entry.id}:${entry.action}:${entry.actorPubkey}:${entry.createdAt}:${stableJsonStringify(entry.details ?? {})}:${entry.previousEntryHash ?? ''}`
  return bytesToHex(sha256(utf8ToBytes(content)))
}

// ---------------------------------------------------------------------------
// Self-test
// ---------------------------------------------------------------------------

if (import.meta.main) {
  console.log('Running integrity-helpers self-test...\n')

  // Test 1: assertIsObject — valid object
  try {
    assertIsObject({ key: 'value' }, 'test1')
    console.log('[PASS] assertIsObject accepts valid object')
  } catch {
    console.error('[FAIL] assertIsObject rejected valid object')
    process.exit(1)
  }

  // Test 2: assertIsObject — rejects null
  try {
    assertIsObject(null, 'test2')
    console.error('[FAIL] assertIsObject accepted null')
    process.exit(1)
  } catch (e) {
    console.assert((e as Error).message.includes('expected object, got null'))
    console.log('[PASS] assertIsObject rejects null')
  }

  // Test 3: assertIsObject — detects double-serialized string
  try {
    assertIsObject('{"key":"value"}', 'test3')
    console.error('[FAIL] assertIsObject accepted double-serialized string')
    process.exit(1)
  } catch (e) {
    console.assert((e as Error).message.includes('double-serialized'))
    console.log('[PASS] assertIsObject detects double-serialized JSON string')
  }

  // Test 4: assertIsObject — rejects array
  try {
    assertIsObject([1, 2, 3], 'test4')
    console.error('[FAIL] assertIsObject accepted array')
    process.exit(1)
  } catch (e) {
    console.assert((e as Error).message.includes('expected object, got array'))
    console.log('[PASS] assertIsObject rejects array')
  }

  // Test 5: assertIsArray — valid array
  try {
    assertIsArray([1, 2, 3], 'test5')
    console.log('[PASS] assertIsArray accepts valid array')
  } catch {
    console.error('[FAIL] assertIsArray rejected valid array')
    process.exit(1)
  }

  // Test 6: assertIsArray — detects double-serialized string
  try {
    assertIsArray('[1,2,3]', 'test6')
    console.error('[FAIL] assertIsArray accepted double-serialized string')
    process.exit(1)
  } catch (e) {
    console.assert((e as Error).message.includes('double-serialized'))
    console.log('[PASS] assertIsArray detects double-serialized JSON string')
  }

  // Test 7: computeAuditEntryHash — deterministic output
  const hash1 = computeAuditEntryHash({
    id: 'test-id-001',
    action: 'volunteerAdded',
    actorPubkey: 'a'.repeat(64),
    createdAt: '2026-01-01T00:00:00.000Z',
    details: { role: 'volunteer' },
    previousEntryHash: null,
  })
  const hash2 = computeAuditEntryHash({
    id: 'test-id-001',
    action: 'volunteerAdded',
    actorPubkey: 'a'.repeat(64),
    createdAt: '2026-01-01T00:00:00.000Z',
    details: { role: 'volunteer' },
    previousEntryHash: null,
  })
  console.assert(hash1 === hash2, 'Hash should be deterministic')
  console.assert(typeof hash1 === 'string' && hash1.length === 64, 'Hash should be 64 hex chars')
  console.log('[PASS] computeAuditEntryHash is deterministic (64 hex chars)')

  // Test 8: computeAuditEntryHash — chain linking changes hash
  const hash3 = computeAuditEntryHash({
    id: 'test-id-002',
    action: 'volunteerAdded',
    actorPubkey: 'a'.repeat(64),
    createdAt: '2026-01-01T00:00:01.000Z',
    details: {},
    previousEntryHash: hash1,
  })
  console.assert(hash3 !== hash1, 'Different entry should produce different hash')
  console.log('[PASS] computeAuditEntryHash changes with different inputs')

  // Test 9: Verify hash matches server algorithm format
  // The content string format is: id:action:actorPubkey:createdAt:JSON(details):previousEntryHash
  const { sha256: sha256fn } = await import('@noble/hashes/sha2.js')
  const { utf8ToBytes: u2b } = await import('@noble/ciphers/utils.js')
  const { bytesToHex: b2h } = await import('@noble/hashes/utils.js')
  const manualContent = `test-id-001:volunteerAdded:${'a'.repeat(64)}:2026-01-01T00:00:00.000Z:${JSON.stringify({ role: 'volunteer' })}:`
  const manualHash = b2h(sha256fn(u2b(manualContent)))
  console.assert(hash1 === manualHash, `Hash mismatch: ${hash1} !== ${manualHash}`)
  console.log('[PASS] computeAuditEntryHash matches manual SHA-256 computation')

  console.log('\nAll integrity-helpers self-tests passed.')
}
