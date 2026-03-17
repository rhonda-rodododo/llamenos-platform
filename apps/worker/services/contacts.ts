/**
 * ContactsService — replaces ContactDirectoryDO.
 *
 * E2EE contact directory with blind indexes, relationships, affinity groups,
 * and group members. All state is stored in PostgreSQL via Drizzle ORM.
 *
 * PostgreSQL indexes replace the DO's manual KV indexes:
 * - identifier_hashes GIN index  -> replaces idx:id:{hash}
 * - name_hash B-tree index       -> replaces idx:name:{hash}
 * - trigram_tokens GIN index     -> replaces idx:trigram:{token}:{id}
 * - tag_hashes GIN index         -> replaces idx:tag:{hash}:{id}
 */
import { eq, and, desc, sql, or, count } from 'drizzle-orm'
import type { Database } from '../db'
import {
  contacts,
  contactRelationships,
  affinityGroups,
  groupMembers,
} from '../db/schema'
import { ServiceError } from './settings'
import type { CreateContactBody, UpdateContactBody } from '@protocol/schemas/contacts-v2'
import type {
  CreateRelationshipBody,
  CreateAffinityGroupBody,
  UpdateAffinityGroupBody,
  AddGroupMemberBody,
} from '@protocol/schemas/contact-relationships'

// ---------------------------------------------------------------------------
// Inferred row types from Drizzle schema
// ---------------------------------------------------------------------------

type ContactRow = typeof contacts.$inferSelect
type RelationshipRow = typeof contactRelationships.$inferSelect
type AffinityGroupRow = typeof affinityGroups.$inferSelect
type GroupMemberRow = typeof groupMembers.$inferSelect

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface ListContactsInput {
  hubId: string
  page?: number
  limit?: number
  contactTypeHash?: string
}

// ---------------------------------------------------------------------------
// ContactsService
// ---------------------------------------------------------------------------

export class ContactsService {
  constructor(protected db: Database) {}

  // =========================================================================
  // Contact CRUD
  // =========================================================================

  async create(input: CreateContactBody): Promise<ContactRow> {
    const now = new Date()
    const [contact] = await this.db
      .insert(contacts)
      .values({
        hubId: input.hubId,
        identifierHashes: input.identifierHashes,
        nameHash: input.nameHash ?? null,
        trigramTokens: input.trigramTokens ?? null,
        encryptedSummary: input.encryptedSummary,
        summaryEnvelopes: input.summaryEnvelopes,
        encryptedPii: input.encryptedPII ?? null,
        piiEnvelopes: input.piiEnvelopes ?? null,
        contactTypeHash: input.contactTypeHash ?? null,
        tagHashes: input.tagHashes ?? [],
        statusHash: input.statusHash ?? null,
        blindIndexes: input.blindIndexes ?? {},
        caseCount: 0,
        noteCount: 0,
        interactionCount: 0,
        lastInteractionAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .returning()

    return contact
  }

  async get(id: string): Promise<ContactRow> {
    const rows = await this.db
      .select()
      .from(contacts)
      .where(eq(contacts.id, id))

    if (rows.length === 0) {
      throw new ServiceError(404, 'Contact not found')
    }
    return rows[0]
  }

  async update(id: string, input: UpdateContactBody): Promise<ContactRow> {
    // Verify exists
    const existing = await this.db
      .select()
      .from(contacts)
      .where(eq(contacts.id, id))
    if (existing.length === 0) {
      throw new ServiceError(404, 'Contact not found')
    }

    const values: Record<string, unknown> = { updatedAt: new Date() }

    if (input.identifierHashes !== undefined) values.identifierHashes = input.identifierHashes
    if (input.nameHash !== undefined) values.nameHash = input.nameHash
    if (input.trigramTokens !== undefined) values.trigramTokens = input.trigramTokens
    if (input.encryptedSummary !== undefined) values.encryptedSummary = input.encryptedSummary
    if (input.summaryEnvelopes !== undefined) values.summaryEnvelopes = input.summaryEnvelopes
    if (input.encryptedPII !== undefined) values.encryptedPii = input.encryptedPII
    if (input.piiEnvelopes !== undefined) values.piiEnvelopes = input.piiEnvelopes
    if (input.contactTypeHash !== undefined) values.contactTypeHash = input.contactTypeHash
    if (input.tagHashes !== undefined) values.tagHashes = input.tagHashes
    if (input.statusHash !== undefined) values.statusHash = input.statusHash
    if (input.blindIndexes !== undefined) values.blindIndexes = input.blindIndexes

    const [updated] = await this.db
      .update(contacts)
      .set(values)
      .where(eq(contacts.id, id))
      .returning()

    return updated
  }

  async delete(id: string): Promise<void> {
    const existing = await this.db
      .select({ id: contacts.id })
      .from(contacts)
      .where(eq(contacts.id, id))
    if (existing.length === 0) {
      throw new ServiceError(404, 'Contact not found')
    }

    // Clean up relationships where this contact is either side
    await this.db
      .delete(contactRelationships)
      .where(
        or(
          eq(contactRelationships.contactIdA, id),
          eq(contactRelationships.contactIdB, id),
        ),
      )

    // Clean up group memberships and decrement member counts
    const memberships = await this.db
      .select({ groupId: groupMembers.groupId })
      .from(groupMembers)
      .where(eq(groupMembers.contactId, id))

    for (const { groupId } of memberships) {
      await this.db
        .update(affinityGroups)
        .set({
          memberCount: sql`GREATEST(0, ${affinityGroups.memberCount} - 1)`,
          updatedAt: new Date(),
        })
        .where(eq(affinityGroups.id, groupId))
    }

    await this.db
      .delete(groupMembers)
      .where(eq(groupMembers.contactId, id))

    // Delete the contact
    await this.db.delete(contacts).where(eq(contacts.id, id))
  }

  async list(input: ListContactsInput): Promise<{
    contacts: ContactRow[]
    total: number
    page: number
    limit: number
    hasMore: boolean
  }> {
    const page = input.page ?? 1
    const limit = Math.min(input.limit ?? 20, 100)
    const offset = (page - 1) * limit

    const conditions = [eq(contacts.hubId, input.hubId)]

    if (input.contactTypeHash) {
      conditions.push(eq(contacts.contactTypeHash, input.contactTypeHash))
    }

    const where = and(...conditions)

    const [totalResult] = await this.db
      .select({ count: count() })
      .from(contacts)
      .where(where)

    const total = totalResult.count

    const rows = await this.db
      .select()
      .from(contacts)
      .where(where)
      .orderBy(desc(contacts.lastInteractionAt))
      .limit(limit)
      .offset(offset)

    return {
      contacts: rows,
      total,
      page,
      limit,
      hasMore: offset + limit < total,
    }
  }

  // =========================================================================
  // Lookup
  // =========================================================================

  async lookupByIdentifierHash(
    hubId: string,
    identifierHash: string,
  ): Promise<ContactRow | null> {
    const rows = await this.db
      .select()
      .from(contacts)
      .where(
        and(
          eq(contacts.hubId, hubId),
          sql`${contacts.identifierHashes} @> ARRAY[${identifierHash}]::text[]`,
        ),
      )
      .limit(1)

    return rows[0] ?? null
  }

  async lookupByNameHash(
    hubId: string,
    nameHash: string,
  ): Promise<ContactRow | null> {
    const rows = await this.db
      .select()
      .from(contacts)
      .where(
        and(
          eq(contacts.hubId, hubId),
          eq(contacts.nameHash, nameHash),
        ),
      )
      .limit(1)

    return rows[0] ?? null
  }

  // =========================================================================
  // Fuzzy search via trigram tokens (GIN array overlap)
  // =========================================================================

  async searchByTrigramTokens(
    hubId: string,
    tokens: string[],
    limit = 20,
  ): Promise<ContactRow[]> {
    if (tokens.length === 0) return []

    // Array overlap operator: trigram_tokens && ARRAY[tokens]
    // This finds contacts whose trigram_tokens share at least one element
    const tokenArray = sql`ARRAY[${sql.join(
      tokens.map((t) => sql`${t}`),
      sql.raw(','),
    )}]::text[]`

    const rows = await this.db
      .select()
      .from(contacts)
      .where(
        and(
          eq(contacts.hubId, hubId),
          sql`${contacts.trigramTokens} && ${tokenArray}`,
        ),
      )
      .limit(limit)

    return rows
  }

  // =========================================================================
  // Relationships
  // =========================================================================

  async createRelationship(
    contactIdA: string,
    hubId: string,
    createdBy: string,
    input: CreateRelationshipBody,
  ): Promise<RelationshipRow> {
    // Prevent self-relationship
    if (contactIdA === input.contactIdB) {
      throw new ServiceError(400, 'Cannot create a relationship with the same contact')
    }

    // Verify both contacts exist
    const contactA = await this.db
      .select({ id: contacts.id })
      .from(contacts)
      .where(eq(contacts.id, contactIdA))
    if (contactA.length === 0) {
      throw new ServiceError(404, 'Contact A not found')
    }

    const contactB = await this.db
      .select({ id: contacts.id })
      .from(contacts)
      .where(eq(contacts.id, input.contactIdB))
    if (contactB.length === 0) {
      throw new ServiceError(404, 'Contact B not found')
    }

    // Prevent duplicate relationships (same pair + same type, either direction)
    const existing = await this.db
      .select({ id: contactRelationships.id })
      .from(contactRelationships)
      .where(
        and(
          eq(contactRelationships.relationshipType, input.relationshipType),
          or(
            and(
              eq(contactRelationships.contactIdA, contactIdA),
              eq(contactRelationships.contactIdB, input.contactIdB),
            ),
            and(
              eq(contactRelationships.contactIdA, input.contactIdB),
              eq(contactRelationships.contactIdB, contactIdA),
            ),
          ),
        ),
      )

    if (existing.length > 0) {
      throw new ServiceError(409, 'Relationship already exists')
    }

    const [relationship] = await this.db
      .insert(contactRelationships)
      .values({
        hubId,
        contactIdA,
        contactIdB: input.contactIdB,
        relationshipType: input.relationshipType,
        direction: input.direction ?? 'bidirectional',
        encryptedNotes: input.encryptedNotes ?? null,
        notesEnvelopes: input.notesEnvelopes ?? null,
        createdBy,
      })
      .returning()

    return relationship
  }

  async deleteRelationship(contactId: string, relId: string): Promise<void> {
    // Try forward direction first
    const forward = await this.db
      .select({ id: contactRelationships.id })
      .from(contactRelationships)
      .where(
        and(
          eq(contactRelationships.id, relId),
          or(
            eq(contactRelationships.contactIdA, contactId),
            eq(contactRelationships.contactIdB, contactId),
          ),
        ),
      )

    if (forward.length === 0) {
      throw new ServiceError(404, 'Relationship not found')
    }

    await this.db
      .delete(contactRelationships)
      .where(eq(contactRelationships.id, relId))
  }

  async listRelationships(contactId: string): Promise<RelationshipRow[]> {
    const rows = await this.db
      .select()
      .from(contactRelationships)
      .where(
        or(
          eq(contactRelationships.contactIdA, contactId),
          eq(contactRelationships.contactIdB, contactId),
        ),
      )

    return rows
  }

  // =========================================================================
  // Affinity Groups
  // =========================================================================

  async createGroup(
    hubId: string,
    createdBy: string,
    input: CreateAffinityGroupBody,
  ): Promise<AffinityGroupRow> {
    // Verify all member contacts exist
    for (const member of input.members) {
      const existing = await this.db
        .select({ id: contacts.id })
        .from(contacts)
        .where(eq(contacts.id, member.contactId))
      if (existing.length === 0) {
        throw new ServiceError(404, `Contact ${member.contactId} not found`)
      }
    }

    const [group] = await this.db
      .insert(affinityGroups)
      .values({
        hubId,
        encryptedDetails: input.encryptedDetails,
        detailEnvelopes: input.detailEnvelopes,
        memberCount: input.members.length,
        createdBy,
      })
      .returning()

    // Insert members
    if (input.members.length > 0) {
      await this.db.insert(groupMembers).values(
        input.members.map((m) => ({
          groupId: group.id,
          contactId: m.contactId,
          role: m.role ?? null,
          isPrimary: m.isPrimary ?? false,
        })),
      )
    }

    return group
  }

  async updateGroup(
    id: string,
    input: UpdateAffinityGroupBody,
  ): Promise<AffinityGroupRow> {
    const existing = await this.db
      .select()
      .from(affinityGroups)
      .where(eq(affinityGroups.id, id))
    if (existing.length === 0) {
      throw new ServiceError(404, 'Group not found')
    }

    const values: Record<string, unknown> = { updatedAt: new Date() }
    if (input.encryptedDetails !== undefined) values.encryptedDetails = input.encryptedDetails
    if (input.detailEnvelopes !== undefined) values.detailEnvelopes = input.detailEnvelopes

    const [updated] = await this.db
      .update(affinityGroups)
      .set(values)
      .where(eq(affinityGroups.id, id))
      .returning()

    return updated
  }

  async deleteGroup(id: string): Promise<void> {
    const existing = await this.db
      .select({ id: affinityGroups.id })
      .from(affinityGroups)
      .where(eq(affinityGroups.id, id))
    if (existing.length === 0) {
      throw new ServiceError(404, 'Group not found')
    }

    // Delete members first
    await this.db.delete(groupMembers).where(eq(groupMembers.groupId, id))

    // Delete the group
    await this.db.delete(affinityGroups).where(eq(affinityGroups.id, id))
  }

  async listGroups(hubId: string): Promise<AffinityGroupRow[]> {
    return this.db
      .select()
      .from(affinityGroups)
      .where(eq(affinityGroups.hubId, hubId))
  }

  // =========================================================================
  // Group Members
  // =========================================================================

  async addMember(
    groupId: string,
    input: AddGroupMemberBody,
  ): Promise<{ added: true; memberCount: number }> {
    const group = await this.db
      .select()
      .from(affinityGroups)
      .where(eq(affinityGroups.id, groupId))
    if (group.length === 0) {
      throw new ServiceError(404, 'Group not found')
    }

    // Verify contact exists
    const contact = await this.db
      .select({ id: contacts.id })
      .from(contacts)
      .where(eq(contacts.id, input.contactId))
    if (contact.length === 0) {
      throw new ServiceError(404, 'Contact not found')
    }

    // Check if already a member
    const existing = await this.db
      .select()
      .from(groupMembers)
      .where(
        and(
          eq(groupMembers.groupId, groupId),
          eq(groupMembers.contactId, input.contactId),
        ),
      )
    if (existing.length > 0) {
      throw new ServiceError(409, 'Contact is already a member of this group')
    }

    await this.db.insert(groupMembers).values({
      groupId,
      contactId: input.contactId,
      role: input.role ?? null,
      isPrimary: input.isPrimary ?? false,
    })

    const [updated] = await this.db
      .update(affinityGroups)
      .set({
        memberCount: sql`${affinityGroups.memberCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(affinityGroups.id, groupId))
      .returning()

    return { added: true, memberCount: updated.memberCount }
  }

  async removeMember(
    groupId: string,
    contactId: string,
  ): Promise<{ removed: true; memberCount: number }> {
    const group = await this.db
      .select()
      .from(affinityGroups)
      .where(eq(affinityGroups.id, groupId))
    if (group.length === 0) {
      throw new ServiceError(404, 'Group not found')
    }

    const member = await this.db
      .select()
      .from(groupMembers)
      .where(
        and(
          eq(groupMembers.groupId, groupId),
          eq(groupMembers.contactId, contactId),
        ),
      )
    if (member.length === 0) {
      throw new ServiceError(404, 'Member not found in group')
    }

    await this.db
      .delete(groupMembers)
      .where(
        and(
          eq(groupMembers.groupId, groupId),
          eq(groupMembers.contactId, contactId),
        ),
      )

    const [updated] = await this.db
      .update(affinityGroups)
      .set({
        memberCount: sql`GREATEST(0, ${affinityGroups.memberCount} - 1)`,
        updatedAt: new Date(),
      })
      .where(eq(affinityGroups.id, groupId))
      .returning()

    return { removed: true, memberCount: updated.memberCount }
  }

  async listMembers(
    groupId: string,
  ): Promise<GroupMemberRow[]> {
    const group = await this.db
      .select({ id: affinityGroups.id })
      .from(affinityGroups)
      .where(eq(affinityGroups.id, groupId))
    if (group.length === 0) {
      throw new ServiceError(404, 'Group not found')
    }

    return this.db
      .select()
      .from(groupMembers)
      .where(eq(groupMembers.groupId, groupId))
  }

  // =========================================================================
  // Reverse lookup: groups for a contact
  // =========================================================================

  async listGroupsForContact(contactId: string): Promise<AffinityGroupRow[]> {
    const memberships = await this.db
      .select({ groupId: groupMembers.groupId })
      .from(groupMembers)
      .where(eq(groupMembers.contactId, contactId))

    if (memberships.length === 0) return []

    const groupIds = memberships.map((m) => m.groupId)
    const rows = await this.db
      .select()
      .from(affinityGroups)
      .where(sql`${affinityGroups.id} = ANY(ARRAY[${sql.join(
        groupIds.map((id) => sql`${id}`),
        sql.raw(','),
      )}]::text[])`)

    return rows
  }

  // =========================================================================
  // Interaction metadata updates
  // =========================================================================

  async incrementNoteCount(id: string): Promise<void> {
    const result = await this.db
      .update(contacts)
      .set({
        noteCount: sql`${contacts.noteCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(contacts.id, id))
      .returning({ id: contacts.id })

    if (result.length === 0) {
      throw new ServiceError(404, 'Contact not found')
    }
  }

  async updateLastInteraction(id: string): Promise<{ interactionCount: number }> {
    const now = new Date()
    const [updated] = await this.db
      .update(contacts)
      .set({
        interactionCount: sql`${contacts.interactionCount} + 1`,
        lastInteractionAt: now,
        updatedAt: now,
      })
      .where(eq(contacts.id, id))
      .returning({ interactionCount: contacts.interactionCount })

    if (!updated) {
      throw new ServiceError(404, 'Contact not found')
    }

    return { interactionCount: updated.interactionCount }
  }

  // =========================================================================
  // Reset (demo/development only)
  // =========================================================================

  async reset(env: { DEMO_MODE?: string; ENVIRONMENT?: string }): Promise<void> {
    if (env.DEMO_MODE !== 'true' && env.ENVIRONMENT !== 'development') {
      throw new ServiceError(403, 'Reset not allowed outside demo/development mode')
    }

    await this.db.delete(groupMembers)
    await this.db.delete(affinityGroups)
    await this.db.delete(contactRelationships)
    await this.db.delete(contacts)
  }
}
