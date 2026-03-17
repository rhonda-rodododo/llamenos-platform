/**
 * CasesService — replaces CaseDO.
 *
 * E2EE case/record/event storage with contact linking, interactions,
 * evidence chain-of-custody, report linking, and event management.
 * All state is stored in PostgreSQL via Drizzle ORM.
 *
 * PostgreSQL indexes replace the DO's manual KV indexes:
 * - case_records: hub_id, status_hash, severity_hash, entity_type_id,
 *   case_number (unique), assigned_to (GIN), category_hash
 * - events: hub_id, parent_event_id, status_hash
 * - case_contacts: composite PK (case_id, contact_id)
 * - case_events: composite PK (case_id, event_id)
 * - report_events: composite PK (report_id, event_id)
 * - report_cases: composite PK (report_id, case_id)
 * - case_interactions: case_id+created_at, source_id, case_id+interaction_type
 * - evidence: case_id
 * - custody_entries: evidence_id+timestamp
 */
import { eq, and, desc, asc, sql, count, isNull } from 'drizzle-orm'
import type { Database } from '../db'
import {
  caseRecords,
  events,
  caseContacts,
  caseEvents,
  reportEvents,
  reportCases,
  caseInteractions,
  evidence,
  custodyEntries,
} from '../db/schema'
import { ServiceError } from './settings'
import type { CreateRecordBody } from '@protocol/schemas/records'
import type { CreateEventBody } from '@protocol/schemas/events'
import type { CreateInteractionBody } from '@protocol/schemas/interactions'
import type { EvidenceMetadata } from '@protocol/schemas/evidence'

// ---------------------------------------------------------------------------
// Inferred row types from Drizzle schema
// ---------------------------------------------------------------------------

type CaseRecordRow = typeof caseRecords.$inferSelect
type EventRow = typeof events.$inferSelect
type CaseContactRow = typeof caseContacts.$inferSelect
type CaseEventRow = typeof caseEvents.$inferSelect
type ReportEventRow = typeof reportEvents.$inferSelect
type ReportCaseRow = typeof reportCases.$inferSelect
type InteractionRow = typeof caseInteractions.$inferSelect
type EvidenceRow = typeof evidence.$inferSelect
type CustodyEntryRow = typeof custodyEntries.$inferSelect

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface ListCasesInput {
  hubId: string
  page?: number
  limit?: number
  statusHash?: string
  severityHash?: string
  categoryHash?: string
  assignedTo?: string
  entityTypeId?: string
  parentRecordId?: string
}

export interface ListEventsInput {
  hubId: string
  page?: number
  limit?: number
  eventTypeHash?: string
  statusHash?: string
  parentEventId?: string
  startAfter?: string
  startBefore?: string
}

export interface ListInteractionsInput {
  caseId: string
  page?: number
  limit?: number
  interactionTypeHash?: string
  after?: string
  before?: string
}

// ---------------------------------------------------------------------------
// CasesService
// ---------------------------------------------------------------------------

export class CasesService {
  constructor(protected db: Database) {}

  // =========================================================================
  // Case Record CRUD
  // =========================================================================

  async create(
    input: CreateRecordBody & {
      hubId: string
      createdBy: string
      caseNumber?: string
    },
  ): Promise<CaseRecordRow> {
    const [record] = await this.db
      .insert(caseRecords)
      .values({
        hubId: input.hubId,
        entityTypeId: input.entityTypeId,
        caseNumber: input.caseNumber ?? null,
        statusHash: input.statusHash,
        severityHash: input.severityHash ?? null,
        categoryHash: input.categoryHash ?? null,
        assignedTo: input.assignedTo ?? [],
        blindIndexes: input.blindIndexes ?? {},
        encryptedSummary: input.encryptedSummary,
        summaryEnvelopes: input.summaryEnvelopes,
        encryptedFields: input.encryptedFields ?? null,
        fieldEnvelopes: input.fieldEnvelopes ?? null,
        encryptedPii: input.encryptedPII ?? null,
        piiEnvelopes: input.piiEnvelopes ?? null,
        contactCount: 0,
        interactionCount: 0,
        fileCount: 0,
        reportCount: 0,
        eventIds: [],
        reportIds: [],
        parentRecordId: input.parentRecordId ?? null,
        createdBy: input.createdBy,
      })
      .returning()

    // Create initial contact links atomically
    if (input.contactLinks && input.contactLinks.length > 0) {
      const now = new Date()
      await this.db.insert(caseContacts).values(
        input.contactLinks.map((link) => ({
          caseId: record.id,
          contactId: link.contactId,
          role: link.role,
          addedAt: now,
          addedBy: input.createdBy,
        })),
      )

      // Update contact count
      await this.db
        .update(caseRecords)
        .set({ contactCount: input.contactLinks.length })
        .where(eq(caseRecords.id, record.id))

      record.contactCount = input.contactLinks.length
    }

    return record
  }

  async get(id: string): Promise<CaseRecordRow> {
    const rows = await this.db
      .select()
      .from(caseRecords)
      .where(eq(caseRecords.id, id))

    if (rows.length === 0) {
      throw new ServiceError(404, 'Record not found')
    }
    return rows[0]
  }

  async update(
    id: string,
    input: Partial<CreateRecordBody> & {
      statusChangeTypeHash?: string
      statusChangeContent?: string
      statusChangeEnvelopes?: unknown
      closedAt?: string
      authorPubkey?: string
    },
  ): Promise<CaseRecordRow> {
    const existing = await this.db
      .select()
      .from(caseRecords)
      .where(eq(caseRecords.id, id))
    if (existing.length === 0) {
      throw new ServiceError(404, 'Record not found')
    }
    const record = existing[0]
    const now = new Date()

    const values: Record<string, unknown> = { updatedAt: now }

    if (input.statusHash !== undefined) values.statusHash = input.statusHash
    if (input.severityHash !== undefined) values.severityHash = input.severityHash
    if (input.categoryHash !== undefined) values.categoryHash = input.categoryHash
    if (input.assignedTo !== undefined) values.assignedTo = input.assignedTo
    if (input.blindIndexes !== undefined) values.blindIndexes = input.blindIndexes
    if (input.encryptedSummary !== undefined) values.encryptedSummary = input.encryptedSummary
    if (input.summaryEnvelopes !== undefined) values.summaryEnvelopes = input.summaryEnvelopes
    if (input.encryptedFields !== undefined) values.encryptedFields = input.encryptedFields
    if (input.fieldEnvelopes !== undefined) values.fieldEnvelopes = input.fieldEnvelopes
    if (input.encryptedPII !== undefined) values.encryptedPii = input.encryptedPII
    if (input.piiEnvelopes !== undefined) values.piiEnvelopes = input.piiEnvelopes
    if (input.parentRecordId !== undefined) values.parentRecordId = input.parentRecordId
    if (input.closedAt !== undefined) values.closedAt = new Date(input.closedAt)

    // Auto-create status_change interaction when status changes
    if (input.statusHash && input.statusHash !== record.statusHash) {
      const isoNow = now.toISOString()
      await this.db.insert(caseInteractions).values({
        caseId: id,
        interactionType: 'status_change',
        authorPubkey: input.authorPubkey ?? '',
        interactionTypeHash: input.statusChangeTypeHash ?? '',
        previousStatusHash: record.statusHash,
        newStatusHash: input.statusHash,
        encryptedContent: input.statusChangeContent ?? null,
        contentEnvelopes: input.statusChangeEnvelopes ?? null,
        createdAt: new Date(isoNow),
      })

      values.interactionCount = sql`${caseRecords.interactionCount} + 1`
    }

    const [updated] = await this.db
      .update(caseRecords)
      .set(values)
      .where(eq(caseRecords.id, id))
      .returning()

    return updated
  }

  async delete(id: string): Promise<void> {
    const existing = await this.db
      .select({ id: caseRecords.id })
      .from(caseRecords)
      .where(eq(caseRecords.id, id))
    if (existing.length === 0) {
      throw new ServiceError(404, 'Record not found')
    }

    // Clean up case-event links and decrement event caseCount
    const eventLinks = await this.db
      .select({ eventId: caseEvents.eventId })
      .from(caseEvents)
      .where(eq(caseEvents.caseId, id))
    for (const { eventId } of eventLinks) {
      await this.db
        .update(events)
        .set({
          caseCount: sql`GREATEST(0, ${events.caseCount} - 1)`,
          updatedAt: new Date(),
        })
        .where(eq(events.id, eventId))
    }

    // Delete all related data
    await this.db.delete(caseContacts).where(eq(caseContacts.caseId, id))
    await this.db.delete(caseEvents).where(eq(caseEvents.caseId, id))
    await this.db.delete(reportCases).where(eq(reportCases.caseId, id))
    await this.db.delete(caseInteractions).where(eq(caseInteractions.caseId, id))

    // Delete evidence and custody entries
    const evidenceRows = await this.db
      .select({ id: evidence.id })
      .from(evidence)
      .where(eq(evidence.caseId, id))
    for (const { id: evidenceId } of evidenceRows) {
      await this.db.delete(custodyEntries).where(eq(custodyEntries.evidenceId, evidenceId))
    }
    await this.db.delete(evidence).where(eq(evidence.caseId, id))

    // Delete the record itself
    await this.db.delete(caseRecords).where(eq(caseRecords.id, id))
  }

  async list(input: ListCasesInput): Promise<{
    records: CaseRecordRow[]
    total: number
    page: number
    limit: number
    hasMore: boolean
  }> {
    const page = input.page ?? 1
    const limit = Math.min(input.limit ?? 20, 100)
    const offset = (page - 1) * limit

    const conditions = [eq(caseRecords.hubId, input.hubId)]

    if (input.statusHash) {
      conditions.push(eq(caseRecords.statusHash, input.statusHash))
    }
    if (input.severityHash) {
      conditions.push(eq(caseRecords.severityHash, input.severityHash))
    }
    if (input.categoryHash) {
      conditions.push(eq(caseRecords.categoryHash, input.categoryHash))
    }
    if (input.assignedTo) {
      conditions.push(
        sql`${caseRecords.assignedTo} @> ARRAY[${input.assignedTo}]::text[]`,
      )
    }
    if (input.entityTypeId) {
      conditions.push(eq(caseRecords.entityTypeId, input.entityTypeId))
    }
    if (input.parentRecordId !== undefined) {
      if (input.parentRecordId === null) {
        conditions.push(isNull(caseRecords.parentRecordId))
      } else {
        conditions.push(eq(caseRecords.parentRecordId, input.parentRecordId))
      }
    }

    const where = and(...conditions)

    const [totalResult] = await this.db
      .select({ count: count() })
      .from(caseRecords)
      .where(where)

    const total = totalResult.count

    const rows = await this.db
      .select()
      .from(caseRecords)
      .where(where)
      .orderBy(desc(caseRecords.updatedAt))
      .limit(limit)
      .offset(offset)

    return {
      records: rows,
      total,
      page,
      limit,
      hasMore: offset + limit < total,
    }
  }

  // =========================================================================
  // Get by case number
  // =========================================================================

  async getByNumber(caseNumber: string): Promise<CaseRecordRow> {
    const rows = await this.db
      .select()
      .from(caseRecords)
      .where(eq(caseRecords.caseNumber, caseNumber))

    if (rows.length === 0) {
      throw new ServiceError(404, 'Record not found')
    }
    return rows[0]
  }

  // =========================================================================
  // Get by contact (screen pop — active cases only)
  // =========================================================================

  async listByContact(contactId: string): Promise<{
    records: CaseRecordRow[]
    total: number
  }> {
    const links = await this.db
      .select({ caseId: caseContacts.caseId })
      .from(caseContacts)
      .where(eq(caseContacts.contactId, contactId))

    if (links.length === 0) return { records: [], total: 0 }

    const caseIds = links.map((l) => l.caseId)

    const rows = await this.db
      .select()
      .from(caseRecords)
      .where(
        and(
          sql`${caseRecords.id} = ANY(ARRAY[${sql.join(
            caseIds.map((id) => sql`${id}`),
            sql.raw(','),
          )}]::text[])`,
          isNull(caseRecords.closedAt),
        ),
      )
      .orderBy(desc(caseRecords.updatedAt))

    return { records: rows, total: rows.length }
  }

  // =========================================================================
  // Assignment
  // =========================================================================

  async assign(
    caseId: string,
    pubkeys: string[],
  ): Promise<{ assignedTo: string[] }> {
    const existing = await this.db
      .select()
      .from(caseRecords)
      .where(eq(caseRecords.id, caseId))
    if (existing.length === 0) {
      throw new ServiceError(404, 'Record not found')
    }
    const record = existing[0]

    // Deduplicate: add only new pubkeys
    const existingSet = new Set(record.assignedTo)
    const newPubkeys = pubkeys.filter((pk) => !existingSet.has(pk))

    if (newPubkeys.length === 0) {
      return { assignedTo: record.assignedTo }
    }

    // Use array_cat to append new pubkeys
    const [updated] = await this.db
      .update(caseRecords)
      .set({
        assignedTo: sql`array_cat(${caseRecords.assignedTo}, ARRAY[${sql.join(
          newPubkeys.map((pk) => sql`${pk}`),
          sql.raw(','),
        )}]::text[])`,
        updatedAt: new Date(),
      })
      .where(eq(caseRecords.id, caseId))
      .returning({ assignedTo: caseRecords.assignedTo })

    return { assignedTo: updated.assignedTo }
  }

  async unassign(
    caseId: string,
    pubkey: string,
  ): Promise<{ assignedTo: string[] }> {
    const existing = await this.db
      .select()
      .from(caseRecords)
      .where(eq(caseRecords.id, caseId))
    if (existing.length === 0) {
      throw new ServiceError(404, 'Record not found')
    }
    const record = existing[0]

    if (!record.assignedTo.includes(pubkey)) {
      throw new ServiceError(404, 'Pubkey not assigned')
    }

    const [updated] = await this.db
      .update(caseRecords)
      .set({
        assignedTo: sql`array_remove(${caseRecords.assignedTo}, ${pubkey})`,
        updatedAt: new Date(),
      })
      .where(eq(caseRecords.id, caseId))
      .returning({ assignedTo: caseRecords.assignedTo })

    return { assignedTo: updated.assignedTo }
  }

  async countByAssignment(pubkey: string): Promise<{ pubkey: string; count: number }> {
    const [result] = await this.db
      .select({ count: count() })
      .from(caseRecords)
      .where(sql`${caseRecords.assignedTo} @> ARRAY[${pubkey}]::text[]`)

    return { pubkey, count: result.count }
  }

  // =========================================================================
  // Contact Linking
  // =========================================================================

  async linkContact(
    caseId: string,
    contactId: string,
    role: string,
    addedBy: string,
  ): Promise<CaseContactRow> {
    const record = await this.db
      .select({ id: caseRecords.id })
      .from(caseRecords)
      .where(eq(caseRecords.id, caseId))
    if (record.length === 0) {
      throw new ServiceError(404, 'Record not found')
    }

    const [link] = await this.db
      .insert(caseContacts)
      .values({
        caseId,
        contactId,
        role,
        addedBy,
      })
      .returning()

    // Increment contact count
    await this.db
      .update(caseRecords)
      .set({
        contactCount: sql`${caseRecords.contactCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(caseRecords.id, caseId))

    return link
  }

  async unlinkContact(caseId: string, contactId: string): Promise<void> {
    const record = await this.db
      .select({ id: caseRecords.id })
      .from(caseRecords)
      .where(eq(caseRecords.id, caseId))
    if (record.length === 0) {
      throw new ServiceError(404, 'Record not found')
    }

    const existing = await this.db
      .select()
      .from(caseContacts)
      .where(
        and(eq(caseContacts.caseId, caseId), eq(caseContacts.contactId, contactId)),
      )
    if (existing.length === 0) {
      throw new ServiceError(404, 'Contact link not found')
    }

    await this.db
      .delete(caseContacts)
      .where(
        and(eq(caseContacts.caseId, caseId), eq(caseContacts.contactId, contactId)),
      )

    // Decrement contact count
    await this.db
      .update(caseRecords)
      .set({
        contactCount: sql`GREATEST(0, ${caseRecords.contactCount} - 1)`,
        updatedAt: new Date(),
      })
      .where(eq(caseRecords.id, caseId))
  }

  async listContacts(caseId: string): Promise<CaseContactRow[]> {
    const record = await this.db
      .select({ id: caseRecords.id })
      .from(caseRecords)
      .where(eq(caseRecords.id, caseId))
    if (record.length === 0) {
      throw new ServiceError(404, 'Record not found')
    }

    return this.db
      .select()
      .from(caseContacts)
      .where(eq(caseContacts.caseId, caseId))
  }

  // =========================================================================
  // Event CRUD
  // =========================================================================

  async createEvent(
    input: CreateEventBody & {
      hubId: string
      createdBy: string
      caseNumber?: string
    },
  ): Promise<EventRow> {
    const [event] = await this.db
      .insert(events)
      .values({
        hubId: input.hubId,
        entityTypeId: input.entityTypeId,
        caseNumber: input.caseNumber ?? null,
        startDate: input.startDate,
        endDate: input.endDate ?? null,
        parentEventId: input.parentEventId ?? null,
        locationPrecision: input.locationPrecision ?? 'neighborhood',
        locationApproximate: input.locationApproximate ?? null,
        eventTypeHash: input.eventTypeHash,
        statusHash: input.statusHash,
        blindIndexes: input.blindIndexes ?? {},
        encryptedDetails: input.encryptedDetails,
        detailEnvelopes: input.detailEnvelopes,
        caseCount: 0,
        reportCount: 0,
        subEventCount: 0,
        createdBy: input.createdBy,
      })
      .returning()

    // Increment parent's subEventCount
    if (input.parentEventId) {
      await this.db
        .update(events)
        .set({
          subEventCount: sql`${events.subEventCount} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(events.id, input.parentEventId))
    }

    return event
  }

  async getEvent(id: string): Promise<EventRow> {
    const rows = await this.db
      .select()
      .from(events)
      .where(eq(events.id, id))

    if (rows.length === 0) {
      throw new ServiceError(404, 'Event not found')
    }
    return rows[0]
  }

  async updateEvent(
    id: string,
    input: Partial<CreateEventBody>,
  ): Promise<EventRow> {
    const existing = await this.db
      .select()
      .from(events)
      .where(eq(events.id, id))
    if (existing.length === 0) {
      throw new ServiceError(404, 'Event not found')
    }
    const event = existing[0]
    const now = new Date()

    const values: Record<string, unknown> = { updatedAt: now }

    if (input.startDate !== undefined) values.startDate = input.startDate
    if (input.endDate !== undefined) values.endDate = input.endDate
    if (input.locationPrecision !== undefined) values.locationPrecision = input.locationPrecision
    if (input.locationApproximate !== undefined) values.locationApproximate = input.locationApproximate
    if (input.eventTypeHash !== undefined) values.eventTypeHash = input.eventTypeHash
    if (input.statusHash !== undefined) values.statusHash = input.statusHash
    if (input.blindIndexes !== undefined) values.blindIndexes = input.blindIndexes
    if (input.encryptedDetails !== undefined) values.encryptedDetails = input.encryptedDetails
    if (input.detailEnvelopes !== undefined) values.detailEnvelopes = input.detailEnvelopes

    // Handle parent event change
    if (input.parentEventId !== undefined && input.parentEventId !== event.parentEventId) {
      values.parentEventId = input.parentEventId ?? null

      // Decrement old parent's subEventCount
      if (event.parentEventId) {
        await this.db
          .update(events)
          .set({
            subEventCount: sql`GREATEST(0, ${events.subEventCount} - 1)`,
            updatedAt: now,
          })
          .where(eq(events.id, event.parentEventId))
      }
      // Increment new parent's subEventCount
      if (input.parentEventId) {
        await this.db
          .update(events)
          .set({
            subEventCount: sql`${events.subEventCount} + 1`,
            updatedAt: now,
          })
          .where(eq(events.id, input.parentEventId))
      }
    }

    const [updated] = await this.db
      .update(events)
      .set(values)
      .where(eq(events.id, id))
      .returning()

    return updated
  }

  async deleteEvent(id: string): Promise<void> {
    const existing = await this.db
      .select()
      .from(events)
      .where(eq(events.id, id))
    if (existing.length === 0) {
      throw new ServiceError(404, 'Event not found')
    }
    const event = existing[0]
    const now = new Date()

    // Decrement parent's subEventCount
    if (event.parentEventId) {
      await this.db
        .update(events)
        .set({
          subEventCount: sql`GREATEST(0, ${events.subEventCount} - 1)`,
          updatedAt: now,
        })
        .where(eq(events.id, event.parentEventId))
    }

    // Remove case-event links and update records' eventIds
    const caseLinks = await this.db
      .select()
      .from(caseEvents)
      .where(eq(caseEvents.eventId, id))
    for (const link of caseLinks) {
      await this.db
        .update(caseRecords)
        .set({
          eventIds: sql`array_remove(${caseRecords.eventIds}, ${id})`,
          updatedAt: now,
        })
        .where(eq(caseRecords.id, link.caseId))
    }
    await this.db.delete(caseEvents).where(eq(caseEvents.eventId, id))

    // Remove report-event links
    await this.db.delete(reportEvents).where(eq(reportEvents.eventId, id))

    // Clear parentEventId on sub-events (preserve them, just orphan)
    await this.db
      .update(events)
      .set({ parentEventId: null, updatedAt: now })
      .where(eq(events.parentEventId, id))

    // Delete the event
    await this.db.delete(events).where(eq(events.id, id))
  }

  async listEvents(input: ListEventsInput): Promise<{
    events: EventRow[]
    total: number
    page: number
    limit: number
    hasMore: boolean
  }> {
    const page = input.page ?? 1
    const limit = Math.min(input.limit ?? 20, 100)
    const offset = (page - 1) * limit

    const conditions = [eq(events.hubId, input.hubId)]

    if (input.eventTypeHash) {
      conditions.push(eq(events.eventTypeHash, input.eventTypeHash))
    }
    if (input.statusHash) {
      conditions.push(eq(events.statusHash, input.statusHash))
    }
    if (input.parentEventId) {
      conditions.push(eq(events.parentEventId, input.parentEventId))
    }
    if (input.startAfter) {
      conditions.push(sql`${events.startDate} >= ${input.startAfter}`)
    }
    if (input.startBefore) {
      conditions.push(sql`${events.startDate} <= ${input.startBefore}`)
    }

    const where = and(...conditions)

    const [totalResult] = await this.db
      .select({ count: count() })
      .from(events)
      .where(where)

    const total = totalResult.count

    const rows = await this.db
      .select()
      .from(events)
      .where(where)
      .orderBy(desc(events.startDate))
      .limit(limit)
      .offset(offset)

    return {
      events: rows,
      total,
      page,
      limit,
      hasMore: offset + limit < total,
    }
  }

  // =========================================================================
  // Case-Event Linking
  // =========================================================================

  async linkEvent(
    caseId: string,
    eventId: string,
    linkedBy: string,
  ): Promise<CaseEventRow> {
    // Verify both exist
    const record = await this.db
      .select({ id: caseRecords.id })
      .from(caseRecords)
      .where(eq(caseRecords.id, caseId))
    if (record.length === 0) {
      throw new ServiceError(404, 'Record not found')
    }

    const event = await this.db
      .select({ id: events.id })
      .from(events)
      .where(eq(events.id, eventId))
    if (event.length === 0) {
      throw new ServiceError(404, 'Event not found')
    }

    // Check for existing link
    const existing = await this.db
      .select()
      .from(caseEvents)
      .where(and(eq(caseEvents.caseId, caseId), eq(caseEvents.eventId, eventId)))
    if (existing.length > 0) {
      throw new ServiceError(409, 'Already linked')
    }

    const [link] = await this.db
      .insert(caseEvents)
      .values({ caseId, eventId, linkedBy })
      .returning()

    // Update event caseCount
    await this.db
      .update(events)
      .set({
        caseCount: sql`${events.caseCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(events.id, eventId))

    // Update record eventIds
    await this.db
      .update(caseRecords)
      .set({
        eventIds: sql`array_append(${caseRecords.eventIds}, ${eventId})`,
        updatedAt: new Date(),
      })
      .where(eq(caseRecords.id, caseId))

    return link
  }

  async unlinkEvent(caseId: string, eventId: string): Promise<void> {
    const existing = await this.db
      .select()
      .from(caseEvents)
      .where(and(eq(caseEvents.caseId, caseId), eq(caseEvents.eventId, eventId)))
    if (existing.length === 0) {
      throw new ServiceError(404, 'Link not found')
    }

    await this.db
      .delete(caseEvents)
      .where(and(eq(caseEvents.caseId, caseId), eq(caseEvents.eventId, eventId)))

    // Update event caseCount
    await this.db
      .update(events)
      .set({
        caseCount: sql`GREATEST(0, ${events.caseCount} - 1)`,
        updatedAt: new Date(),
      })
      .where(eq(events.id, eventId))

    // Update record eventIds
    await this.db
      .update(caseRecords)
      .set({
        eventIds: sql`array_remove(${caseRecords.eventIds}, ${eventId})`,
        updatedAt: new Date(),
      })
      .where(eq(caseRecords.id, caseId))
  }

  async listCaseEvents(caseId: string): Promise<CaseEventRow[]> {
    const record = await this.db
      .select({ id: caseRecords.id })
      .from(caseRecords)
      .where(eq(caseRecords.id, caseId))
    if (record.length === 0) {
      throw new ServiceError(404, 'Record not found')
    }

    return this.db
      .select()
      .from(caseEvents)
      .where(eq(caseEvents.caseId, caseId))
  }

  // =========================================================================
  // Report-Event Linking
  // =========================================================================

  async linkReportEvent(
    reportId: string,
    eventId: string,
    linkedBy: string,
  ): Promise<ReportEventRow> {
    // Verify event exists
    const event = await this.db
      .select({ id: events.id })
      .from(events)
      .where(eq(events.id, eventId))
    if (event.length === 0) {
      throw new ServiceError(404, 'Event not found')
    }

    // Check for existing link
    const existing = await this.db
      .select()
      .from(reportEvents)
      .where(
        and(eq(reportEvents.reportId, reportId), eq(reportEvents.eventId, eventId)),
      )
    if (existing.length > 0) {
      throw new ServiceError(409, 'Already linked')
    }

    const [link] = await this.db
      .insert(reportEvents)
      .values({ reportId, eventId, linkedBy })
      .returning()

    // Update event reportCount
    await this.db
      .update(events)
      .set({
        reportCount: sql`${events.reportCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(events.id, eventId))

    return link
  }

  async unlinkReportEvent(reportId: string, eventId: string): Promise<void> {
    const existing = await this.db
      .select()
      .from(reportEvents)
      .where(
        and(eq(reportEvents.reportId, reportId), eq(reportEvents.eventId, eventId)),
      )
    if (existing.length === 0) {
      throw new ServiceError(404, 'Link not found')
    }

    await this.db
      .delete(reportEvents)
      .where(
        and(eq(reportEvents.reportId, reportId), eq(reportEvents.eventId, eventId)),
      )

    // Update event reportCount
    await this.db
      .update(events)
      .set({
        reportCount: sql`GREATEST(0, ${events.reportCount} - 1)`,
        updatedAt: new Date(),
      })
      .where(eq(events.id, eventId))
  }

  async listEventReports(eventId: string): Promise<ReportEventRow[]> {
    const event = await this.db
      .select({ id: events.id })
      .from(events)
      .where(eq(events.id, eventId))
    if (event.length === 0) {
      throw new ServiceError(404, 'Event not found')
    }

    return this.db
      .select()
      .from(reportEvents)
      .where(eq(reportEvents.eventId, eventId))
  }

  // =========================================================================
  // Report-Case Linking
  // =========================================================================

  async linkReportCase(
    caseId: string,
    reportId: string,
    linkedBy: string,
    encryptedNotes?: string,
    notesEnvelopes?: unknown,
  ): Promise<ReportCaseRow> {
    const record = await this.db
      .select({ id: caseRecords.id })
      .from(caseRecords)
      .where(eq(caseRecords.id, caseId))
    if (record.length === 0) {
      throw new ServiceError(404, 'Record not found')
    }

    // Check for duplicate link
    const existing = await this.db
      .select()
      .from(reportCases)
      .where(
        and(eq(reportCases.reportId, reportId), eq(reportCases.caseId, caseId)),
      )
    if (existing.length > 0) {
      throw new ServiceError(409, 'Report already linked to this case')
    }

    const [link] = await this.db
      .insert(reportCases)
      .values({
        reportId,
        caseId,
        linkedBy,
        encryptedNotes: encryptedNotes ?? null,
        notesEnvelopes: notesEnvelopes ?? null,
      })
      .returning()

    // Update record reportCount and reportIds
    await this.db
      .update(caseRecords)
      .set({
        reportCount: sql`${caseRecords.reportCount} + 1`,
        reportIds: sql`array_append(${caseRecords.reportIds}, ${reportId})`,
        updatedAt: new Date(),
      })
      .where(eq(caseRecords.id, caseId))

    return link
  }

  async unlinkReportCase(caseId: string, reportId: string): Promise<void> {
    const existing = await this.db
      .select()
      .from(reportCases)
      .where(
        and(eq(reportCases.reportId, reportId), eq(reportCases.caseId, caseId)),
      )
    if (existing.length === 0) {
      throw new ServiceError(404, 'Link not found')
    }

    await this.db
      .delete(reportCases)
      .where(
        and(eq(reportCases.reportId, reportId), eq(reportCases.caseId, caseId)),
      )

    // Update record reportCount and reportIds
    await this.db
      .update(caseRecords)
      .set({
        reportCount: sql`GREATEST(0, ${caseRecords.reportCount} - 1)`,
        reportIds: sql`array_remove(${caseRecords.reportIds}, ${reportId})`,
        updatedAt: new Date(),
      })
      .where(eq(caseRecords.id, caseId))
  }

  async listCaseReports(caseId: string): Promise<{
    reports: ReportCaseRow[]
    total: number
  }> {
    const record = await this.db
      .select({ id: caseRecords.id })
      .from(caseRecords)
      .where(eq(caseRecords.id, caseId))
    if (record.length === 0) {
      throw new ServiceError(404, 'Record not found')
    }

    const rows = await this.db
      .select()
      .from(reportCases)
      .where(eq(reportCases.caseId, caseId))
      .orderBy(desc(reportCases.linkedAt))

    return { reports: rows, total: rows.length }
  }

  async listReportCases(reportId: string): Promise<{
    records: ReportCaseRow[]
    total: number
  }> {
    const rows = await this.db
      .select()
      .from(reportCases)
      .where(eq(reportCases.reportId, reportId))
      .orderBy(desc(reportCases.linkedAt))

    return { records: rows, total: rows.length }
  }

  // =========================================================================
  // Interactions
  // =========================================================================

  async createInteraction(
    caseId: string,
    authorPubkey: string,
    input: CreateInteractionBody,
  ): Promise<InteractionRow> {
    const record = await this.db
      .select({ id: caseRecords.id })
      .from(caseRecords)
      .where(eq(caseRecords.id, caseId))
    if (record.length === 0) {
      throw new ServiceError(404, 'Record not found')
    }

    const [interaction] = await this.db
      .insert(caseInteractions)
      .values({
        caseId,
        interactionType: input.interactionType,
        sourceId: input.sourceId ?? null,
        encryptedContent: input.encryptedContent ?? null,
        contentEnvelopes: input.contentEnvelopes ?? null,
        authorPubkey,
        interactionTypeHash: input.interactionTypeHash,
        previousStatusHash: input.previousStatusHash ?? null,
        newStatusHash: input.newStatusHash ?? null,
      })
      .returning()

    // Increment record interaction count
    await this.db
      .update(caseRecords)
      .set({
        interactionCount: sql`${caseRecords.interactionCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(caseRecords.id, caseId))

    return interaction
  }

  async deleteInteraction(caseId: string, interactionId: string): Promise<void> {
    const existing = await this.db
      .select({ id: caseInteractions.id })
      .from(caseInteractions)
      .where(
        and(
          eq(caseInteractions.id, interactionId),
          eq(caseInteractions.caseId, caseId),
        ),
      )
    if (existing.length === 0) {
      throw new ServiceError(404, 'Interaction not found')
    }

    await this.db
      .delete(caseInteractions)
      .where(eq(caseInteractions.id, interactionId))

    // Decrement record interaction count
    await this.db
      .update(caseRecords)
      .set({
        interactionCount: sql`GREATEST(0, ${caseRecords.interactionCount} - 1)`,
        updatedAt: new Date(),
      })
      .where(eq(caseRecords.id, caseId))
  }

  async listInteractions(input: ListInteractionsInput): Promise<{
    interactions: InteractionRow[]
    total: number
    page: number
    limit: number
    hasMore: boolean
  }> {
    const record = await this.db
      .select({ id: caseRecords.id })
      .from(caseRecords)
      .where(eq(caseRecords.id, input.caseId))
    if (record.length === 0) {
      throw new ServiceError(404, 'Record not found')
    }

    const page = input.page ?? 1
    const limit = Math.min(input.limit ?? 50, 100)
    const offset = (page - 1) * limit

    const conditions = [eq(caseInteractions.caseId, input.caseId)]

    if (input.interactionTypeHash) {
      conditions.push(
        eq(caseInteractions.interactionTypeHash, input.interactionTypeHash),
      )
    }
    if (input.after) {
      conditions.push(sql`${caseInteractions.createdAt} > ${input.after}`)
    }
    if (input.before) {
      conditions.push(sql`${caseInteractions.createdAt} < ${input.before}`)
    }

    const where = and(...conditions)

    const [totalResult] = await this.db
      .select({ count: count() })
      .from(caseInteractions)
      .where(where)

    const total = totalResult.count

    const rows = await this.db
      .select()
      .from(caseInteractions)
      .where(where)
      .orderBy(asc(caseInteractions.createdAt))
      .limit(limit)
      .offset(offset)

    return {
      interactions: rows,
      total,
      page,
      limit,
      hasMore: offset + limit < total,
    }
  }

  async getBySource(sourceId: string): Promise<{
    linked: boolean
    caseId?: string
    interactionId?: string
  }> {
    const rows = await this.db
      .select({
        id: caseInteractions.id,
        caseId: caseInteractions.caseId,
      })
      .from(caseInteractions)
      .where(eq(caseInteractions.sourceId, sourceId))
      .limit(1)

    if (rows.length === 0) {
      return { linked: false }
    }

    return {
      linked: true,
      caseId: rows[0].caseId,
      interactionId: rows[0].id,
    }
  }

  // =========================================================================
  // Evidence
  // =========================================================================

  async createEvidence(
    caseId: string,
    uploadedBy: string,
    input: {
      fileId: string
      filename: string
      mimeType: string
      sizeBytes: number
      classification: string
      integrityHash: string
      source?: string
      sourceDescription?: string
      encryptedDescription?: string
      descriptionEnvelopes?: unknown
    },
  ): Promise<EvidenceRow> {
    const record = await this.db
      .select({ id: caseRecords.id })
      .from(caseRecords)
      .where(eq(caseRecords.id, caseId))
    if (record.length === 0) {
      throw new ServiceError(404, 'Record not found')
    }

    const [ev] = await this.db
      .insert(evidence)
      .values({
        caseId,
        fileId: input.fileId,
        filename: input.filename,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        classification: input.classification,
        integrityHash: input.integrityHash,
        source: input.source ?? null,
        sourceDescription: input.sourceDescription ?? null,
        encryptedDescription: input.encryptedDescription ?? null,
        descriptionEnvelopes: input.descriptionEnvelopes ?? null,
        uploadedBy,
        custodyEntryCount: 1, // Initial "uploaded" entry
      })
      .returning()

    // Create initial custody entry
    await this.db.insert(custodyEntries).values({
      evidenceId: ev.id,
      action: 'uploaded',
      actorPubkey: uploadedBy,
      integrityHash: input.integrityHash,
    })

    // Increment record file count
    await this.db
      .update(caseRecords)
      .set({
        fileCount: sql`${caseRecords.fileCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(caseRecords.id, caseId))

    return ev
  }

  async getEvidence(id: string): Promise<EvidenceRow> {
    const rows = await this.db
      .select()
      .from(evidence)
      .where(eq(evidence.id, id))

    if (rows.length === 0) {
      throw new ServiceError(404, 'Evidence not found')
    }
    return rows[0]
  }

  async listEvidence(
    caseId: string,
    options?: { page?: number; limit?: number; classification?: string },
  ): Promise<{
    evidence: EvidenceRow[]
    total: number
    page: number
    limit: number
    hasMore: boolean
  }> {
    const record = await this.db
      .select({ id: caseRecords.id })
      .from(caseRecords)
      .where(eq(caseRecords.id, caseId))
    if (record.length === 0) {
      throw new ServiceError(404, 'Record not found')
    }

    const page = options?.page ?? 1
    const limit = Math.min(options?.limit ?? 20, 100)
    const offset = (page - 1) * limit

    const conditions = [eq(evidence.caseId, caseId)]
    if (options?.classification) {
      conditions.push(eq(evidence.classification, options.classification))
    }

    const where = and(...conditions)

    const [totalResult] = await this.db
      .select({ count: count() })
      .from(evidence)
      .where(where)

    const total = totalResult.count

    const rows = await this.db
      .select()
      .from(evidence)
      .where(where)
      .orderBy(desc(evidence.uploadedAt))
      .limit(limit)
      .offset(offset)

    return {
      evidence: rows,
      total,
      page,
      limit,
      hasMore: offset + limit < total,
    }
  }

  async verifyEvidence(
    evidenceId: string,
    currentHash: string,
    actorPubkey: string,
  ): Promise<{ valid: boolean; originalHash: string; currentHash: string }> {
    const rows = await this.db
      .select()
      .from(evidence)
      .where(eq(evidence.id, evidenceId))
    if (rows.length === 0) {
      throw new ServiceError(404, 'Evidence not found')
    }

    const ev = rows[0]
    const isValid = currentHash === ev.integrityHash

    // Log the verification as a custody entry
    await this.db.insert(custodyEntries).values({
      evidenceId,
      action: 'integrity_verified',
      actorPubkey,
      integrityHash: currentHash,
      notes: isValid
        ? 'Integrity verified: hash matches'
        : 'INTEGRITY MISMATCH: hash does not match original',
    })

    // Update custody entry count
    await this.db
      .update(evidence)
      .set({
        custodyEntryCount: sql`${evidence.custodyEntryCount} + 1`,
      })
      .where(eq(evidence.id, evidenceId))

    return {
      valid: isValid,
      originalHash: ev.integrityHash,
      currentHash,
    }
  }

  // =========================================================================
  // Custody Entries
  // =========================================================================

  async createCustodyEntry(
    evidenceId: string,
    actorPubkey: string,
    input: {
      action: string
      integrityHash: string
      ipHash?: string
      userAgent?: string
      notes?: string
    },
  ): Promise<CustodyEntryRow> {
    const [entry] = await this.db
      .insert(custodyEntries)
      .values({
        evidenceId,
        action: input.action,
        actorPubkey,
        integrityHash: input.integrityHash,
        ipHash: input.ipHash ?? null,
        userAgent: input.userAgent ?? null,
        notes: input.notes ?? null,
      })
      .returning()

    // Update custody entry count on evidence
    await this.db
      .update(evidence)
      .set({
        custodyEntryCount: sql`${evidence.custodyEntryCount} + 1`,
      })
      .where(eq(evidence.id, evidenceId))

    return entry
  }

  async listCustodyEntries(evidenceId: string): Promise<{
    custodyChain: CustodyEntryRow[]
    total: number
  }> {
    const rows = await this.db
      .select()
      .from(custodyEntries)
      .where(eq(custodyEntries.evidenceId, evidenceId))
      .orderBy(asc(custodyEntries.timestamp))

    return { custodyChain: rows, total: rows.length }
  }

  // =========================================================================
  // Suggest Assignees (data only — business logic in route)
  // =========================================================================

  async getAssigneeSuggestions(caseId: string): Promise<{
    currentAssignees: string[]
    entityTypeId: string | null
    hubId: string | null
  }> {
    const rows = await this.db
      .select({
        assignedTo: caseRecords.assignedTo,
        entityTypeId: caseRecords.entityTypeId,
        hubId: caseRecords.hubId,
      })
      .from(caseRecords)
      .where(eq(caseRecords.id, caseId))

    if (rows.length === 0) {
      throw new ServiceError(404, 'Record not found')
    }

    return {
      currentAssignees: rows[0].assignedTo,
      entityTypeId: rows[0].entityTypeId,
      hubId: rows[0].hubId,
    }
  }

  // =========================================================================
  // Reset (demo/development only)
  // =========================================================================

  async reset(env: { DEMO_MODE?: string; ENVIRONMENT?: string }): Promise<void> {
    if (env.DEMO_MODE !== 'true' && env.ENVIRONMENT !== 'development') {
      throw new ServiceError(403, 'Reset not allowed outside demo/development mode')
    }

    await this.db.delete(custodyEntries)
    await this.db.delete(evidence)
    await this.db.delete(caseInteractions)
    await this.db.delete(reportCases)
    await this.db.delete(reportEvents)
    await this.db.delete(caseEvents)
    await this.db.delete(caseContacts)
    await this.db.delete(events)
    await this.db.delete(caseRecords)
  }
}
