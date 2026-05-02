import { describe, it, expect } from 'vitest'
import {
  getSummaryRecipients,
  getFieldRecipients,
  getPIIRecipients,
  determineEnvelopeRecipients,
  type HubMemberInfo,
} from '@worker/lib/envelope-recipients'
import type { EntityTypeDefinition } from '@protocol/schemas/entity-schema'

// Minimal entity type stub — only the fields envelope-recipients.ts reads
function makeEntityType(overrides: Partial<Pick<EntityTypeDefinition, 'accessRoles' | 'editRoles'>> = {}): EntityTypeDefinition {
  return {
    id: 'et-1',
    hubId: 'hub-1',
    ...overrides,
  } as EntityTypeDefinition
}

const admin: HubMemberInfo = {
  pubkey: 'admin-pub',
  roles: ['admin'],
  permissions: ['cases:read-all'],
}

const volunteer: HubMemberInfo = {
  pubkey: 'vol-pub',
  roles: ['volunteer'],
  permissions: ['cases:read-assigned'],
}

const restrictedUser: HubMemberInfo = {
  pubkey: 'restricted-pub',
  roles: ['observer'],
  permissions: ['calls:answer'],
}

const piiViewer: HubMemberInfo = {
  pubkey: 'pii-pub',
  roles: ['intake'],
  permissions: ['contacts:view-pii', 'cases:read-own'],
}

describe('Envelope Recipients ACL', () => {
  describe('getSummaryRecipients', () => {
    it('includes all members with cases:read-* when no accessRoles defined', () => {
      const entityType = makeEntityType()
      const recipients = getSummaryRecipients(entityType, [admin, volunteer, restrictedUser, piiViewer])

      expect(recipients).toContain('admin-pub')
      expect(recipients).toContain('vol-pub')
      expect(recipients).toContain('pii-pub') // has cases:read-own
      expect(recipients).not.toContain('restricted-pub') // only has calls:answer
    })

    it('restricts to accessRoles when defined, but always includes admins', () => {
      const entityType = makeEntityType({ accessRoles: ['volunteer'] })
      const recipients = getSummaryRecipients(entityType, [admin, volunteer, restrictedUser])

      expect(recipients).toContain('admin-pub')
      expect(recipients).toContain('vol-pub')
      expect(recipients).not.toContain('restricted-pub')
    })

    it('always includes admin even when not in accessRoles', () => {
      const entityType = makeEntityType({ accessRoles: ['observer'] })
      const recipients = getSummaryRecipients(entityType, [admin, restrictedUser])

      expect(recipients).toContain('admin-pub')
      expect(recipients).toContain('restricted-pub') // in accessRoles
    })

    it('deduplicates pubkeys', () => {
      const entityType = makeEntityType({ accessRoles: ['admin'] })
      const recipients = getSummaryRecipients(entityType, [admin])

      // admin matches both accessRoles and admin-always-include
      expect(recipients.filter(p => p === 'admin-pub')).toHaveLength(1)
    })

    it('returns only admins when no members match', () => {
      const entityType = makeEntityType({ accessRoles: ['nonexistent-role'] })
      const recipients = getSummaryRecipients(entityType, [admin, volunteer])

      expect(recipients).toEqual(['admin-pub'])
    })
  })

  describe('getFieldRecipients', () => {
    it('includes assigned pubkeys + admins + editRoles members', () => {
      const entityType = makeEntityType({ editRoles: ['intake'] })
      const recipients = getFieldRecipients(entityType, ['assigned-pub'], [admin, volunteer, piiViewer])

      expect(recipients).toContain('assigned-pub')
      expect(recipients).toContain('admin-pub')
      expect(recipients).toContain('pii-pub') // has 'intake' role
      expect(recipients).not.toContain('vol-pub')
    })

    it('works without editRoles — just assigned + admins', () => {
      const entityType = makeEntityType()
      const recipients = getFieldRecipients(entityType, ['vol-pub'], [admin, volunteer])

      expect(recipients).toContain('vol-pub')
      expect(recipients).toContain('admin-pub')
      expect(recipients).toHaveLength(2)
    })
  })

  describe('getPIIRecipients', () => {
    it('includes only admins and contacts:view-pii holders', () => {
      const entityType = makeEntityType()
      const recipients = getPIIRecipients(entityType, [admin, volunteer, piiViewer, restrictedUser])

      expect(recipients).toContain('admin-pub')
      expect(recipients).toContain('pii-pub')
      expect(recipients).not.toContain('vol-pub')
      expect(recipients).not.toContain('restricted-pub')
    })

    it('returns empty array when no members have admin or PII permissions', () => {
      const entityType = makeEntityType()
      const recipients = getPIIRecipients(entityType, [volunteer, restrictedUser])

      expect(recipients).toEqual([])
    })
  })

  describe('determineEnvelopeRecipients', () => {
    it('returns all three tiers with correct segregation', () => {
      const entityType = makeEntityType({ accessRoles: ['volunteer', 'intake'], editRoles: ['intake'] })
      const result = determineEnvelopeRecipients(entityType, ['vol-pub'], [admin, volunteer, piiViewer, restrictedUser])

      // summary: accessRoles (volunteer, intake) + admins
      expect(result.summary).toContain('admin-pub')
      expect(result.summary).toContain('vol-pub')
      expect(result.summary).toContain('pii-pub') // intake role

      // fields: assigned (vol-pub) + admins + editRoles (intake=pii-pub)
      expect(result.fields).toContain('vol-pub')
      expect(result.fields).toContain('admin-pub')
      expect(result.fields).toContain('pii-pub')

      // pii: only admin + contacts:view-pii
      expect(result.pii).toContain('admin-pub')
      expect(result.pii).toContain('pii-pub')
      expect(result.pii).not.toContain('vol-pub')
    })
  })
})
