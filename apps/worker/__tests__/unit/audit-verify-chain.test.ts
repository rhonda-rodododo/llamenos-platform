import { describe, it, expect, vi } from 'vitest'
import { AuditService } from '@worker/services/audit'
import { hashAuditEntry } from '@worker/lib/crypto'
import { createMockDb } from './mock-db'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a mock db for AuditService.verifyChain().
 *
 * verifyChain() issues multiple selects:
 *  1. count query → [{ total: N }]
 *  2. (if offset > 0) predecessor query → [{ entryHash: '...' }]
 *  3. entries query → rows[]
 *
 * We use $setSelectResults to queue them in order.
 */
function setupVerifyDb() {
  const { db } = createMockDb(['auditLog'])
  return { db }
}

/** Build an audit entry with a valid hash, optionally chained to a previous hash. */
function makeChainEntry(
  id: string,
  action: string,
  createdAt: string,
  previousEntryHash: string | null,
  details: Record<string, unknown> = {},
) {
  const entryHash = hashAuditEntry({
    id,
    action,
    actorPubkey: 'a'.repeat(64),
    createdAt,
    details,
    previousEntryHash: previousEntryHash ?? undefined,
  })
  return {
    id,
    hubId: 'hub-1',
    action,
    actorPubkey: 'a'.repeat(64),
    createdAt: new Date(createdAt),
    details,
    previousEntryHash,
    entryHash,
  }
}

/** Build a valid 3-entry chain. */
function buildValidChain() {
  const e1 = makeChainEntry('e1', 'login', '2026-01-01T00:00:00.000Z', null)
  const e2 = makeChainEntry('e2', 'noteCreated', '2026-01-01T00:01:00.000Z', e1.entryHash, { note: 'test' })
  const e3 = makeChainEntry('e3', 'logout', '2026-01-01T00:02:00.000Z', e2.entryHash)
  return [e1, e2, e3]
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AuditService.verifyChain', () => {
  it('returns valid for an empty chain', async () => {
    const { db } = setupVerifyDb()
    const service = new AuditService(db as any)

    // count returns 0
    db.$setSelectResults([[{ total: 0 }]])

    const result = await service.verifyChain('hub-1')
    expect(result).toEqual({ valid: true, totalEntries: 0, checkedEntries: 0 })
  })

  it('returns valid for a correct single-entry chain', async () => {
    const { db } = setupVerifyDb()
    const service = new AuditService(db as any)

    const [e1] = buildValidChain()
    // 1. count query, 2. entries query
    db.$setSelectResults([[{ total: 1 }], [e1]])

    const result = await service.verifyChain('hub-1')
    expect(result).toEqual({ valid: true, totalEntries: 1, checkedEntries: 1 })
  })

  it('returns valid for a correct 3-entry chain', async () => {
    const { db } = setupVerifyDb()
    const service = new AuditService(db as any)

    const chain = buildValidChain()
    db.$setSelectResults([[{ total: 3 }], chain])

    const result = await service.verifyChain('hub-1')
    expect(result).toEqual({ valid: true, totalEntries: 3, checkedEntries: 3 })
  })

  it('detects a tampered entryHash', async () => {
    const { db } = setupVerifyDb()
    const service = new AuditService(db as any)

    const chain = buildValidChain()
    // Tamper with e2's stored entryHash
    chain[1] = { ...chain[1], entryHash: 'tampered'.padEnd(64, '0') }
    // Fix e3's previousEntryHash to still point to the tampered hash
    // so that the linkage check passes but the hash check fails on e2
    chain[2] = { ...chain[2], previousEntryHash: chain[1].entryHash }

    db.$setSelectResults([[{ total: 3 }], chain])

    const result = await service.verifyChain('hub-1')
    expect(result.valid).toBe(false)
    expect(result.checkedEntries).toBe(1) // failed at index 1 (e2)
    expect(result.firstBrokenEntry).toBeDefined()
    expect(result.firstBrokenEntry!.id).toBe('e2')
    expect(result.firstBrokenEntry!.seqIndex).toBe(1)
    expect(result.firstBrokenEntry!.reason).toBe('entryHash mismatch')
  })

  it('detects a broken previousEntryHash linkage', async () => {
    const { db } = setupVerifyDb()
    const service = new AuditService(db as any)

    const chain = buildValidChain()
    // Break e2's previousEntryHash — point it to wrong hash
    const brokenE2 = makeChainEntry(
      'e2', 'noteCreated', '2026-01-01T00:01:00.000Z',
      'wrong-previous-hash'.padEnd(64, '0'),
      { note: 'test' },
    )
    chain[1] = brokenE2

    db.$setSelectResults([[{ total: 3 }], chain])

    const result = await service.verifyChain('hub-1')
    expect(result.valid).toBe(false)
    expect(result.firstBrokenEntry).toBeDefined()
    expect(result.firstBrokenEntry!.id).toBe('e2')
    expect(result.firstBrokenEntry!.seqIndex).toBe(1)
    expect(result.firstBrokenEntry!.reason).toBe('previousEntryHash mismatch')
  })

  it('detects when first entry has a non-null previousEntryHash', async () => {
    const { db } = setupVerifyDb()
    const service = new AuditService(db as any)

    // First entry with a previousEntryHash (should be null)
    const badFirst = makeChainEntry('e1', 'login', '2026-01-01T00:00:00.000Z', 'should-be-null')
    db.$setSelectResults([[{ total: 1 }], [badFirst]])

    const result = await service.verifyChain('hub-1')
    expect(result.valid).toBe(false)
    expect(result.firstBrokenEntry!.id).toBe('e1')
    expect(result.firstBrokenEntry!.seqIndex).toBe(0)
    expect(result.firstBrokenEntry!.reason).toBe('previousEntryHash mismatch')
  })

  it('supports limit parameter for batch verification', async () => {
    const { db } = setupVerifyDb()
    const service = new AuditService(db as any)

    const chain = buildValidChain()
    // Only verify first 2 entries
    db.$setSelectResults([[{ total: 3 }], [chain[0], chain[1]]])

    const result = await service.verifyChain('hub-1', { limit: 2 })
    expect(result).toEqual({ valid: true, totalEntries: 3, checkedEntries: 2 })
  })

  it('supports offset parameter with predecessor lookup', async () => {
    const { db } = setupVerifyDb()
    const service = new AuditService(db as any)

    const chain = buildValidChain()
    // With offset=1: count, predecessor (e1), entries (e2, e3)
    db.$setSelectResults([
      [{ total: 3 }],
      [{ entryHash: chain[0].entryHash }],
      [chain[1], chain[2]],
    ])

    const result = await service.verifyChain('hub-1', { offset: 1 })
    expect(result).toEqual({ valid: true, totalEntries: 3, checkedEntries: 2 })
  })
})
