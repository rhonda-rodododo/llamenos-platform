/**
 * RecordsService — notes, bans, and contact metadata backed by PostgreSQL.
 *
 * Replaces the DO-backed RecordsDO. The service never decrypts note content —
 * it stores and retrieves opaque encrypted blobs with their ECIES envelopes.
 */
import { eq, and, desc, asc, sql, count } from 'drizzle-orm'
import type { Database } from '../db'
import {
  notes,
  noteReplies,
  bans,
  contactMetadata,
} from '../db/schema'
import type { AuditService } from './audit'
import { ServiceError } from './settings'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NoteFilters {
  hubId?: string
  authorPubkey?: string
  callId?: string
  conversationId?: string
  contactHash?: string
  limit?: number
  offset?: number
}

export interface CreateNoteInput {
  hubId?: string
  authorPubkey: string
  callId?: string
  conversationId?: string
  contactHash?: string
  encryptedContent: string
  encryptedFields?: string
  fieldEnvelopes?: unknown
  authorEnvelope: unknown
  adminEnvelopes?: unknown[]
}

export interface UpdateNoteInput {
  encryptedContent: string
  authorPubkey: string
  authorEnvelope?: unknown
  adminEnvelopes?: unknown[]
  encryptedFields?: string
  fieldEnvelopes?: unknown
}

export interface CreateReplyInput {
  authorPubkey: string
  encryptedContent: string
  readerEnvelopes: unknown[]
}

export interface AddBanInput {
  hubId?: string
  phone: string
  reason: string
  bannedBy: string
}

// Infer row types from the schema
type NoteRow = typeof notes.$inferSelect
type NoteReplyRow = typeof noteReplies.$inferSelect
type BanRow = typeof bans.$inferSelect
type ContactMetaRow = typeof contactMetadata.$inferSelect

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class RecordsService {
  constructor(
    protected db: Database,
    protected audit: AuditService,
  ) {}

  // -----------------------------------------------------------------------
  // Notes — CRUD
  // -----------------------------------------------------------------------

  async createNote(input: CreateNoteInput): Promise<NoteRow> {
    const [note] = await this.db
      .insert(notes)
      .values({
        hubId: input.hubId ?? null,
        authorPubkey: input.authorPubkey,
        callId: input.callId ?? null,
        conversationId: input.conversationId ?? null,
        contactHash: input.contactHash ?? null,
        encryptedContent: input.encryptedContent,
        encryptedFields: input.encryptedFields ?? null,
        fieldEnvelopes: input.fieldEnvelopes ?? null,
        authorEnvelope: input.authorEnvelope,
        adminEnvelopes: input.adminEnvelopes ?? [],
        replyCount: 0,
      })
      .returning()

    // Maintain contact metadata secondary index
    if (input.contactHash) {
      await this.upsertContactMeta(
        input.contactHash,
        input.hubId ?? null,
        note.createdAt,
      )
    }

    return note
  }

  async getNote(id: string): Promise<NoteRow> {
    const [note] = await this.db
      .select()
      .from(notes)
      .where(eq(notes.id, id))

    if (!note) throw new ServiceError(404, 'Note not found')
    return note
  }

  async listNotes(
    filters: NoteFilters = {},
  ): Promise<{ notes: NoteRow[]; total: number }> {
    const { hubId, authorPubkey, callId, conversationId, contactHash, limit = 50, offset = 0 } = filters

    const conditions = []
    if (hubId) conditions.push(eq(notes.hubId, hubId))
    if (authorPubkey) conditions.push(eq(notes.authorPubkey, authorPubkey))
    if (callId) conditions.push(eq(notes.callId, callId))
    if (conversationId) conditions.push(eq(notes.conversationId, conversationId))
    if (contactHash) conditions.push(eq(notes.contactHash, contactHash))

    const where = conditions.length > 0 ? and(...conditions) : undefined

    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select()
        .from(notes)
        .where(where)
        .orderBy(desc(notes.createdAt))
        .limit(limit)
        .offset(offset),
      this.db
        .select({ total: count() })
        .from(notes)
        .where(where),
    ])

    return { notes: rows, total: Number(total) }
  }

  async updateNote(id: string, input: UpdateNoteInput): Promise<NoteRow> {
    const existing = await this.getNote(id)

    if (existing.authorPubkey !== input.authorPubkey) {
      throw new ServiceError(403, 'Only the note author can update this note')
    }

    const updates: Partial<typeof notes.$inferInsert> = {
      encryptedContent: input.encryptedContent,
      updatedAt: new Date(),
    }
    if (input.authorEnvelope !== undefined) updates.authorEnvelope = input.authorEnvelope
    if (input.adminEnvelopes !== undefined) updates.adminEnvelopes = input.adminEnvelopes
    if (input.encryptedFields !== undefined) updates.encryptedFields = input.encryptedFields
    if (input.fieldEnvelopes !== undefined) updates.fieldEnvelopes = input.fieldEnvelopes

    const [updated] = await this.db
      .update(notes)
      .set(updates)
      .where(eq(notes.id, id))
      .returning()

    return updated
  }

  async deleteNote(id: string): Promise<void> {
    const result = await this.db
      .delete(notes)
      .where(eq(notes.id, id))
      .returning({ id: notes.id })

    if (result.length === 0) {
      throw new ServiceError(404, 'Note not found')
    }
  }

  // -----------------------------------------------------------------------
  // Note Replies
  // -----------------------------------------------------------------------

  async createReply(noteId: string, input: CreateReplyInput): Promise<NoteReplyRow> {
    // Verify the parent note exists
    const note = await this.getNote(noteId)

    const [reply] = await this.db
      .insert(noteReplies)
      .values({
        noteId,
        authorPubkey: input.authorPubkey,
        encryptedContent: input.encryptedContent,
        readerEnvelopes: input.readerEnvelopes,
      })
      .returning()

    // Increment reply count on parent note
    await this.db
      .update(notes)
      .set({
        replyCount: sql`${notes.replyCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(notes.id, noteId))

    return reply
  }

  async listReplies(noteId: string): Promise<NoteReplyRow[]> {
    // Verify the parent note exists
    await this.getNote(noteId)

    return this.db
      .select()
      .from(noteReplies)
      .where(eq(noteReplies.noteId, noteId))
      .orderBy(asc(noteReplies.createdAt))
  }

  // -----------------------------------------------------------------------
  // Bans
  // -----------------------------------------------------------------------

  async addBan(input: AddBanInput): Promise<BanRow> {
    // Idempotent: if already banned, return existing
    const conditions = [eq(bans.phone, input.phone)]
    if (input.hubId) {
      conditions.push(eq(bans.hubId, input.hubId))
    } else {
      conditions.push(sql`${bans.hubId} IS NULL`)
    }

    const [existing] = await this.db
      .select()
      .from(bans)
      .where(and(...conditions))

    if (existing) return existing

    const [ban] = await this.db
      .insert(bans)
      .values({
        hubId: input.hubId ?? null,
        phone: input.phone,
        reason: input.reason,
        bannedBy: input.bannedBy,
      })
      .returning()

    return ban
  }

  async listBans(hubId?: string): Promise<{ bans: BanRow[] }> {
    const rows = hubId
      ? await this.db
          .select()
          .from(bans)
          .where(eq(bans.hubId, hubId))
          .orderBy(desc(bans.bannedAt))
      : await this.db
          .select()
          .from(bans)
          .orderBy(desc(bans.bannedAt))
    return { bans: rows }
  }

  async bulkAddBans(
    phones: string[],
    reason: string,
    bannedBy: string,
    hubId?: string,
  ): Promise<number> {
    // Get existing phones to avoid duplicates
    const existingRows = await this.db
      .select({ phone: bans.phone })
      .from(bans)
      .where(
        hubId
          ? eq(bans.hubId, hubId)
          : sql`${bans.hubId} IS NULL`,
      )

    const existingPhones = new Set(existingRows.map((r) => r.phone))
    const newPhones = phones.filter((p) => !existingPhones.has(p))

    if (newPhones.length === 0) return 0

    await this.db
      .insert(bans)
      .values(
        newPhones.map((phone) => ({
          hubId: hubId ?? null,
          phone,
          reason,
          bannedBy,
        })),
      )

    return newPhones.length
  }

  async removeBan(phone: string, hubId?: string): Promise<void> {
    const conditions = [eq(bans.phone, phone)]
    if (hubId) {
      conditions.push(eq(bans.hubId, hubId))
    } else {
      conditions.push(sql`${bans.hubId} IS NULL`)
    }

    await this.db
      .delete(bans)
      .where(and(...conditions))
  }

  async checkBan(phone: string, hubId?: string): Promise<boolean> {
    const conditions = [eq(bans.phone, phone)]
    if (hubId) {
      conditions.push(eq(bans.hubId, hubId))
    } else {
      conditions.push(sql`${bans.hubId} IS NULL`)
    }

    const [row] = await this.db
      .select({ id: bans.id })
      .from(bans)
      .where(and(...conditions))
      .limit(1)

    return !!row
  }

  // -----------------------------------------------------------------------
  // Contact Metadata
  // -----------------------------------------------------------------------

  async getContactMeta(
    contactHash: string,
    hubId?: string,
  ): Promise<ContactMetaRow | null> {
    const conditions = [eq(contactMetadata.contactHash, contactHash)]
    if (hubId) {
      conditions.push(eq(contactMetadata.hubId, hubId))
    } else {
      conditions.push(sql`${contactMetadata.hubId} IS NULL`)
    }

    const [row] = await this.db
      .select()
      .from(contactMetadata)
      .where(and(...conditions))

    return row ?? null
  }

  async listContacts(
    hubId?: string,
    limit = 50,
    offset = 0,
  ): Promise<{ contacts: ContactMetaRow[]; total: number }> {
    const condition = hubId
      ? eq(contactMetadata.hubId, hubId)
      : undefined

    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select()
        .from(contactMetadata)
        .where(condition)
        .orderBy(desc(contactMetadata.lastSeen))
        .limit(limit)
        .offset(offset),
      this.db
        .select({ total: count() })
        .from(contactMetadata)
        .where(condition),
    ])

    return { contacts: rows, total: Number(total) }
  }

  /**
   * Upsert contact metadata — called when a note is created to keep
   * firstSeen / lastSeen / noteCount accurate.
   */
  private async upsertContactMeta(
    contactHash: string,
    hubId: string | null,
    noteCreatedAt: Date,
  ): Promise<void> {
    await this.db
      .insert(contactMetadata)
      .values({
        contactHash,
        hubId,
        firstSeen: noteCreatedAt,
        lastSeen: noteCreatedAt,
        noteCount: 1,
      })
      .onConflictDoUpdate({
        target: [contactMetadata.contactHash, contactMetadata.hubId],
        set: {
          noteCount: sql`${contactMetadata.noteCount} + 1`,
          firstSeen: sql`LEAST(${contactMetadata.firstSeen}, ${noteCreatedAt})`,
          lastSeen: sql`GREATEST(${contactMetadata.lastSeen}, ${noteCreatedAt})`,
        },
      })
  }

  // -----------------------------------------------------------------------
  // Reset (demo/development only)
  // -----------------------------------------------------------------------

  async reset(): Promise<void> {
    await this.db.delete(noteReplies)
    await this.db.delete(notes)
    await this.db.delete(bans)
    await this.db.delete(contactMetadata)
  }

  // -----------------------------------------------------------------------
  // Migration status
  // -----------------------------------------------------------------------

  async getMigrationStatus(): Promise<{ noteCount: number; banCount: number }> {
    const [[{ noteCount }], [{ banCount }]] = await Promise.all([
      this.db.select({ noteCount: count() }).from(notes),
      this.db.select({ banCount: count() }).from(bans),
    ])

    return {
      noteCount: Number(noteCount),
      banCount: Number(banCount),
    }
  }
}
