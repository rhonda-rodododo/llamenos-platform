import { DurableObject } from 'cloudflare:workers'
import type { Env } from '../types'
import type { CaseRecord, CreateRecordBody, RecordContact } from '@protocol/schemas/records'
import type { Event, CreateEventBody, CaseEvent, ReportEvent } from '@protocol/schemas/events'
import type { CaseInteraction, CreateInteractionBody } from '@protocol/schemas/interactions'
import type { EvidenceMetadata, CustodyEntry } from '@protocol/schemas/evidence'
import type { ReportCaseLink } from '@protocol/schemas/report-links'
import { DORouter } from '../lib/do-router'
import { parseBlindIndexFilters, matchesBlindIndexFilters } from '../lib/blind-index-query'

/**
 * CaseDO — per-hub E2EE case/record/event storage.
 *
 * Stores records (instances of entity types) with 3-tier encryption:
 * - Summary: title, status, category (visible to anyone with cases:read)
 * - Fields: custom field values (visible to case participants)
 * - PII: sensitive identifiers (restricted access)
 *
 * Stores events (records with category='event') with E2EE details,
 * time ranges, location privacy, and sub-event hierarchies.
 *
 * Maintains indexes for fast server-side filtering:
 * - idx:status:{statusHash}:{recordId} → true
 * - idx:severity:{severityHash}:{recordId} → true
 * - idx:assigned:{pubkey}:{recordId} → true
 * - idx:type:{entityTypeId}:{recordId} → true
 * - idx:number:{caseNumber} → recordId
 * - idx:eventtype:{typeHash}:{eventId} → true
 * - idx:eventstatus:{statusHash}:{eventId} → true
 * - idx:eventparent:{parentId}:{eventId} → true
 *
 * Contact linking (M:N with role metadata):
 * - recordcontact:{recordId}:{contactId} → RecordContact
 * - contactrecords:{contactId}:{recordId} → RecordContact (reverse index)
 *
 * Event linking (M:N):
 * - caseevent:{recordId}:{eventId} → CaseEvent
 * - eventcases:{eventId}:{recordId} → CaseEvent (reverse index)
 * - reportevent:{reportId}:{eventId} → ReportEvent
 * - eventreports:{eventId}:{reportId} → ReportEvent (reverse index)
 *
 * Report-case linking (M:N):
 * - reportcase:{reportId}:{caseId} → ReportCaseLink
 * - casereports:{caseId}:{reportId} → ReportCaseLink (reverse index)
 *
 * Interaction timeline (chronological per record):
 * - interaction:{caseId}:{interactionId} → CaseInteraction
 * - idx:interaction:type:{typeHash}:{caseId}:{interactionId} → true (type filter)
 * - idx:interaction:source:{sourceId} → { caseId, interactionId } (reverse lookup)
 * - idx:interaction:time:{caseId}:{ISO timestamp}:{interactionId} → true (chronological)
 *
 * Storage keys:
 * - record:{uuid} → CaseRecord
 * - event:{uuid} → Event
 */
export class CaseDO extends DurableObject<Env> {
  private router: DORouter

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.router = new DORouter()
    this.setupRoutes()
  }

  private setupRoutes() {
    this.setupRecordRoutes()
    this.setupReportCaseLinkRoutes()
    this.setupInteractionRoutes()
    this.setupEvidenceRoutes()
    this.setupEventRoutes()
    this.setupResetRoute()
  }

  // ============================================================
  // Record Routes
  // ============================================================

  private setupRecordRoutes() {
    // --- List records (paginated, with blind index + entity type + assignment filters) ---
    this.router.get('/records', async (req) => {
      const url = new URL(req.url)
      const page = parseInt(url.searchParams.get('page') ?? '1')
      const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '20'), 100)
      const entityTypeId = url.searchParams.get('entityTypeId')
      const assignedToFilter = url.searchParams.get('assignedTo')
      const parentRecordId = url.searchParams.get('parentRecordId')
      const filters = parseBlindIndexFilters(url.searchParams)

      // Use entity type index for efficient filtering when entityTypeId is specified
      let candidateIds: Set<string> | null = null

      if (entityTypeId) {
        const typeKeys = await this.ctx.storage.list<boolean>({ prefix: `idx:type:${entityTypeId}:` })
        candidateIds = new Set<string>()
        for (const [key] of typeKeys) {
          const parts = key.split(':')
          candidateIds.add(parts[parts.length - 1])
        }
      }

      if (assignedToFilter) {
        const assignedKeys = await this.ctx.storage.list<boolean>({ prefix: `idx:assigned:${assignedToFilter}:` })
        const assignedIds = new Set<string>()
        for (const [key] of assignedKeys) {
          const parts = key.split(':')
          assignedIds.add(parts[parts.length - 1])
        }
        if (candidateIds) {
          // Intersect with entity type candidates
          candidateIds = new Set([...candidateIds].filter(id => assignedIds.has(id)))
        } else {
          candidateIds = assignedIds
        }
      }

      // Fetch records — either from candidate set or full scan
      const records: CaseRecord[] = []

      if (candidateIds !== null) {
        // Fetch specific records by ID
        for (const id of candidateIds) {
          const record = await this.ctx.storage.get<CaseRecord>(`record:${id}`)
          if (!record) continue
          if (parentRecordId !== null && parentRecordId !== undefined && record.parentRecordId !== parentRecordId) continue
          if (filters.size > 0 && !matchesBlindIndexFilters(record.blindIndexes ?? {}, filters)) continue
          // Also check top-level hash fields against filters
          if (!this.matchesTopLevelFilters(record, filters)) continue
          records.push(record)
        }
      } else {
        // Full scan (no entity type or assignment filter)
        const allKeys = await this.ctx.storage.list<CaseRecord>({ prefix: 'record:', limit: 1000 })
        for (const [, record] of allKeys) {
          if (parentRecordId !== null && parentRecordId !== undefined && record.parentRecordId !== parentRecordId) continue
          if (filters.size > 0 && !matchesBlindIndexFilters(record.blindIndexes ?? {}, filters)) continue
          if (!this.matchesTopLevelFilters(record, filters)) continue
          records.push(record)
        }
      }

      // Sort by updatedAt descending (most recently updated first)
      records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

      const start = (page - 1) * limit
      const paged = records.slice(start, start + limit)

      return Response.json({
        records: paged,
        total: records.length,
        page,
        limit,
        hasMore: start + limit < records.length,
      })
    })

    // --- Get single record ---
    this.router.get('/records/:id', async (_req, { id }) => {
      const record = await this.ctx.storage.get<CaseRecord>(`record:${id}`)
      if (!record) return Response.json({ error: 'Record not found' }, { status: 404 })
      return Response.json(record)
    })

    // --- Lookup by case number ---
    this.router.get('/records/by-number/:number', async (_req, { number }) => {
      const recordId = await this.ctx.storage.get<string>(`idx:number:${number}`)
      if (!recordId) return Response.json({ error: 'Record not found' }, { status: 404 })
      const record = await this.ctx.storage.get<CaseRecord>(`record:${recordId}`)
      if (!record) return Response.json({ error: 'Record not found' }, { status: 404 })
      return Response.json(record)
    })

    // --- List records linked to a contact (Epic 326 — screen pop) ---
    this.router.get('/records/by-contact/:contactId', async (_req, { contactId }) => {
      const links = await this.ctx.storage.list<RecordContact>({
        prefix: `contactrecords:${contactId}:`,
      })

      const records: CaseRecord[] = []
      for (const [key] of links) {
        const parts = key.split(':')
        const recordId = parts[parts.length - 1]
        const record = await this.ctx.storage.get<CaseRecord>(`record:${recordId}`)
        if (record && !record.closedAt) {
          records.push(record)
        }
      }

      // Sort by updatedAt descending
      records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

      return Response.json({
        records,
        total: records.length,
      })
    })

    // --- Create record ---
    this.router.post('/records', async (req) => {
      const body = await req.json() as CreateRecordBody & { hubId?: string; createdBy?: string; caseNumber?: string }
      const id = crypto.randomUUID()
      const now = new Date().toISOString()

      const record: CaseRecord = {
        id,
        hubId: body.hubId ?? '',
        entityTypeId: body.entityTypeId,
        caseNumber: body.caseNumber,
        statusHash: body.statusHash,
        severityHash: body.severityHash,
        categoryHash: body.categoryHash,
        assignedTo: body.assignedTo ?? [],
        blindIndexes: body.blindIndexes ?? {},
        encryptedSummary: body.encryptedSummary,
        summaryEnvelopes: body.summaryEnvelopes,
        encryptedFields: body.encryptedFields,
        fieldEnvelopes: body.fieldEnvelopes,
        encryptedPII: body.encryptedPII,
        piiEnvelopes: body.piiEnvelopes,
        contactCount: 0,
        interactionCount: 0,
        fileCount: 0,
        reportCount: 0,
        eventIds: [],
        reportIds: [],
        parentRecordId: body.parentRecordId,
        createdAt: now,
        updatedAt: now,
        createdBy: body.createdBy ?? '',
      }

      // Build all storage writes atomically
      const puts = new Map<string, unknown>()
      puts.set(`record:${id}`, record)

      // Status index
      puts.set(`idx:status:${record.statusHash}:${id}`, true)

      // Severity index
      if (record.severityHash) {
        puts.set(`idx:severity:${record.severityHash}:${id}`, true)
      }

      // Entity type index
      puts.set(`idx:type:${record.entityTypeId}:${id}`, true)

      // Assignment indexes
      for (const pubkey of record.assignedTo) {
        puts.set(`idx:assigned:${pubkey}:${id}`, true)
      }

      // Case number index
      if (record.caseNumber) {
        puts.set(`idx:number:${record.caseNumber}`, id)
      }

      // Contact links (created atomically with the record)
      if (body.contactLinks) {
        for (const link of body.contactLinks) {
          const rc: RecordContact = {
            recordId: id,
            contactId: link.contactId,
            role: link.role,
            addedAt: now,
            addedBy: record.createdBy,
          }
          puts.set(`recordcontact:${id}:${link.contactId}`, rc)
          puts.set(`contactrecords:${link.contactId}:${id}`, rc)
        }
        record.contactCount = body.contactLinks.length
        puts.set(`record:${id}`, record) // Update with correct contactCount
      }

      await this.ctx.storage.put(Object.fromEntries(puts))

      return Response.json(record, { status: 201 })
    })

    // --- Update record ---
    this.router.patch('/records/:id', async (req, { id }) => {
      const existing = await this.ctx.storage.get<CaseRecord>(`record:${id}`)
      if (!existing) return Response.json({ error: 'Record not found' }, { status: 404 })

      const body = await req.json() as Partial<CreateRecordBody> & {
        // Status change interaction metadata (optional, for auto-creating status_change interactions)
        statusChangeTypeHash?: string
        statusChangeContent?: string
        statusChangeEnvelopes?: CaseInteraction['contentEnvelopes']
        // Record closure (Epic 326 — used by by-contact filter)
        closedAt?: string
      }
      const now = new Date().toISOString()

      const updated: CaseRecord = {
        ...existing,
        ...body,
        id, // Prevent ID override
        hubId: existing.hubId, // Prevent hubId override
        createdAt: existing.createdAt, // Preserve creation timestamp
        createdBy: existing.createdBy, // Preserve creator
        updatedAt: now,
        // Preserve counters
        contactCount: existing.contactCount,
        interactionCount: existing.interactionCount,
        fileCount: existing.fileCount,
        eventIds: existing.eventIds,
        // Ensure required fields exist
        assignedTo: body.assignedTo ?? existing.assignedTo,
        blindIndexes: body.blindIndexes ?? existing.blindIndexes,
        statusHash: body.statusHash ?? existing.statusHash,
        encryptedSummary: body.encryptedSummary ?? existing.encryptedSummary,
        summaryEnvelopes: body.summaryEnvelopes ?? existing.summaryEnvelopes,
      }

      const puts = new Map<string, unknown>()
      const deletes: string[] = []

      // Re-index status if changed
      if (body.statusHash && body.statusHash !== existing.statusHash) {
        deletes.push(`idx:status:${existing.statusHash}:${id}`)
        puts.set(`idx:status:${body.statusHash}:${id}`, true)
      }

      // Re-index severity if changed
      if (body.severityHash !== undefined) {
        if (existing.severityHash) {
          deletes.push(`idx:severity:${existing.severityHash}:${id}`)
        }
        if (body.severityHash) {
          puts.set(`idx:severity:${body.severityHash}:${id}`, true)
        }
      }

      // Re-index category if changed (stored in blindIndexes, but also as top-level)
      if (body.categoryHash !== undefined) {
        if (existing.categoryHash) {
          deletes.push(`idx:category:${existing.categoryHash}:${id}`)
        }
        if (body.categoryHash) {
          puts.set(`idx:category:${body.categoryHash}:${id}`, true)
        }
      }

      // Re-index assignments if changed
      if (body.assignedTo) {
        // Remove old assignment indexes
        for (const pubkey of existing.assignedTo) {
          deletes.push(`idx:assigned:${pubkey}:${id}`)
        }
        // Add new assignment indexes
        for (const pubkey of body.assignedTo) {
          puts.set(`idx:assigned:${pubkey}:${id}`, true)
        }
      }

      // Auto-create status_change interaction when status changes
      if (body.statusHash && body.statusHash !== existing.statusHash) {
        const interactionId = crypto.randomUUID()
        const authorPubkey = req.headers.get('x-pubkey') ?? ''
        const statusInteraction: CaseInteraction = {
          id: interactionId,
          caseId: id,
          interactionType: 'status_change',
          authorPubkey,
          interactionTypeHash: body.statusChangeTypeHash ?? '',
          createdAt: now,
          previousStatusHash: existing.statusHash,
          newStatusHash: body.statusHash,
          encryptedContent: body.statusChangeContent,
          contentEnvelopes: body.statusChangeEnvelopes,
        }

        puts.set(`interaction:${id}:${interactionId}`, statusInteraction)
        puts.set(`idx:interaction:time:${id}:${now}:${interactionId}`, true)
        if (body.statusChangeTypeHash) {
          puts.set(`idx:interaction:type:${body.statusChangeTypeHash}:${id}:${interactionId}`, true)
        }
        updated.interactionCount = (updated.interactionCount ?? 0) + 1
      }

      puts.set(`record:${id}`, updated)

      if (deletes.length > 0) {
        await this.ctx.storage.delete(deletes)
      }
      await this.ctx.storage.put(Object.fromEntries(puts))

      return Response.json(updated)
    })

    // --- Delete record ---
    this.router.delete('/records/:id', async (_req, { id }) => {
      const existing = await this.ctx.storage.get<CaseRecord>(`record:${id}`)
      if (!existing) return Response.json({ error: 'Record not found' }, { status: 404 })

      const deletes: string[] = [`record:${id}`]

      // Remove status index
      deletes.push(`idx:status:${existing.statusHash}:${id}`)

      // Remove severity index
      if (existing.severityHash) {
        deletes.push(`idx:severity:${existing.severityHash}:${id}`)
      }

      // Remove entity type index
      deletes.push(`idx:type:${existing.entityTypeId}:${id}`)

      // Remove assignment indexes
      for (const pubkey of existing.assignedTo) {
        deletes.push(`idx:assigned:${pubkey}:${id}`)
      }

      // Remove case number index
      if (existing.caseNumber) {
        deletes.push(`idx:number:${existing.caseNumber}`)
      }

      // Remove contact links (both directions)
      const recordContacts = await this.ctx.storage.list({ prefix: `recordcontact:${id}:` })
      for (const [key, value] of recordContacts) {
        deletes.push(key)
        const rc = value as RecordContact
        deletes.push(`contactrecords:${rc.contactId}:${id}`)
      }

      // Remove event links (both directions)
      const caseEventLinks = await this.ctx.storage.list<CaseEvent>({ prefix: `caseevent:${id}:` })
      for (const [key, link] of caseEventLinks) {
        deletes.push(key)
        deletes.push(`eventcases:${link.eventId}:${id}`)
        // Decrement event caseCount
        const event = await this.ctx.storage.get<Event>(`event:${link.eventId}`)
        if (event) {
          event.caseCount = Math.max(0, event.caseCount - 1)
          event.updatedAt = new Date().toISOString()
          await this.ctx.storage.put(`event:${link.eventId}`, event)
        }
      }

      // Remove report-case links (both directions)
      const reportCaseLinks = await this.ctx.storage.list<ReportCaseLink>({ prefix: `casereports:${id}:` })
      for (const [key, link] of reportCaseLinks) {
        deletes.push(key)
        deletes.push(`reportcase:${link.reportId}:${id}`)
      }

      await this.ctx.storage.delete(deletes)

      return Response.json({ deleted: true })
    })

    // --- Link contact to record ---
    this.router.post('/records/:id/contacts', async (req, { id }) => {
      const record = await this.ctx.storage.get<CaseRecord>(`record:${id}`)
      if (!record) return Response.json({ error: 'Record not found' }, { status: 404 })

      const body = await req.json() as { contactId: string; role: string; addedBy: string }
      const now = new Date().toISOString()

      const rc: RecordContact = {
        recordId: id,
        contactId: body.contactId,
        role: body.role,
        addedAt: now,
        addedBy: body.addedBy,
      }

      const puts = new Map<string, unknown>()
      puts.set(`recordcontact:${id}:${body.contactId}`, rc)
      puts.set(`contactrecords:${body.contactId}:${id}`, rc)

      // Update contact count
      record.contactCount++
      record.updatedAt = now
      puts.set(`record:${id}`, record)

      await this.ctx.storage.put(Object.fromEntries(puts))

      return Response.json(rc, { status: 201 })
    })

    // --- Unlink contact from record ---
    this.router.delete('/records/:id/contacts/:contactId', async (_req, { id, contactId }) => {
      const record = await this.ctx.storage.get<CaseRecord>(`record:${id}`)
      if (!record) return Response.json({ error: 'Record not found' }, { status: 404 })

      const rc = await this.ctx.storage.get<RecordContact>(`recordcontact:${id}:${contactId}`)
      if (!rc) return Response.json({ error: 'Contact link not found' }, { status: 404 })

      const deletes = [
        `recordcontact:${id}:${contactId}`,
        `contactrecords:${contactId}:${id}`,
      ]

      // Update contact count
      record.contactCount = Math.max(0, record.contactCount - 1)
      record.updatedAt = new Date().toISOString()

      await this.ctx.storage.delete(deletes)
      await this.ctx.storage.put(`record:${id}`, record)

      return Response.json({ deleted: true })
    })

    // --- List contacts linked to a record ---
    this.router.get('/records/:id/contacts', async (_req, { id }) => {
      const record = await this.ctx.storage.get<CaseRecord>(`record:${id}`)
      if (!record) return Response.json({ error: 'Record not found' }, { status: 404 })

      const links = await this.ctx.storage.list<RecordContact>({ prefix: `recordcontact:${id}:` })
      const contacts: RecordContact[] = []
      for (const [, rc] of links) {
        contacts.push(rc)
      }

      return Response.json({ contacts })
    })

    // --- List events linked to a record ---
    this.router.get('/records/:id/events', async (_req, { id }) => {
      const record = await this.ctx.storage.get<CaseRecord>(`record:${id}`)
      if (!record) return Response.json({ error: 'Record not found' }, { status: 404 })

      const links = await this.ctx.storage.list<CaseEvent>({ prefix: `caseevent:${id}:` })
      const result: CaseEvent[] = []
      for (const [, link] of links) {
        result.push(link)
      }

      return Response.json({ links: result })
    })

    // --- Link event to record (from record side) ---
    this.router.post('/records/:id/events', async (req, { id }) => {
      const record = await this.ctx.storage.get<CaseRecord>(`record:${id}`)
      if (!record) return Response.json({ error: 'Record not found' }, { status: 404 })

      const body = await req.json() as { eventId: string; linkedBy: string }
      const event = await this.ctx.storage.get<Event>(`event:${body.eventId}`)
      if (!event) return Response.json({ error: 'Event not found' }, { status: 404 })

      // Check for existing link
      const existing = await this.ctx.storage.get<CaseEvent>(`caseevent:${id}:${body.eventId}`)
      if (existing) return Response.json({ error: 'Already linked' }, { status: 409 })

      const now = new Date().toISOString()
      const link: CaseEvent = {
        recordId: id,
        eventId: body.eventId,
        linkedAt: now,
        linkedBy: body.linkedBy,
      }

      const puts = new Map<string, unknown>()
      puts.set(`caseevent:${id}:${body.eventId}`, link)
      puts.set(`eventcases:${body.eventId}:${id}`, link)

      // Update event caseCount
      event.caseCount = (event.caseCount ?? 0) + 1
      event.updatedAt = now
      puts.set(`event:${body.eventId}`, event)

      // Update record eventIds
      record.eventIds = [...(record.eventIds ?? []), body.eventId]
      record.updatedAt = now
      puts.set(`record:${id}`, record)

      await this.ctx.storage.put(Object.fromEntries(puts))

      return Response.json(link, { status: 201 })
    })

    // --- Unlink event from record (from record side) ---
    this.router.delete('/records/:id/events/:eventId', async (_req, { id, eventId }) => {
      const link = await this.ctx.storage.get<CaseEvent>(`caseevent:${id}:${eventId}`)
      if (!link) return Response.json({ error: 'Link not found' }, { status: 404 })

      const deletes = [
        `caseevent:${id}:${eventId}`,
        `eventcases:${eventId}:${id}`,
      ]

      // Update event caseCount
      const event = await this.ctx.storage.get<Event>(`event:${eventId}`)
      if (event) {
        event.caseCount = Math.max(0, event.caseCount - 1)
        event.updatedAt = new Date().toISOString()
        await this.ctx.storage.put(`event:${eventId}`, event)
      }

      // Update record eventIds
      const record = await this.ctx.storage.get<CaseRecord>(`record:${id}`)
      if (record) {
        record.eventIds = (record.eventIds ?? []).filter(eid => eid !== eventId)
        record.updatedAt = new Date().toISOString()
        await this.ctx.storage.put(`record:${id}`, record)
      }

      await this.ctx.storage.delete(deletes)

      return Response.json({ deleted: true })
    })

    // --- Assign volunteers to record ---
    this.router.post('/records/:id/assign', async (req, { id }) => {
      const record = await this.ctx.storage.get<CaseRecord>(`record:${id}`)
      if (!record) return Response.json({ error: 'Record not found' }, { status: 404 })

      const body = await req.json() as { pubkeys: string[] }
      const puts = new Map<string, unknown>()

      // Add new pubkeys (dedup with existing)
      const existingSet = new Set(record.assignedTo)
      for (const pubkey of body.pubkeys) {
        if (!existingSet.has(pubkey)) {
          record.assignedTo.push(pubkey)
          puts.set(`idx:assigned:${pubkey}:${id}`, true)
        }
      }

      record.updatedAt = new Date().toISOString()
      puts.set(`record:${id}`, record)

      await this.ctx.storage.put(Object.fromEntries(puts))

      return Response.json({ assignedTo: record.assignedTo })
    })

    // --- Unassign volunteer from record ---
    this.router.post('/records/:id/unassign', async (req, { id }) => {
      const record = await this.ctx.storage.get<CaseRecord>(`record:${id}`)
      if (!record) return Response.json({ error: 'Record not found' }, { status: 404 })

      const body = await req.json() as { pubkey: string }

      // Remove pubkey from assignedTo
      const idx = record.assignedTo.indexOf(body.pubkey)
      if (idx === -1) return Response.json({ error: 'Pubkey not assigned' }, { status: 404 })

      record.assignedTo.splice(idx, 1)
      record.updatedAt = new Date().toISOString()

      // Remove assignment index
      await this.ctx.storage.delete(`idx:assigned:${body.pubkey}:${id}`)
      await this.ctx.storage.put(`record:${id}`, record)

      return Response.json({ assignedTo: record.assignedTo })
    })

    // --- Count records assigned to a volunteer (Epic 340 — lightweight) ---
    this.router.get('/records/count-by-assignment/:pubkey', async (_req, { pubkey }) => {
      const assignedKeys = await this.ctx.storage.list<boolean>({ prefix: `idx:assigned:${pubkey}:` })
      return Response.json({ pubkey, count: assignedKeys.size })
    })
  }

  // ============================================================
  // Interaction Routes
  // ============================================================

  private setupInteractionRoutes() {
    // --- List interactions for a case (chronological) ---
    this.router.get('/records/:caseId/interactions', async (req, { caseId }) => {
      const record = await this.ctx.storage.get<CaseRecord>(`record:${caseId}`)
      if (!record) return Response.json({ error: 'Record not found' }, { status: 404 })

      const url = new URL(req.url)
      const page = parseInt(url.searchParams.get('page') ?? '1')
      const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50'), 100)
      const typeHash = url.searchParams.get('interactionTypeHash')
      const after = url.searchParams.get('after')
      const before = url.searchParams.get('before')

      // Use time index for chronological ordering
      const prefix = `idx:interaction:time:${caseId}:`
      const listOpts: { prefix: string; limit: number; start?: string; end?: string } = {
        prefix,
        limit: 1000,
      }
      if (after) listOpts.start = `${prefix}${after}`
      if (before) listOpts.end = `${prefix}${before}`

      const timeEntries = await this.ctx.storage.list(listOpts)

      // Collect interaction IDs in chronological order
      const interactionKeys: string[] = []
      for (const [key] of timeEntries) {
        const parts = key.split(':')
        const interactionId = parts[parts.length - 1]
        interactionKeys.push(`interaction:${caseId}:${interactionId}`)
      }

      // Fetch interactions
      let interactions: CaseInteraction[] = []
      if (interactionKeys.length > 0) {
        const entries = await this.ctx.storage.get<CaseInteraction>(interactionKeys)
        for (const [, value] of entries) {
          if (value) interactions.push(value)
        }
      }

      // Filter by type if specified
      if (typeHash) {
        interactions = interactions.filter(i => i.interactionTypeHash === typeHash)
      }

      // Sort chronologically (oldest first)
      interactions.sort((a, b) => a.createdAt.localeCompare(b.createdAt))

      // Paginate
      const start = (page - 1) * limit
      const paged = interactions.slice(start, start + limit)

      return Response.json({
        interactions: paged,
        total: interactions.length,
        page,
        limit,
        hasMore: start + limit < interactions.length,
      })
    })

    // --- Create interaction ---
    this.router.post('/records/:caseId/interactions', async (req, { caseId }) => {
      const record = await this.ctx.storage.get<CaseRecord>(`record:${caseId}`)
      if (!record) return Response.json({ error: 'Record not found' }, { status: 404 })

      const body = await req.json() as CreateInteractionBody
      const id = crypto.randomUUID()
      const now = new Date().toISOString()

      const interaction: CaseInteraction = {
        id,
        caseId,
        interactionType: body.interactionType,
        sourceId: body.sourceId,
        encryptedContent: body.encryptedContent,
        contentEnvelopes: body.contentEnvelopes,
        authorPubkey: req.headers.get('x-pubkey') ?? '',
        interactionTypeHash: body.interactionTypeHash,
        createdAt: now,
        previousStatusHash: body.previousStatusHash,
        newStatusHash: body.newStatusHash,
      }

      // Build all storage writes atomically
      const puts = new Map<string, unknown>()
      puts.set(`interaction:${caseId}:${id}`, interaction)
      puts.set(`idx:interaction:type:${body.interactionTypeHash}:${caseId}:${id}`, true)
      puts.set(`idx:interaction:time:${caseId}:${now}:${id}`, true)

      if (body.sourceId) {
        puts.set(`idx:interaction:source:${body.sourceId}`, { caseId, interactionId: id })
      }

      // Update record interaction count
      record.interactionCount = (record.interactionCount ?? 0) + 1
      record.updatedAt = now
      puts.set(`record:${caseId}`, record)

      await this.ctx.storage.put(Object.fromEntries(puts))

      return Response.json(interaction, { status: 201 })
    })

    // --- Delete interaction ---
    this.router.delete('/records/:caseId/interactions/:interactionId', async (_req, { caseId, interactionId }) => {
      const interaction = await this.ctx.storage.get<CaseInteraction>(`interaction:${caseId}:${interactionId}`)
      if (!interaction) return Response.json({ error: 'Interaction not found' }, { status: 404 })

      const deletes: string[] = [
        `interaction:${caseId}:${interactionId}`,
        `idx:interaction:type:${interaction.interactionTypeHash}:${caseId}:${interactionId}`,
        `idx:interaction:time:${caseId}:${interaction.createdAt}:${interactionId}`,
      ]

      if (interaction.sourceId) {
        deletes.push(`idx:interaction:source:${interaction.sourceId}`)
      }

      // Update record interaction count
      const record = await this.ctx.storage.get<CaseRecord>(`record:${caseId}`)
      if (record) {
        record.interactionCount = Math.max(0, record.interactionCount - 1)
        record.updatedAt = new Date().toISOString()
        await this.ctx.storage.put(`record:${caseId}`, record)
      }

      await this.ctx.storage.delete(deletes)

      return Response.json({ deleted: true })
    })

    // --- Check if a source entity is already linked to a case ---
    this.router.get('/interactions/by-source/:sourceId', async (_req, { sourceId }) => {
      const entry = await this.ctx.storage.get<{ caseId: string; interactionId: string }>(
        `idx:interaction:source:${sourceId}`,
      )
      if (!entry) return Response.json({ linked: false })
      return Response.json({ linked: true, caseId: entry.caseId, interactionId: entry.interactionId })
    })
  }

  // ============================================================
  // Event Routes
  // ============================================================

  private setupEventRoutes() {
    // --- List events (paginated, with blind index + date range + parent filters) ---
    this.router.get('/events', async (req) => {
      const url = new URL(req.url)
      const page = parseInt(url.searchParams.get('page') ?? '1')
      const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '20'), 100)
      const eventTypeHash = url.searchParams.get('eventTypeHash')
      const statusHash = url.searchParams.get('statusHash')
      const parentEventId = url.searchParams.get('parentEventId')
      const startAfter = url.searchParams.get('startAfter')
      const startBefore = url.searchParams.get('startBefore')
      const filters = parseBlindIndexFilters(url.searchParams)

      // Use event type index for efficient filtering
      let candidateIds: Set<string> | null = null

      if (eventTypeHash) {
        const typeKeys = await this.ctx.storage.list<boolean>({ prefix: `idx:eventtype:${eventTypeHash}:` })
        candidateIds = new Set<string>()
        for (const [key] of typeKeys) {
          const parts = key.split(':')
          candidateIds.add(parts[parts.length - 1])
        }
      }

      if (statusHash && !eventTypeHash) {
        // Use status index only if eventType wasn't used (avoid double index scan)
        const statusKeys = await this.ctx.storage.list<boolean>({ prefix: `idx:eventstatus:${statusHash}:` })
        candidateIds = new Set<string>()
        for (const [key] of statusKeys) {
          const parts = key.split(':')
          candidateIds.add(parts[parts.length - 1])
        }
      }

      if (parentEventId) {
        const parentKeys = await this.ctx.storage.list<boolean>({ prefix: `idx:eventparent:${parentEventId}:` })
        const parentIds = new Set<string>()
        for (const [key] of parentKeys) {
          const parts = key.split(':')
          parentIds.add(parts[parts.length - 1])
        }
        if (candidateIds) {
          candidateIds = new Set([...candidateIds].filter(id => parentIds.has(id)))
        } else {
          candidateIds = parentIds
        }
      }

      const events: Event[] = []

      if (candidateIds !== null) {
        for (const id of candidateIds) {
          const event = await this.ctx.storage.get<Event>(`event:${id}`)
          if (!event) continue
          if (!this.matchesEventFilters(event, statusHash, startAfter, startBefore, filters)) continue
          events.push(event)
        }
      } else {
        const allEvents = await this.ctx.storage.list<Event>({ prefix: 'event:', limit: 1000 })
        for (const [, event] of allEvents) {
          if (!this.matchesEventFilters(event, statusHash, startAfter, startBefore, filters)) continue
          events.push(event)
        }
      }

      // Sort by startDate descending (most recent first)
      events.sort((a, b) => b.startDate.localeCompare(a.startDate))

      const start = (page - 1) * limit
      const paged = events.slice(start, start + limit)

      return Response.json({
        events: paged,
        total: events.length,
        page,
        limit,
        hasMore: start + limit < events.length,
      })
    })

    // --- Get single event ---
    this.router.get('/events/:id', async (_req, { id }) => {
      const event = await this.ctx.storage.get<Event>(`event:${id}`)
      if (!event) return Response.json({ error: 'Event not found' }, { status: 404 })
      return Response.json(event)
    })

    // --- Create event ---
    this.router.post('/events', async (req) => {
      const body = await req.json() as CreateEventBody & { hubId?: string; createdBy?: string; caseNumber?: string }
      const id = crypto.randomUUID()
      const now = new Date().toISOString()

      const event: Event = {
        id,
        hubId: body.hubId ?? '',
        entityTypeId: body.entityTypeId,
        caseNumber: body.caseNumber,
        startDate: body.startDate,
        endDate: body.endDate,
        parentEventId: body.parentEventId,
        locationPrecision: body.locationPrecision ?? 'neighborhood',
        locationApproximate: body.locationApproximate,
        eventTypeHash: body.eventTypeHash,
        statusHash: body.statusHash,
        blindIndexes: body.blindIndexes ?? {},
        encryptedDetails: body.encryptedDetails,
        detailEnvelopes: body.detailEnvelopes,
        caseCount: 0,
        reportCount: 0,
        subEventCount: 0,
        createdAt: now,
        updatedAt: now,
        createdBy: body.createdBy ?? '',
      }

      const puts = new Map<string, unknown>()
      puts.set(`event:${id}`, event)

      // Event type index
      puts.set(`idx:eventtype:${event.eventTypeHash}:${id}`, true)

      // Event status index
      puts.set(`idx:eventstatus:${event.statusHash}:${id}`, true)

      // Parent event index (for sub-event queries)
      if (event.parentEventId) {
        puts.set(`idx:eventparent:${event.parentEventId}:${id}`, true)

        // Increment parent's subEventCount
        const parent = await this.ctx.storage.get<Event>(`event:${event.parentEventId}`)
        if (parent) {
          parent.subEventCount = (parent.subEventCount ?? 0) + 1
          parent.updatedAt = now
          puts.set(`event:${event.parentEventId}`, parent)
        }
      }

      // Case number index (events can have case numbers too)
      if (event.caseNumber) {
        puts.set(`idx:number:${event.caseNumber}`, id)
      }

      await this.ctx.storage.put(Object.fromEntries(puts))

      return Response.json(event, { status: 201 })
    })

    // --- Update event ---
    this.router.patch('/events/:id', async (req, { id }) => {
      const existing = await this.ctx.storage.get<Event>(`event:${id}`)
      if (!existing) return Response.json({ error: 'Event not found' }, { status: 404 })

      const body = await req.json() as Partial<CreateEventBody>
      const now = new Date().toISOString()

      const updated: Event = {
        ...existing,
        ...body,
        id, // Prevent ID override
        hubId: existing.hubId,
        createdAt: existing.createdAt,
        createdBy: existing.createdBy,
        updatedAt: now,
        // Preserve relationship counts
        caseCount: existing.caseCount,
        reportCount: existing.reportCount,
        subEventCount: existing.subEventCount,
        // Ensure required fields
        eventTypeHash: body.eventTypeHash ?? existing.eventTypeHash,
        statusHash: body.statusHash ?? existing.statusHash,
        startDate: body.startDate ?? existing.startDate,
        encryptedDetails: body.encryptedDetails ?? existing.encryptedDetails,
        detailEnvelopes: body.detailEnvelopes ?? existing.detailEnvelopes,
        blindIndexes: body.blindIndexes ?? existing.blindIndexes,
        locationPrecision: body.locationPrecision ?? existing.locationPrecision,
      }

      const puts = new Map<string, unknown>()
      const deletes: string[] = []

      // Re-index event type if changed
      if (body.eventTypeHash && body.eventTypeHash !== existing.eventTypeHash) {
        deletes.push(`idx:eventtype:${existing.eventTypeHash}:${id}`)
        puts.set(`idx:eventtype:${body.eventTypeHash}:${id}`, true)
      }

      // Re-index status if changed
      if (body.statusHash && body.statusHash !== existing.statusHash) {
        deletes.push(`idx:eventstatus:${existing.statusHash}:${id}`)
        puts.set(`idx:eventstatus:${body.statusHash}:${id}`, true)
      }

      // Re-index parent if changed
      if (body.parentEventId !== undefined && body.parentEventId !== existing.parentEventId) {
        if (existing.parentEventId) {
          deletes.push(`idx:eventparent:${existing.parentEventId}:${id}`)
          // Decrement old parent's subEventCount
          const oldParent = await this.ctx.storage.get<Event>(`event:${existing.parentEventId}`)
          if (oldParent) {
            oldParent.subEventCount = Math.max(0, oldParent.subEventCount - 1)
            oldParent.updatedAt = now
            puts.set(`event:${existing.parentEventId}`, oldParent)
          }
        }
        if (body.parentEventId) {
          puts.set(`idx:eventparent:${body.parentEventId}:${id}`, true)
          // Increment new parent's subEventCount
          const newParent = await this.ctx.storage.get<Event>(`event:${body.parentEventId}`)
          if (newParent) {
            newParent.subEventCount = (newParent.subEventCount ?? 0) + 1
            newParent.updatedAt = now
            puts.set(`event:${body.parentEventId}`, newParent)
          }
        }
      }

      puts.set(`event:${id}`, updated)

      if (deletes.length > 0) {
        await this.ctx.storage.delete(deletes)
      }
      await this.ctx.storage.put(Object.fromEntries(puts))

      return Response.json(updated)
    })

    // --- Delete event ---
    this.router.delete('/events/:id', async (_req, { id }) => {
      const existing = await this.ctx.storage.get<Event>(`event:${id}`)
      if (!existing) return Response.json({ error: 'Event not found' }, { status: 404 })

      const deletes: string[] = [`event:${id}`]
      const puts = new Map<string, unknown>()

      // Remove indexes
      deletes.push(`idx:eventtype:${existing.eventTypeHash}:${id}`)
      deletes.push(`idx:eventstatus:${existing.statusHash}:${id}`)

      if (existing.parentEventId) {
        deletes.push(`idx:eventparent:${existing.parentEventId}:${id}`)
        // Decrement parent's subEventCount
        const parent = await this.ctx.storage.get<Event>(`event:${existing.parentEventId}`)
        if (parent) {
          parent.subEventCount = Math.max(0, parent.subEventCount - 1)
          parent.updatedAt = new Date().toISOString()
          puts.set(`event:${existing.parentEventId}`, parent)
        }
      }

      if (existing.caseNumber) {
        deletes.push(`idx:number:${existing.caseNumber}`)
      }

      // Remove case-event links (both directions) and update records
      const caseLinks = await this.ctx.storage.list<CaseEvent>({ prefix: `eventcases:${id}:` })
      for (const [key, link] of caseLinks) {
        deletes.push(key)
        deletes.push(`caseevent:${link.recordId}:${id}`)
        // Remove eventId from record's eventIds
        const record = await this.ctx.storage.get<CaseRecord>(`record:${link.recordId}`)
        if (record) {
          record.eventIds = (record.eventIds ?? []).filter(eid => eid !== id)
          record.updatedAt = new Date().toISOString()
          puts.set(`record:${link.recordId}`, record)
        }
      }

      // Remove report-event links (both directions)
      const reportLinks = await this.ctx.storage.list<ReportEvent>({ prefix: `eventreports:${id}:` })
      for (const [key, link] of reportLinks) {
        deletes.push(key)
        deletes.push(`reportevent:${link.reportId}:${id}`)
      }

      // Clear parentEventId on sub-events (preserve them)
      const subEventKeys = await this.ctx.storage.list<boolean>({ prefix: `idx:eventparent:${id}:` })
      for (const [key] of subEventKeys) {
        deletes.push(key)
        const parts = key.split(':')
        const subEventId = parts[parts.length - 1]
        const subEvent = await this.ctx.storage.get<Event>(`event:${subEventId}`)
        if (subEvent) {
          subEvent.parentEventId = undefined
          subEvent.updatedAt = new Date().toISOString()
          puts.set(`event:${subEventId}`, subEvent)
        }
      }

      await this.ctx.storage.delete(deletes)
      if (puts.size > 0) {
        await this.ctx.storage.put(Object.fromEntries(puts))
      }

      return Response.json({ deleted: true })
    })

    // --- List sub-events ---
    this.router.get('/events/:id/subevents', async (_req, { id }) => {
      const event = await this.ctx.storage.get<Event>(`event:${id}`)
      if (!event) return Response.json({ error: 'Event not found' }, { status: 404 })

      const subKeys = await this.ctx.storage.list<boolean>({ prefix: `idx:eventparent:${id}:` })
      const subEvents: Event[] = []
      for (const [key] of subKeys) {
        const parts = key.split(':')
        const subId = parts[parts.length - 1]
        const sub = await this.ctx.storage.get<Event>(`event:${subId}`)
        if (sub) subEvents.push(sub)
      }

      subEvents.sort((a, b) => a.startDate.localeCompare(b.startDate))

      return Response.json({ events: subEvents })
    })

    // --- Link record to event ---
    this.router.post('/events/:id/records', async (req, { id }) => {
      const event = await this.ctx.storage.get<Event>(`event:${id}`)
      if (!event) return Response.json({ error: 'Event not found' }, { status: 404 })

      const body = await req.json() as { recordId: string; linkedBy: string }
      const record = await this.ctx.storage.get<CaseRecord>(`record:${body.recordId}`)
      if (!record) return Response.json({ error: 'Record not found' }, { status: 404 })

      // Check for existing link
      const existing = await this.ctx.storage.get<CaseEvent>(`eventcases:${id}:${body.recordId}`)
      if (existing) return Response.json({ error: 'Already linked' }, { status: 409 })

      const now = new Date().toISOString()
      const link: CaseEvent = {
        recordId: body.recordId,
        eventId: id,
        linkedAt: now,
        linkedBy: body.linkedBy,
      }

      const puts = new Map<string, unknown>()
      puts.set(`caseevent:${body.recordId}:${id}`, link)
      puts.set(`eventcases:${id}:${body.recordId}`, link)

      // Update event caseCount
      event.caseCount = (event.caseCount ?? 0) + 1
      event.updatedAt = now
      puts.set(`event:${id}`, event)

      // Update record eventIds
      record.eventIds = [...(record.eventIds ?? []), id]
      record.updatedAt = now
      puts.set(`record:${body.recordId}`, record)

      await this.ctx.storage.put(Object.fromEntries(puts))

      return Response.json(link, { status: 201 })
    })

    // --- Unlink record from event ---
    this.router.delete('/events/:id/records/:recordId', async (_req, { id, recordId }) => {
      const link = await this.ctx.storage.get<CaseEvent>(`eventcases:${id}:${recordId}`)
      if (!link) return Response.json({ error: 'Link not found' }, { status: 404 })

      const deletes = [
        `caseevent:${recordId}:${id}`,
        `eventcases:${id}:${recordId}`,
      ]

      // Update event caseCount
      const event = await this.ctx.storage.get<Event>(`event:${id}`)
      if (event) {
        event.caseCount = Math.max(0, event.caseCount - 1)
        event.updatedAt = new Date().toISOString()
        await this.ctx.storage.put(`event:${id}`, event)
      }

      // Update record eventIds
      const record = await this.ctx.storage.get<CaseRecord>(`record:${recordId}`)
      if (record) {
        record.eventIds = (record.eventIds ?? []).filter(eid => eid !== id)
        record.updatedAt = new Date().toISOString()
        await this.ctx.storage.put(`record:${recordId}`, record)
      }

      await this.ctx.storage.delete(deletes)

      return Response.json({ deleted: true })
    })

    // --- List records linked to event ---
    this.router.get('/events/:id/records', async (_req, { id }) => {
      const event = await this.ctx.storage.get<Event>(`event:${id}`)
      if (!event) return Response.json({ error: 'Event not found' }, { status: 404 })

      const links = await this.ctx.storage.list<CaseEvent>({ prefix: `eventcases:${id}:` })
      const result: CaseEvent[] = []
      for (const [, link] of links) {
        result.push(link)
      }

      return Response.json({ links: result })
    })

    // --- Link report to event ---
    this.router.post('/events/:id/reports', async (req, { id }) => {
      const event = await this.ctx.storage.get<Event>(`event:${id}`)
      if (!event) return Response.json({ error: 'Event not found' }, { status: 404 })

      const body = await req.json() as { reportId: string; linkedBy: string }

      // Check for existing link
      const existing = await this.ctx.storage.get<ReportEvent>(`eventreports:${id}:${body.reportId}`)
      if (existing) return Response.json({ error: 'Already linked' }, { status: 409 })

      const now = new Date().toISOString()
      const link: ReportEvent = {
        reportId: body.reportId,
        eventId: id,
        linkedAt: now,
        linkedBy: body.linkedBy,
      }

      const puts = new Map<string, unknown>()
      puts.set(`reportevent:${body.reportId}:${id}`, link)
      puts.set(`eventreports:${id}:${body.reportId}`, link)

      // Update event reportCount
      event.reportCount = (event.reportCount ?? 0) + 1
      event.updatedAt = now
      puts.set(`event:${id}`, event)

      await this.ctx.storage.put(Object.fromEntries(puts))

      return Response.json(link, { status: 201 })
    })

    // --- Unlink report from event ---
    this.router.delete('/events/:id/reports/:reportId', async (_req, { id, reportId }) => {
      const link = await this.ctx.storage.get<ReportEvent>(`eventreports:${id}:${reportId}`)
      if (!link) return Response.json({ error: 'Link not found' }, { status: 404 })

      const deletes = [
        `reportevent:${reportId}:${id}`,
        `eventreports:${id}:${reportId}`,
      ]

      // Update event reportCount
      const event = await this.ctx.storage.get<Event>(`event:${id}`)
      if (event) {
        event.reportCount = Math.max(0, event.reportCount - 1)
        event.updatedAt = new Date().toISOString()
        await this.ctx.storage.put(`event:${id}`, event)
      }

      await this.ctx.storage.delete(deletes)

      return Response.json({ deleted: true })
    })

    // --- List reports linked to event ---
    this.router.get('/events/:id/reports', async (_req, { id }) => {
      const event = await this.ctx.storage.get<Event>(`event:${id}`)
      if (!event) return Response.json({ error: 'Event not found' }, { status: 404 })

      const links = await this.ctx.storage.list<ReportEvent>({ prefix: `eventreports:${id}:` })
      const result: ReportEvent[] = []
      for (const [, link] of links) {
        result.push(link)
      }

      return Response.json({ links: result })
    })
  }

  // ============================================================
  // Report-Case Link Routes (M:N linking between reports and cases)
  // ============================================================

  private setupReportCaseLinkRoutes() {
    // --- Link report to case ---
    this.router.post('/records/:caseId/reports', async (req, { caseId }) => {
      const record = await this.ctx.storage.get<CaseRecord>(`record:${caseId}`)
      if (!record) return Response.json({ error: 'Record not found' }, { status: 404 })

      const body = await req.json() as {
        reportId: string
        encryptedNotes?: string
        notesEnvelopes?: Array<{ pubkey: string; wrappedKey: string; ephemeralPubkey: string }>
      }
      const linkedBy = req.headers.get('x-pubkey') ?? ''
      const now = new Date().toISOString()

      // Check for duplicate link
      const existing = await this.ctx.storage.get<ReportCaseLink>(`reportcase:${body.reportId}:${caseId}`)
      if (existing) return Response.json({ error: 'Report already linked to this case' }, { status: 409 })

      const link: ReportCaseLink = {
        reportId: body.reportId,
        caseId,
        linkedAt: now,
        linkedBy,
        encryptedNotes: body.encryptedNotes,
        notesEnvelopes: body.notesEnvelopes,
      }

      const puts = new Map<string, unknown>()
      puts.set(`reportcase:${body.reportId}:${caseId}`, link)
      puts.set(`casereports:${caseId}:${body.reportId}`, link)

      // Update record reportCount and reportIds
      record.reportCount = (record.reportCount ?? 0) + 1
      record.reportIds = [...(record.reportIds ?? []), body.reportId]
      record.updatedAt = now
      puts.set(`record:${caseId}`, record)

      await this.ctx.storage.put(Object.fromEntries(puts))

      return Response.json(link, { status: 201 })
    })

    // --- Unlink report from case ---
    this.router.delete('/records/:caseId/reports/:reportId', async (_req, { caseId, reportId }) => {
      const link = await this.ctx.storage.get<ReportCaseLink>(`reportcase:${reportId}:${caseId}`)
      if (!link) return Response.json({ error: 'Link not found' }, { status: 404 })

      const deletes = [
        `reportcase:${reportId}:${caseId}`,
        `casereports:${caseId}:${reportId}`,
      ]

      // Update record reportCount and reportIds
      const record = await this.ctx.storage.get<CaseRecord>(`record:${caseId}`)
      if (record) {
        record.reportCount = Math.max(0, (record.reportCount ?? 0) - 1)
        record.reportIds = (record.reportIds ?? []).filter(rid => rid !== reportId)
        record.updatedAt = new Date().toISOString()
        await this.ctx.storage.put(`record:${caseId}`, record)
      }

      await this.ctx.storage.delete(deletes)

      return Response.json({ deleted: true })
    })

    // --- List reports linked to a case ---
    this.router.get('/records/:caseId/reports', async (_req, { caseId }) => {
      const record = await this.ctx.storage.get<CaseRecord>(`record:${caseId}`)
      if (!record) return Response.json({ error: 'Record not found' }, { status: 404 })

      const entries = await this.ctx.storage.list<ReportCaseLink>({ prefix: `casereports:${caseId}:` })
      const links: ReportCaseLink[] = []
      for (const [, value] of entries) links.push(value)
      links.sort((a, b) => b.linkedAt.localeCompare(a.linkedAt))

      return Response.json({ reports: links, total: links.length })
    })

    // --- List cases linked to a report (reverse direction) ---
    this.router.get('/reports/:reportId/records', async (_req, { reportId }) => {
      const entries = await this.ctx.storage.list<ReportCaseLink>({ prefix: `reportcase:${reportId}:` })
      const links: ReportCaseLink[] = []
      for (const [, value] of entries) links.push(value)
      links.sort((a, b) => b.linkedAt.localeCompare(a.linkedAt))

      return Response.json({ records: links, total: links.length })
    })
  }

  // ============================================================
  // Evidence & Chain of Custody Routes (Epic 325)
  // ============================================================

  private setupEvidenceRoutes() {
    // --- Upload evidence metadata (file uploaded to R2 separately) ---
    this.router.post('/records/:caseId/evidence', async (req, { caseId }) => {
      const record = await this.ctx.storage.get<CaseRecord>(`record:${caseId}`)
      if (!record) return Response.json({ error: 'Record not found' }, { status: 404 })

      const body = await req.json() as {
        fileId: string
        filename: string
        mimeType: string
        sizeBytes: number
        classification: EvidenceMetadata['classification']
        integrityHash: string
        source?: string
        sourceDescription?: string
        encryptedDescription?: string
        descriptionEnvelopes?: EvidenceMetadata['descriptionEnvelopes']
      }
      const id = crypto.randomUUID()
      const now = new Date().toISOString()
      const pubkey = req.headers.get('x-pubkey') ?? ''

      const evidence: EvidenceMetadata = {
        id,
        caseId,
        fileId: body.fileId,
        filename: body.filename,
        mimeType: body.mimeType,
        sizeBytes: body.sizeBytes,
        classification: body.classification,
        integrityHash: body.integrityHash,
        hashAlgorithm: 'sha256',
        source: body.source,
        sourceDescription: body.sourceDescription,
        encryptedDescription: body.encryptedDescription,
        descriptionEnvelopes: body.descriptionEnvelopes,
        uploadedAt: now,
        uploadedBy: pubkey,
        custodyEntryCount: 1, // Initial "uploaded" entry
      }

      // Create initial custody entry
      const custodyId = crypto.randomUUID()
      const uploadEntry: CustodyEntry = {
        id: custodyId,
        evidenceId: id,
        action: 'uploaded',
        actorPubkey: pubkey,
        timestamp: now,
        integrityHash: body.integrityHash,
      }

      const puts = new Map<string, unknown>()
      puts.set(`evidence:${caseId}:${id}`, evidence)
      puts.set(`idx:evidence:case:${caseId}:${id}`, true)
      puts.set(`custody:${id}:${custodyId}`, uploadEntry)

      // Update record file count
      record.fileCount = (record.fileCount ?? 0) + 1
      record.updatedAt = now
      puts.set(`record:${caseId}`, record)

      await this.ctx.storage.put(Object.fromEntries(puts))

      return Response.json(evidence, { status: 201 })
    })

    // --- List evidence for a case ---
    this.router.get('/records/:caseId/evidence', async (req, { caseId }) => {
      const record = await this.ctx.storage.get<CaseRecord>(`record:${caseId}`)
      if (!record) return Response.json({ error: 'Record not found' }, { status: 404 })

      const url = new URL(req.url)
      const page = parseInt(url.searchParams.get('page') ?? '1')
      const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '20'), 100)
      const classification = url.searchParams.get('classification')

      const entries = await this.ctx.storage.list<EvidenceMetadata>({ prefix: `evidence:${caseId}:` })
      let evidenceList: EvidenceMetadata[] = []
      for (const [, value] of entries) evidenceList.push(value)

      if (classification) {
        evidenceList = evidenceList.filter(e => e.classification === classification)
      }

      evidenceList.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))
      const start = (page - 1) * limit
      const paged = evidenceList.slice(start, start + limit)

      return Response.json({
        evidence: paged,
        total: evidenceList.length,
        page,
        limit,
        hasMore: start + limit < evidenceList.length,
      })
    })

    // --- Get single evidence metadata ---
    this.router.get('/evidence/:id', async (_req, { id }) => {
      // Scan for evidence by ID across cases
      const allEvidence = await this.ctx.storage.list<EvidenceMetadata>({ prefix: 'evidence:' })
      for (const [, ev] of allEvidence) {
        if (ev.id === id) return Response.json(ev)
      }
      return Response.json({ error: 'Evidence not found' }, { status: 404 })
    })

    // --- Get custody chain for evidence ---
    this.router.get('/evidence/:id/custody', async (_req, { id }) => {
      const entries = await this.ctx.storage.list<CustodyEntry>({ prefix: `custody:${id}:` })
      const chain: CustodyEntry[] = []
      for (const [, value] of entries) chain.push(value)
      chain.sort((a, b) => a.timestamp.localeCompare(b.timestamp)) // Chronological order
      return Response.json({ custodyChain: chain, total: chain.length })
    })

    // --- Add custody entry (called when evidence is accessed) ---
    this.router.post('/evidence/:id/custody', async (req, { id: evidenceId }) => {
      const body = await req.json() as {
        action: CustodyEntry['action']
        integrityHash: string
        ipHash?: string
        userAgent?: string
        notes?: string
      }
      const custodyId = crypto.randomUUID()
      const now = new Date().toISOString()

      const entry: CustodyEntry = {
        id: custodyId,
        evidenceId,
        action: body.action,
        actorPubkey: req.headers.get('x-pubkey') ?? '',
        timestamp: now,
        integrityHash: body.integrityHash,
        ipHash: body.ipHash,
        userAgent: body.userAgent,
        notes: body.notes,
      }

      await this.ctx.storage.put(`custody:${evidenceId}:${custodyId}`, entry)

      // Update custody entry count on evidence metadata
      const allEvidence = await this.ctx.storage.list<EvidenceMetadata>({ prefix: 'evidence:' })
      for (const [key, ev] of allEvidence) {
        if (ev.id === evidenceId) {
          ev.custodyEntryCount++
          await this.ctx.storage.put(key, ev)
          break
        }
      }

      return Response.json(entry, { status: 201 })
    })

    // --- Verify evidence integrity ---
    this.router.post('/evidence/:id/verify', async (req, { id: evidenceId }) => {
      const { currentHash } = await req.json() as { currentHash: string }

      // Find the evidence metadata
      const allEvidence = await this.ctx.storage.list<EvidenceMetadata>({ prefix: 'evidence:' })
      let evidence: EvidenceMetadata | null = null
      for (const [, ev] of allEvidence) {
        if (ev.id === evidenceId) { evidence = ev; break }
      }
      if (!evidence) return Response.json({ error: 'Evidence not found' }, { status: 404 })

      const isValid = currentHash === evidence.integrityHash
      const now = new Date().toISOString()
      const pubkey = req.headers.get('x-pubkey') ?? ''

      // Log the verification as a custody entry
      const custodyId = crypto.randomUUID()
      const verifyEntry: CustodyEntry = {
        id: custodyId,
        evidenceId,
        action: 'integrity_verified',
        actorPubkey: pubkey,
        timestamp: now,
        integrityHash: currentHash,
        notes: isValid
          ? 'Integrity verified: hash matches'
          : 'INTEGRITY MISMATCH: hash does not match original',
      }
      await this.ctx.storage.put(`custody:${evidenceId}:${custodyId}`, verifyEntry)

      // Update custody entry count
      const allEvidence2 = await this.ctx.storage.list<EvidenceMetadata>({ prefix: 'evidence:' })
      for (const [key, ev] of allEvidence2) {
        if (ev.id === evidenceId) {
          ev.custodyEntryCount++
          await this.ctx.storage.put(key, ev)
          break
        }
      }

      return Response.json({ valid: isValid, originalHash: evidence.integrityHash, currentHash })
    })
  }

  // ============================================================
  // Utility Routes
  // ============================================================

  private setupResetRoute() {
    // --- Test Reset (demo/development only) ---
    this.router.post('/reset', async () => {
      if (this.env.DEMO_MODE !== 'true' && this.env.ENVIRONMENT !== 'development') {
        return new Response('Reset not allowed outside demo/development mode', { status: 403 })
      }
      await this.ctx.storage.deleteAll()
      return Response.json({ ok: true })
    })
  }

  // ============================================================
  // Filter Helpers
  // ============================================================

  /**
   * Check top-level hash fields (statusHash, severityHash) against filters.
   * The blind index query parser extracts filters from query params; we need to
   * also check top-level record fields that mirror commonly filtered values.
   */
  private matchesTopLevelFilters(
    record: CaseRecord,
    filters: Map<string, string[]>,
  ): boolean {
    const statusFilter = filters.get('statusHash')
    if (statusFilter && !statusFilter.includes(record.statusHash)) {
      return false
    }

    const severityFilter = filters.get('severityHash')
    if (severityFilter) {
      if (!record.severityHash || !severityFilter.includes(record.severityHash)) {
        return false
      }
    }

    const categoryFilter = filters.get('categoryHash')
    if (categoryFilter) {
      if (!record.categoryHash || !categoryFilter.includes(record.categoryHash)) {
        return false
      }
    }

    return true
  }

  /**
   * Check event-specific filters: status, date range, blind indexes.
   */
  private matchesEventFilters(
    event: Event,
    statusHash: string | null,
    startAfter: string | null,
    startBefore: string | null,
    filters: Map<string, string[]>,
  ): boolean {
    // Status filter (when using candidate set from eventtype index, status wasn't pre-filtered)
    if (statusHash && event.statusHash !== statusHash) {
      return false
    }

    // Date range filters
    if (startAfter && event.startDate < startAfter) {
      return false
    }
    if (startBefore && event.startDate > startBefore) {
      return false
    }

    // Blind index filters
    if (filters.size > 0 && !matchesBlindIndexFilters(event.blindIndexes ?? {}, filters)) {
      return false
    }

    return true
  }

  async fetch(request: Request): Promise<Response> {
    return this.router.handle(request)
  }
}
