import type { EntityTypeDefinition } from '../schemas/entity-schema'
import { permissionGranted } from '@shared/permissions'

/**
 * Hub member with resolved role and permission information.
 * Used by envelope recipient determination to decide who gets
 * decryption keys for each tier of a record.
 */
export interface HubMemberInfo {
  pubkey: string
  roles: string[]
  permissions: string[]
}

/**
 * Envelope recipients for the 3-tier encryption model.
 *
 * - summary:  visible to all hub members with read access to this entity type
 * - fields:   visible to assigned volunteers + admins + editRoles holders
 * - pii:      visible to admins + contacts:view-pii holders only
 */
export interface EnvelopeRecipients {
  summary: string[]
  fields: string[]
  pii: string[]
}

/**
 * Get pubkeys of members who should receive summary-tier envelopes.
 *
 * If the entity type has accessRoles defined, only members whose role slugs
 * intersect with that list are included. Otherwise, any member with a
 * cases:read-* permission qualifies. Admins are always included.
 */
export function getSummaryRecipients(
  entityType: EntityTypeDefinition,
  hubMembers: HubMemberInfo[],
): string[] {
  const adminPubkeys = hubMembers
    .filter(m =>
      permissionGranted(m.permissions, 'cases:read-all')
      || permissionGranted(m.permissions, 'cases:*'),
    )
    .map(m => m.pubkey)

  let recipients: string[]
  if (entityType.accessRoles && entityType.accessRoles.length > 0) {
    recipients = hubMembers
      .filter(m => m.roles.some(r => entityType.accessRoles!.includes(r)))
      .map(m => m.pubkey)
  } else {
    // No access restrictions: all members with any cases:read-* permission
    recipients = hubMembers
      .filter(m =>
        permissionGranted(m.permissions, 'cases:read-all')
        || permissionGranted(m.permissions, 'cases:read-assigned')
        || permissionGranted(m.permissions, 'cases:read-own'),
      )
      .map(m => m.pubkey)
  }

  // Always include admins
  return [...new Set([...recipients, ...adminPubkeys])]
}

/**
 * Get pubkeys of members who should receive field-tier envelopes.
 *
 * Includes: assigned volunteers, admins with cases:read-all, and
 * members whose role slugs are in the entity type's editRoles list.
 */
export function getFieldRecipients(
  entityType: EntityTypeDefinition,
  assignedPubkeys: string[],
  hubMembers: HubMemberInfo[],
): string[] {
  const adminPubkeys = hubMembers
    .filter(m =>
      permissionGranted(m.permissions, 'cases:read-all')
      || permissionGranted(m.permissions, 'cases:*'),
    )
    .map(m => m.pubkey)

  const editRolePubkeys = entityType.editRoles && entityType.editRoles.length > 0
    ? hubMembers
      .filter(m => m.roles.some(r => entityType.editRoles!.includes(r)))
      .map(m => m.pubkey)
    : []

  return [...new Set([...assignedPubkeys, ...adminPubkeys, ...editRolePubkeys])]
}

/**
 * Get pubkeys of members who should receive PII-tier envelopes.
 *
 * Only admins and members with explicit contacts:view-pii permission.
 */
export function getPIIRecipients(
  _entityType: EntityTypeDefinition,
  hubMembers: HubMemberInfo[],
): string[] {
  const adminPubkeys = hubMembers
    .filter(m =>
      permissionGranted(m.permissions, 'cases:read-all')
      || permissionGranted(m.permissions, 'cases:*'),
    )
    .map(m => m.pubkey)

  const piiPubkeys = hubMembers
    .filter(m =>
      permissionGranted(m.permissions, 'contacts:view-pii')
      || permissionGranted(m.permissions, 'contacts:*'),
    )
    .map(m => m.pubkey)

  return [...new Set([...adminPubkeys, ...piiPubkeys])]
}

/**
 * Determine envelope recipients for all three tiers of a record
 * based on entity type definition, record assignments, and hub membership.
 */
export function determineEnvelopeRecipients(
  entityType: EntityTypeDefinition,
  assignedTo: string[],
  hubMembers: HubMemberInfo[],
): EnvelopeRecipients {
  return {
    summary: getSummaryRecipients(entityType, hubMembers),
    fields: getFieldRecipients(entityType, assignedTo, hubMembers),
    pii: getPIIRecipients(entityType, hubMembers),
  }
}
