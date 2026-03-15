import { DurableObject } from 'cloudflare:workers'
import type { Env } from '../types'
import type { Contact, CreateContactBody } from '../schemas/contacts-v2'
import type { ContactRelationship, AffinityGroup, CreateRelationshipBody, CreateAffinityGroupBody, UpdateAffinityGroupBody, AddGroupMemberBody } from '../schemas/contact-relationships'
import { DORouter } from '../lib/do-router'
import { parseBlindIndexFilters, matchesBlindIndexFilters } from '../lib/blind-index-query'

/**
 * ContactDirectoryDO — per-hub E2EE contact directory.
 *
 * Stores encrypted contact profiles with two encryption tiers:
 * - Summary: visible to anyone with contacts:view
 * - PII: visible only to those with contacts:view-pii
 *
 * Maintains reverse indexes for fast lookup:
 * - idx:id:{identifierHash} → contactId (phone, Signal, email lookup)
 * - idx:name:{nameHash} → contactId
 * - idx:trigram:{token}:{contactId} → true (name search)
 * - idx:tag:{tagHash}:{contactId} → true (tag filtering)
 *
 * Relationship storage keys:
 * - rel:{contactIdA}:{relId} → ContactRelationship
 * - relrev:{contactIdB}:{relId} → ContactRelationship (reverse index)
 *
 * Affinity group storage keys:
 * - group:{groupId} → AffinityGroup
 * - groupmember:{groupId}:{contactId} → { role?, isPrimary }
 * - contactgroups:{contactId}:{groupId} → true (reverse index)
 *
 * Storage keys:
 * - contact:{uuid} → Contact record
 */
export class ContactDirectoryDO extends DurableObject<Env> {
  private router: DORouter

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.router = new DORouter()
    this.setupRoutes()
  }

  private setupRoutes() {
    // --- List contacts (paginated, with blind index filters) ---
    this.router.get('/contacts', async (req) => {
      const url = new URL(req.url)
      const page = parseInt(url.searchParams.get('page') ?? '1')
      const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '20'), 100)
      const contactTypeFilter = url.searchParams.get('contactTypeHash')
      const filters = parseBlindIndexFilters(url.searchParams)
      // Remove contactTypeHash from blind index filters since it's a top-level field
      filters.delete('contactTypeHash')

      const allKeys = await this.ctx.storage.list<Contact>({ prefix: 'contact:', limit: 1000 })
      const contacts: Contact[] = []
      for (const [, value] of allKeys) {
        const contact = value
        // Filter by contactTypeHash (top-level field, not in blindIndexes)
        if (contactTypeFilter && contact.contactTypeHash !== contactTypeFilter) {
          continue
        }
        if (filters.size > 0 && !matchesBlindIndexFilters(contact.blindIndexes ?? {}, filters)) {
          continue
        }
        contacts.push(contact)
      }

      // Sort by lastInteractionAt descending
      contacts.sort((a, b) =>
        (b.lastInteractionAt ?? b.createdAt).localeCompare(a.lastInteractionAt ?? a.createdAt),
      )

      const start = (page - 1) * limit
      const paged = contacts.slice(start, start + limit)

      return Response.json({
        contacts: paged,
        total: contacts.length,
        page,
        limit,
        hasMore: start + limit < contacts.length,
      })
    })

    // --- Get single contact ---
    this.router.get('/contacts/:id', async (_req, { id }) => {
      const contact = await this.ctx.storage.get<Contact>(`contact:${id}`)
      if (!contact) return Response.json({ error: 'Contact not found' }, { status: 404 })
      return Response.json(contact)
    })

    // --- Lookup by identifier hash ---
    this.router.get('/contacts/lookup/:identifierHash', async (_req, { identifierHash }) => {
      const contactId = await this.ctx.storage.get<string>(`idx:id:${identifierHash}`)
      if (!contactId) return Response.json({ contact: null })
      const contact = await this.ctx.storage.get<Contact>(`contact:${contactId}`)
      return Response.json({ contact: contact ?? null })
    })

    // --- Search by trigram tokens (AND intersection) ---
    this.router.get('/contacts/search', async (req) => {
      const url = new URL(req.url)
      const tokens = url.searchParams.get('tokens')?.split(',').filter(Boolean) ?? []
      if (tokens.length === 0) return Response.json({ contacts: [] })

      // Find contact IDs matching ALL tokens (AND logic)
      const matchSets: Set<string>[] = []
      for (const token of tokens) {
        const keys = await this.ctx.storage.list({ prefix: `idx:trigram:${token}:` })
        const ids = new Set<string>()
        for (const [key] of keys) {
          const parts = key.split(':')
          ids.add(parts[parts.length - 1])
        }
        matchSets.push(ids)
      }

      // Intersect all sets
      let resultIds = matchSets[0] ?? new Set<string>()
      for (let i = 1; i < matchSets.length; i++) {
        resultIds = new Set([...resultIds].filter(id => matchSets[i].has(id)))
      }

      // Fetch matching contacts
      const contacts: Contact[] = []
      for (const id of resultIds) {
        const contact = await this.ctx.storage.get<Contact>(`contact:${id}`)
        if (contact) contacts.push(contact)
      }

      return Response.json({ contacts })
    })

    // --- Create contact ---
    this.router.post('/contacts', async (req) => {
      const body = await req.json() as CreateContactBody
      const id = crypto.randomUUID()
      const now = new Date().toISOString()

      const contact: Contact = {
        id,
        hubId: body.hubId ?? '',
        identifierHashes: body.identifierHashes,
        nameHash: body.nameHash,
        trigramTokens: body.trigramTokens,
        encryptedSummary: body.encryptedSummary,
        summaryEnvelopes: body.summaryEnvelopes,
        encryptedPII: body.encryptedPII,
        piiEnvelopes: body.piiEnvelopes,
        contactTypeHash: body.contactTypeHash,
        tagHashes: body.tagHashes ?? [],
        statusHash: body.statusHash,
        blindIndexes: body.blindIndexes ?? {},
        createdAt: now,
        updatedAt: now,
        lastInteractionAt: now,
        caseCount: 0,
        noteCount: 0,
        interactionCount: 0,
      }

      // Store contact and all indexes atomically
      const puts = new Map<string, unknown>()
      puts.set(`contact:${id}`, contact)

      for (const hash of body.identifierHashes) {
        puts.set(`idx:id:${hash}`, id)
      }
      if (body.nameHash) {
        puts.set(`idx:name:${body.nameHash}`, id)
      }
      for (const token of body.trigramTokens ?? []) {
        puts.set(`idx:trigram:${token}:${id}`, true)
      }
      for (const tagHash of body.tagHashes ?? []) {
        puts.set(`idx:tag:${tagHash}:${id}`, true)
      }

      await this.ctx.storage.put(Object.fromEntries(puts))

      return Response.json(contact, { status: 201 })
    })

    // --- Update contact ---
    this.router.patch('/contacts/:id', async (req, { id }) => {
      const existing = await this.ctx.storage.get<Contact>(`contact:${id}`)
      if (!existing) return Response.json({ error: 'Contact not found' }, { status: 404 })

      const body = await req.json() as Partial<CreateContactBody>

      const updated: Contact = {
        ...existing,
        ...body,
        id, // Prevent ID override
        hubId: existing.hubId, // Prevent hubId override
        createdAt: existing.createdAt, // Preserve creation timestamp
        updatedAt: new Date().toISOString(),
        // Preserve counters
        caseCount: existing.caseCount,
        noteCount: existing.noteCount,
        interactionCount: existing.interactionCount,
        // Ensure required arrays exist
        tagHashes: body.tagHashes ?? existing.tagHashes,
        blindIndexes: body.blindIndexes ?? existing.blindIndexes,
      }

      const puts = new Map<string, unknown>()
      const deletes: string[] = []

      // Update identifier indexes if changed
      if (body.identifierHashes) {
        for (const hash of existing.identifierHashes) {
          deletes.push(`idx:id:${hash}`)
        }
        for (const hash of body.identifierHashes) {
          puts.set(`idx:id:${hash}`, id)
        }
      }

      // Update name index if changed
      if (body.nameHash !== undefined) {
        if (existing.nameHash) {
          deletes.push(`idx:name:${existing.nameHash}`)
        }
        if (body.nameHash) {
          puts.set(`idx:name:${body.nameHash}`, id)
        }
      }

      // Update trigram indexes if changed
      if (body.trigramTokens) {
        const oldTrigrams = await this.ctx.storage.list({ prefix: 'idx:trigram:' })
        for (const [key] of oldTrigrams) {
          if (key.endsWith(`:${id}`)) deletes.push(key)
        }
        for (const token of body.trigramTokens) {
          puts.set(`idx:trigram:${token}:${id}`, true)
        }
      }

      // Update tag indexes if changed
      if (body.tagHashes) {
        const oldTags = await this.ctx.storage.list({ prefix: 'idx:tag:' })
        for (const [key] of oldTags) {
          if (key.endsWith(`:${id}`)) deletes.push(key)
        }
        for (const tagHash of body.tagHashes) {
          puts.set(`idx:tag:${tagHash}:${id}`, true)
        }
      }

      puts.set(`contact:${id}`, updated)

      // Apply deletes and puts
      if (deletes.length > 0) {
        await this.ctx.storage.delete(deletes)
      }
      await this.ctx.storage.put(Object.fromEntries(puts))

      return Response.json(updated)
    })

    // --- Delete contact (also cleans up relationship and group indexes) ---
    this.router.delete('/contacts/:id', async (_req, { id }) => {
      const existing = await this.ctx.storage.get<Contact>(`contact:${id}`)
      if (!existing) return Response.json({ error: 'Contact not found' }, { status: 404 })

      const deletes: string[] = [`contact:${id}`]

      // Remove identifier indexes
      for (const hash of existing.identifierHashes) {
        deletes.push(`idx:id:${hash}`)
      }

      // Remove name index
      if (existing.nameHash) {
        deletes.push(`idx:name:${existing.nameHash}`)
      }

      // Remove trigram indexes
      const trigrams = await this.ctx.storage.list({ prefix: 'idx:trigram:' })
      for (const [key] of trigrams) {
        if (key.endsWith(`:${id}`)) deletes.push(key)
      }

      // Remove tag indexes
      const tags = await this.ctx.storage.list({ prefix: 'idx:tag:' })
      for (const [key] of tags) {
        if (key.endsWith(`:${id}`)) deletes.push(key)
      }

      // Clean up relationships where this contact is contactIdA
      const outgoingRels = await this.ctx.storage.list<ContactRelationship>({ prefix: `rel:${id}:` })
      for (const [key, rel] of outgoingRels) {
        deletes.push(key)
        deletes.push(`relrev:${rel.contactIdB}:${rel.id}`)
      }

      // Clean up relationships where this contact is contactIdB
      const incomingRels = await this.ctx.storage.list<ContactRelationship>({ prefix: `relrev:${id}:` })
      for (const [key, rel] of incomingRels) {
        deletes.push(key)
        deletes.push(`rel:${rel.contactIdA}:${rel.id}`)
      }

      // Clean up group memberships
      const groupMemberships = await this.ctx.storage.list({ prefix: `contactgroups:${id}:` })
      for (const [key] of groupMemberships) {
        const groupId = key.split(':')[2]
        deletes.push(key)
        deletes.push(`groupmember:${groupId}:${id}`)
        // Decrement member count
        const group = await this.ctx.storage.get<AffinityGroup>(`group:${groupId}`)
        if (group) {
          group.memberCount = Math.max(0, group.memberCount - 1)
          group.updatedAt = new Date().toISOString()
          await this.ctx.storage.put(`group:${groupId}`, group)
        }
      }

      await this.ctx.storage.delete(deletes)

      return Response.json({ deleted: true })
    })

    // --- Increment interaction count ---
    this.router.post('/contacts/:id/interaction', async (_req, { id }) => {
      const contact = await this.ctx.storage.get<Contact>(`contact:${id}`)
      if (!contact) return Response.json({ error: 'Not found' }, { status: 404 })

      contact.interactionCount++
      contact.lastInteractionAt = new Date().toISOString()
      contact.updatedAt = contact.lastInteractionAt
      await this.ctx.storage.put(`contact:${id}`, contact)

      return Response.json({ interactionCount: contact.interactionCount })
    })

    // =============================================
    // Contact Relationships
    // =============================================

    // --- Create relationship ---
    this.router.post('/contacts/:id/relationships', async (req, { id: contactIdA }) => {
      const body = await req.json() as CreateRelationshipBody
      const relId = crypto.randomUUID()
      const now = new Date().toISOString()

      // Verify both contacts exist
      const contactA = await this.ctx.storage.get<Contact>(`contact:${contactIdA}`)
      if (!contactA) return Response.json({ error: 'Contact A not found' }, { status: 404 })
      const contactB = await this.ctx.storage.get<Contact>(`contact:${body.contactIdB}`)
      if (!contactB) return Response.json({ error: 'Contact B not found' }, { status: 404 })

      // Prevent self-relationship
      if (contactIdA === body.contactIdB) {
        return Response.json({ error: 'Cannot create a relationship with the same contact' }, { status: 400 })
      }

      // Prevent duplicate relationships (same pair + same type)
      const existingRels = await this.ctx.storage.list<ContactRelationship>({ prefix: `rel:${contactIdA}:` })
      for (const [, rel] of existingRels) {
        if (rel.contactIdB === body.contactIdB && rel.relationshipType === body.relationshipType) {
          return Response.json({ error: 'Relationship already exists' }, { status: 409 })
        }
      }
      // Also check reverse direction (B->A with same type)
      const existingRevRels = await this.ctx.storage.list<ContactRelationship>({ prefix: `relrev:${contactIdA}:` })
      for (const [, rel] of existingRevRels) {
        if (rel.contactIdA === body.contactIdB && rel.relationshipType === body.relationshipType) {
          return Response.json({ error: 'Relationship already exists' }, { status: 409 })
        }
      }

      const relationship: ContactRelationship = {
        id: relId,
        hubId: req.headers.get('x-hub-id') ?? '',
        contactIdA,
        contactIdB: body.contactIdB,
        relationshipType: body.relationshipType,
        direction: body.direction ?? 'bidirectional',
        encryptedNotes: body.encryptedNotes,
        notesEnvelopes: body.notesEnvelopes,
        createdAt: now,
        createdBy: req.headers.get('x-pubkey') ?? '',
      }

      const puts: Record<string, unknown> = {
        [`rel:${contactIdA}:${relId}`]: relationship,
        [`relrev:${body.contactIdB}:${relId}`]: relationship,
      }
      await this.ctx.storage.put(puts)

      return Response.json(relationship, { status: 201 })
    })

    // --- Delete relationship ---
    this.router.delete('/contacts/:id/relationships/:relId', async (_req, { id: contactId, relId }) => {
      const rel = await this.ctx.storage.get<ContactRelationship>(`rel:${contactId}:${relId}`)
      if (rel) {
        await this.ctx.storage.delete([
          `rel:${contactId}:${relId}`,
          `relrev:${rel.contactIdB}:${relId}`,
        ])
        return Response.json({ deleted: true })
      }

      // Try reverse index (contact is contactIdB)
      const revRel = await this.ctx.storage.get<ContactRelationship>(`relrev:${contactId}:${relId}`)
      if (revRel) {
        await this.ctx.storage.delete([
          `rel:${revRel.contactIdA}:${relId}`,
          `relrev:${contactId}:${relId}`,
        ])
        return Response.json({ deleted: true })
      }

      return Response.json({ error: 'Relationship not found' }, { status: 404 })
    })

    // --- List relationships for a contact (both directions, deduplicated) ---
    this.router.get('/contacts/:id/relationships', async (_req, { id: contactId }) => {
      const outgoing = await this.ctx.storage.list<ContactRelationship>({ prefix: `rel:${contactId}:` })
      const incoming = await this.ctx.storage.list<ContactRelationship>({ prefix: `relrev:${contactId}:` })

      const seen = new Set<string>()
      const relationships: ContactRelationship[] = []

      for (const [, value] of outgoing) {
        if (!seen.has(value.id)) {
          seen.add(value.id)
          relationships.push(value)
        }
      }
      for (const [, value] of incoming) {
        if (!seen.has(value.id)) {
          seen.add(value.id)
          relationships.push(value)
        }
      }

      return Response.json({ relationships })
    })

    // --- List groups a contact belongs to ---
    this.router.get('/contacts/:id/groups', async (_req, { id: contactId }) => {
      const entries = await this.ctx.storage.list({ prefix: `contactgroups:${contactId}:` })
      const groups: AffinityGroup[] = []
      for (const [key] of entries) {
        const groupId = key.split(':')[2]
        const group = await this.ctx.storage.get<AffinityGroup>(`group:${groupId}`)
        if (group) groups.push(group)
      }
      return Response.json({ groups })
    })

    // =============================================
    // Affinity Groups
    // =============================================

    // --- List all groups ---
    this.router.get('/groups', async () => {
      const entries = await this.ctx.storage.list<AffinityGroup>({ prefix: 'group:' })
      const groups: AffinityGroup[] = []
      for (const [, value] of entries) groups.push(value)
      return Response.json({ groups })
    })

    // --- Create group ---
    this.router.post('/groups', async (req) => {
      const body = await req.json() as CreateAffinityGroupBody
      const id = crypto.randomUUID()
      const now = new Date().toISOString()

      // Verify all member contacts exist
      for (const member of body.members) {
        const contact = await this.ctx.storage.get<Contact>(`contact:${member.contactId}`)
        if (!contact) {
          return Response.json({ error: `Contact ${member.contactId} not found` }, { status: 404 })
        }
      }

      const group: AffinityGroup = {
        id,
        hubId: req.headers.get('x-hub-id') ?? '',
        encryptedDetails: body.encryptedDetails,
        detailEnvelopes: body.detailEnvelopes,
        memberCount: body.members.length,
        createdAt: now,
        updatedAt: now,
        createdBy: req.headers.get('x-pubkey') ?? '',
      }

      const puts: Record<string, unknown> = { [`group:${id}`]: group }
      for (const member of body.members) {
        puts[`groupmember:${id}:${member.contactId}`] = {
          role: member.role,
          isPrimary: member.isPrimary ?? false,
        }
        puts[`contactgroups:${member.contactId}:${id}`] = true
      }
      await this.ctx.storage.put(puts)

      return Response.json(group, { status: 201 })
    })

    // --- Get group with members ---
    this.router.get('/groups/:id', async (_req, { id }) => {
      const group = await this.ctx.storage.get<AffinityGroup>(`group:${id}`)
      if (!group) return Response.json({ error: 'Group not found' }, { status: 404 })

      const memberEntries = await this.ctx.storage.list<{ role?: string; isPrimary: boolean }>({
        prefix: `groupmember:${id}:`,
      })
      const members: Array<{ contactId: string; role?: string; isPrimary: boolean }> = []
      for (const [key, value] of memberEntries) {
        const contactId = key.split(':')[2]
        members.push({ contactId, ...value })
      }

      return Response.json({ ...group, members })
    })

    // --- Update group ---
    this.router.patch('/groups/:id', async (req, { id }) => {
      const existing = await this.ctx.storage.get<AffinityGroup>(`group:${id}`)
      if (!existing) return Response.json({ error: 'Group not found' }, { status: 404 })

      const body = await req.json() as UpdateAffinityGroupBody
      const updated: AffinityGroup = {
        ...existing,
        ...(body.encryptedDetails !== undefined ? { encryptedDetails: body.encryptedDetails } : {}),
        ...(body.detailEnvelopes !== undefined ? { detailEnvelopes: body.detailEnvelopes } : {}),
        updatedAt: new Date().toISOString(),
      }
      await this.ctx.storage.put(`group:${id}`, updated)
      return Response.json(updated)
    })

    // --- Delete group ---
    this.router.delete('/groups/:id', async (_req, { id }) => {
      const group = await this.ctx.storage.get<AffinityGroup>(`group:${id}`)
      if (!group) return Response.json({ error: 'Group not found' }, { status: 404 })

      const deletes: string[] = [`group:${id}`]

      // Clean up member indexes
      const memberEntries = await this.ctx.storage.list({ prefix: `groupmember:${id}:` })
      for (const [key] of memberEntries) {
        const contactId = key.split(':')[2]
        deletes.push(key)
        deletes.push(`contactgroups:${contactId}:${id}`)
      }

      await this.ctx.storage.delete(deletes)
      return Response.json({ deleted: true })
    })

    // --- Add member to group ---
    this.router.post('/groups/:id/members', async (req, { id: groupId }) => {
      const group = await this.ctx.storage.get<AffinityGroup>(`group:${groupId}`)
      if (!group) return Response.json({ error: 'Group not found' }, { status: 404 })

      const body = await req.json() as AddGroupMemberBody
      const contact = await this.ctx.storage.get<Contact>(`contact:${body.contactId}`)
      if (!contact) return Response.json({ error: 'Contact not found' }, { status: 404 })

      // Check if already a member
      const existing = await this.ctx.storage.get(`groupmember:${groupId}:${body.contactId}`)
      if (existing !== undefined) {
        return Response.json({ error: 'Contact is already a member of this group' }, { status: 409 })
      }

      const puts: Record<string, unknown> = {
        [`groupmember:${groupId}:${body.contactId}`]: {
          role: body.role,
          isPrimary: body.isPrimary ?? false,
        },
        [`contactgroups:${body.contactId}:${groupId}`]: true,
      }

      group.memberCount++
      group.updatedAt = new Date().toISOString()
      puts[`group:${groupId}`] = group

      await this.ctx.storage.put(puts)

      return Response.json({ added: true, memberCount: group.memberCount }, { status: 201 })
    })

    // --- Remove member from group ---
    this.router.delete('/groups/:id/members/:contactId', async (_req, { id: groupId, contactId }) => {
      const group = await this.ctx.storage.get<AffinityGroup>(`group:${groupId}`)
      if (!group) return Response.json({ error: 'Group not found' }, { status: 404 })

      const member = await this.ctx.storage.get(`groupmember:${groupId}:${contactId}`)
      if (member === undefined) {
        return Response.json({ error: 'Member not found in group' }, { status: 404 })
      }

      group.memberCount = Math.max(0, group.memberCount - 1)
      group.updatedAt = new Date().toISOString()

      await this.ctx.storage.delete([
        `groupmember:${groupId}:${contactId}`,
        `contactgroups:${contactId}:${groupId}`,
      ])
      await this.ctx.storage.put(`group:${groupId}`, group)

      return Response.json({ removed: true, memberCount: group.memberCount })
    })

    // --- List members of a group ---
    this.router.get('/groups/:id/members', async (_req, { id }) => {
      const group = await this.ctx.storage.get<AffinityGroup>(`group:${id}`)
      if (!group) return Response.json({ error: 'Group not found' }, { status: 404 })

      const memberEntries = await this.ctx.storage.list<{ role?: string; isPrimary: boolean }>({
        prefix: `groupmember:${id}:`,
      })
      const members: Array<{ contactId: string; role?: string; isPrimary: boolean }> = []
      for (const [key, value] of memberEntries) {
        const contactId = key.split(':')[2]
        members.push({ contactId, ...value })
      }

      return Response.json({ members })
    })

    // --- Test Reset (demo/development only) ---
    this.router.post('/reset', async () => {
      if (this.env.DEMO_MODE !== 'true' && this.env.ENVIRONMENT !== 'development') {
        return new Response('Reset not allowed outside demo/development mode', { status: 403 })
      }
      await this.ctx.storage.deleteAll()
      return Response.json({ ok: true })
    })
  }

  async fetch(request: Request): Promise<Response> {
    return this.router.handle(request)
  }
}
