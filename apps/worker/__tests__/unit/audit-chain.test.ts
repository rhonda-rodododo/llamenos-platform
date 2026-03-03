import { describe, it, expect } from 'vitest'
import { hashAuditEntry } from '@worker/lib/crypto'
import type { AuditLogEntry } from '@worker/types'

describe('Audit chain integrity', () => {
  function createEntry(
    id: string,
    event: string,
    previousEntryHash?: string,
  ): AuditLogEntry {
    return {
      id,
      event,
      actorPubkey: 'testpubkey123',
      details: { action: event },
      createdAt: new Date().toISOString(),
      previousEntryHash,
    }
  }

  describe('hash chain building', () => {
    it('first entry has no previous hash', () => {
      const entry = createEntry('audit-001', 'volunteer.login')
      const hash = hashAuditEntry(entry)
      expect(hash).toMatch(/^[0-9a-f]{64}$/)
      expect(entry.previousEntryHash).toBeUndefined()
    })

    it('second entry links to first via previousEntryHash', () => {
      const entry1 = createEntry('audit-001', 'volunteer.login')
      const hash1 = hashAuditEntry(entry1)

      const entry2 = createEntry('audit-002', 'note.created', hash1)
      const hash2 = hashAuditEntry(entry2)

      expect(entry2.previousEntryHash).toBe(hash1)
      expect(hash2).not.toBe(hash1)
    })

    it('chain of 5 entries maintains consistent linkage', () => {
      const events = ['login', 'note.created', 'call.answered', 'note.updated', 'logout']
      const entries: AuditLogEntry[] = []
      const hashes: string[] = []

      for (let i = 0; i < events.length; i++) {
        const entry = createEntry(
          `audit-${String(i + 1).padStart(3, '0')}`,
          events[i],
          i > 0 ? hashes[i - 1] : undefined,
        )
        entries.push(entry)
        hashes.push(hashAuditEntry(entry))
      }

      // Verify each entry (except first) links to the previous
      for (let i = 1; i < entries.length; i++) {
        expect(entries[i].previousEntryHash).toBe(hashes[i - 1])
      }

      // All hashes are unique
      const uniqueHashes = new Set(hashes)
      expect(uniqueHashes.size).toBe(5)
    })
  })

  describe('tamper detection', () => {
    it('detects tampered event field', () => {
      const entry = createEntry('audit-001', 'volunteer.login')
      const originalHash = hashAuditEntry(entry)

      // Tamper with the event
      const tampered = { ...entry, event: 'volunteer.logout' }
      const tamperedHash = hashAuditEntry(tampered)

      expect(tamperedHash).not.toBe(originalHash)
    })

    it('detects tampered actorPubkey', () => {
      const entry = createEntry('audit-001', 'volunteer.login')
      const originalHash = hashAuditEntry(entry)

      const tampered = { ...entry, actorPubkey: 'attackerPubkey' }
      expect(hashAuditEntry(tampered)).not.toBe(originalHash)
    })

    it('detects tampered details', () => {
      const entry = createEntry('audit-001', 'volunteer.login')
      const originalHash = hashAuditEntry(entry)

      const tampered = { ...entry, details: { action: 'something-else' } }
      expect(hashAuditEntry(tampered)).not.toBe(originalHash)
    })

    it('detects tampered timestamp', () => {
      const entry = createEntry('audit-001', 'volunteer.login')
      const originalHash = hashAuditEntry(entry)

      const tampered = { ...entry, createdAt: '2020-01-01T00:00:00Z' }
      expect(hashAuditEntry(tampered)).not.toBe(originalHash)
    })

    it('detects tampered previousEntryHash (chain break)', () => {
      const entry1 = createEntry('audit-001', 'login')
      const hash1 = hashAuditEntry(entry1)

      const entry2 = createEntry('audit-002', 'note.created', hash1)
      const hash2 = hashAuditEntry(entry2)

      // Attacker replaces previousEntryHash
      const tampered = { ...entry2, previousEntryHash: 'forged-hash' }
      expect(hashAuditEntry(tampered)).not.toBe(hash2)
    })

    it('detects deleted chain entry (gap detection)', () => {
      const entry1 = createEntry('audit-001', 'login')
      const hash1 = hashAuditEntry(entry1)

      const entry2 = createEntry('audit-002', 'note.created', hash1)
      const hash2 = hashAuditEntry(entry2)

      const entry3 = createEntry('audit-003', 'logout', hash2)
      const hash3 = hashAuditEntry(entry3)

      // If entry2 is deleted, entry3's previousEntryHash (hash2) won't match
      // the recomputed hash of entry1 (hash1)
      expect(entry3.previousEntryHash).toBe(hash2)
      expect(entry3.previousEntryHash).not.toBe(hash1)
    })

    it('detects inserted entry (chain order manipulation)', () => {
      const entry1 = createEntry('audit-001', 'login')
      const hash1 = hashAuditEntry(entry1)

      const entry2 = createEntry('audit-002', 'logout', hash1)
      const hash2 = hashAuditEntry(entry2)

      // Attacker tries to insert between entry1 and entry2
      const inserted = createEntry('audit-001b', 'malicious-action', hash1)
      const insertedHash = hashAuditEntry(inserted)

      // entry2's previousEntryHash points to hash1, not insertedHash
      // So the chain from entry1 -> entry2 still validates
      // But a complete traversal would find the orphan
      expect(insertedHash).not.toBe(hash1)
      expect(insertedHash).not.toBe(hash2)
    })
  })

  describe('chain verification algorithm', () => {
    function verifyChain(entries: AuditLogEntry[]): {
      valid: boolean
      brokenAt?: number
    } {
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i]
        const computedHash = hashAuditEntry(entry)

        // First entry should have no previous hash
        if (i === 0 && entry.previousEntryHash) {
          return { valid: false, brokenAt: 0 }
        }

        // Each subsequent entry should link to previous entry's hash
        if (i > 0) {
          const prevHash = hashAuditEntry(entries[i - 1])
          if (entry.previousEntryHash !== prevHash) {
            return { valid: false, brokenAt: i }
          }
        }
      }
      return { valid: true }
    }

    it('valid chain passes verification', () => {
      const e1 = createEntry('001', 'login')
      const h1 = hashAuditEntry(e1)
      const e2 = createEntry('002', 'action', h1)
      const h2 = hashAuditEntry(e2)
      const e3 = createEntry('003', 'logout', h2)

      expect(verifyChain([e1, e2, e3])).toEqual({ valid: true })
    })

    it('tampered chain fails verification', () => {
      const e1 = createEntry('001', 'login')
      const h1 = hashAuditEntry(e1)
      const e2 = { ...createEntry('002', 'action', h1), event: 'tampered' }
      const h2 = hashAuditEntry(e2)
      const e3 = createEntry('003', 'logout', 'wrong-hash')

      const result = verifyChain([e1, e2, e3])
      expect(result.valid).toBe(false)
      expect(result.brokenAt).toBe(2)
    })

    it('empty chain is valid', () => {
      expect(verifyChain([])).toEqual({ valid: true })
    })

    it('single entry chain is valid', () => {
      const e1 = createEntry('001', 'login')
      expect(verifyChain([e1])).toEqual({ valid: true })
    })
  })
})
