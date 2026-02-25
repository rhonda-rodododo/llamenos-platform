import { DurableObject } from 'cloudflare:workers'
import type { Env, BanEntry, EncryptedNote, AuditLogEntry } from '../types'
import { DORouter } from '../lib/do-router'
import { runMigrations } from '../../shared/migrations/runner'
import { migrations } from '../../shared/migrations'

/**
 * RecordsDO — manages operational data:
 * - Bans
 * - Notes (encrypted)
 * - Audit log
 */
export class RecordsDO extends DurableObject<Env> {
  private migrated = false
  private router: DORouter

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.router = new DORouter()

    // --- Bans ---
    this.router.get('/bans', () => this.getBans())
    this.router.post('/bans', async (req) => this.addBan(await req.json()))
    this.router.post('/bans/bulk', async (req) => this.bulkAddBans(await req.json()))
    this.router.delete('/bans/:phone', (_req, { phone }) => this.removeBan(phone))
    this.router.get('/bans/check/:phone', (_req, { phone }) => this.checkBan(phone))

    // --- Notes ---
    this.router.get('/notes', (req) => {
      const url = new URL(req.url)
      const authorPubkey = url.searchParams.get('author')
      const callId = url.searchParams.get('callId')
      const page = url.searchParams.get('page') ? parseInt(url.searchParams.get('page')!) : undefined
      const limit = url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit')!) : undefined
      return this.getNotes(authorPubkey, callId, page, limit)
    })
    this.router.post('/notes', async (req) => this.createNoteEntry(await req.json()))
    this.router.patch('/notes/:id', async (req, { id }) => this.updateNoteEntry(id, await req.json()))

    // --- Audit Log ---
    this.router.get('/audit', (req) => {
      const url = new URL(req.url)
      const page = parseInt(url.searchParams.get('page') || '1')
      const limit = parseInt(url.searchParams.get('limit') || '50')
      const actorPubkey = url.searchParams.get('actorPubkey') || undefined
      const eventType = url.searchParams.get('eventType') || undefined
      const dateFrom = url.searchParams.get('dateFrom') || undefined
      const dateTo = url.searchParams.get('dateTo') || undefined
      const search = url.searchParams.get('search') || undefined
      return this.getAuditLog(page, limit, actorPubkey, eventType, dateFrom, dateTo, search)
    })
    this.router.post('/audit', async (req) => this.addAuditEntry(await req.json()))

    // --- Test Reset ---
    this.router.post('/reset', async () => {
      await this.ctx.storage.deleteAll()
      return Response.json({ ok: true })
    })
  }

  async fetch(request: Request): Promise<Response> {
    if (!this.migrated) {
      await runMigrations(this.ctx.storage, migrations, 'records')
      this.migrated = true
    }
    return this.router.handle(request)
  }

  // --- Ban Methods ---

  private async getBans(): Promise<Response> {
    const bans = await this.ctx.storage.get<BanEntry[]>('bans') || []
    return Response.json({ bans })
  }

  private async addBan(data: { phone: string; reason: string; bannedBy: string }): Promise<Response> {
    const bans = await this.ctx.storage.get<BanEntry[]>('bans') || []
    const ban: BanEntry = {
      phone: data.phone,
      reason: data.reason,
      bannedBy: data.bannedBy,
      bannedAt: new Date().toISOString(),
    }
    bans.push(ban)
    await this.ctx.storage.put('bans', bans)
    return Response.json({ ban })
  }

  private async bulkAddBans(data: { phones: string[]; reason: string; bannedBy: string }): Promise<Response> {
    const bans = await this.ctx.storage.get<BanEntry[]>('bans') || []
    const existing = new Set(bans.map(b => b.phone))
    let count = 0
    for (const phone of data.phones) {
      if (!existing.has(phone)) {
        bans.push({
          phone,
          reason: data.reason,
          bannedBy: data.bannedBy,
          bannedAt: new Date().toISOString(),
        })
        count++
      }
    }
    await this.ctx.storage.put('bans', bans)
    return Response.json({ count })
  }

  private async removeBan(phone: string): Promise<Response> {
    const bans = await this.ctx.storage.get<BanEntry[]>('bans') || []
    await this.ctx.storage.put('bans', bans.filter(b => b.phone !== phone))
    return Response.json({ ok: true })
  }

  private async checkBan(phone: string): Promise<Response> {
    const bans = await this.ctx.storage.get<BanEntry[]>('bans') || []
    const banned = bans.some(b => b.phone === phone)
    return Response.json({ banned })
  }

  // --- Note Methods ---

  private async getNotes(authorPubkey: string | null, callId: string | null, page?: number, limit?: number): Promise<Response> {
    const notes = await this.ctx.storage.get<EncryptedNote[]>('notes') || []
    let filtered = notes
    if (authorPubkey) {
      filtered = filtered.filter(n => n.authorPubkey === authorPubkey)
    }
    if (callId) {
      filtered = filtered.filter(n => n.callId === callId)
    }
    filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    const total = filtered.length
    if (page && limit) {
      const start = (page - 1) * limit
      filtered = filtered.slice(start, start + limit)
    }
    return Response.json({ notes: filtered, total })
  }

  private async createNoteEntry(data: {
    callId: string; authorPubkey: string; encryptedContent: string; ephemeralPubkey?: string
    authorEnvelope?: { wrappedKey: string; ephemeralPubkey: string }
    adminEnvelopes?: { pubkey: string; wrappedKey: string; ephemeralPubkey: string }[]
  }): Promise<Response> {
    const notes = await this.ctx.storage.get<EncryptedNote[]>('notes') || []
    const note: EncryptedNote = {
      id: crypto.randomUUID(),
      callId: data.callId,
      authorPubkey: data.authorPubkey,
      encryptedContent: data.encryptedContent,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...(data.ephemeralPubkey ? { ephemeralPubkey: data.ephemeralPubkey } : {}),
      ...(data.authorEnvelope ? { authorEnvelope: data.authorEnvelope } : {}),
      ...(data.adminEnvelopes ? { adminEnvelopes: data.adminEnvelopes } : {}),
    }
    notes.push(note)
    await this.ctx.storage.put('notes', notes)
    return Response.json({ note })
  }

  private async updateNoteEntry(id: string, data: {
    encryptedContent: string; authorPubkey: string
    authorEnvelope?: { wrappedKey: string; ephemeralPubkey: string }
    adminEnvelopes?: { pubkey: string; wrappedKey: string; ephemeralPubkey: string }[]
  }): Promise<Response> {
    const notes = await this.ctx.storage.get<EncryptedNote[]>('notes') || []
    const note = notes.find(n => n.id === id)
    if (!note) return new Response('Not found', { status: 404 })
    if (note.authorPubkey !== data.authorPubkey) return new Response('Forbidden', { status: 403 })
    note.encryptedContent = data.encryptedContent
    if (data.authorEnvelope) note.authorEnvelope = data.authorEnvelope
    if (data.adminEnvelopes) note.adminEnvelopes = data.adminEnvelopes
    note.updatedAt = new Date().toISOString()
    await this.ctx.storage.put('notes', notes)
    return Response.json({ note })
  }

  // --- Audit Log Methods ---

  private async getAuditLog(
    page: number,
    limit: number,
    actorPubkey?: string,
    eventType?: string,
    dateFrom?: string,
    dateTo?: string,
    search?: string,
  ): Promise<Response> {
    const entries = await this.ctx.storage.get<AuditLogEntry[]>('auditLog') || []

    // Event type category mapping
    const eventCategories: Record<string, string[]> = {
      authentication: ['login', 'logout', 'sessionCreated', 'sessionExpired', 'passkeyRegistered', 'deviceLinked'],
      volunteers: ['volunteerAdded', 'volunteerRemoved', 'volunteerRoleChanged', 'volunteerActivated', 'volunteerDeactivated', 'volunteerOnBreak', 'volunteerOffBreak', 'inviteCreated', 'inviteRedeemed'],
      calls: ['callAnswered', 'callEnded', 'callMissed', 'spamReported', 'voicemailReceived'],
      settings: ['settingsUpdated', 'telephonyConfigured', 'transcriptionToggled', 'ivrUpdated', 'customFieldsUpdated', 'spamSettingsUpdated', 'callSettingsUpdated'],
      shifts: ['shiftCreated', 'shiftUpdated', 'shiftDeleted'],
      notes: ['noteCreated', 'noteUpdated'],
    }

    const fromTime = dateFrom ? new Date(dateFrom).getTime() : undefined
    const toTime = dateTo ? new Date(dateTo + 'T23:59:59.999Z').getTime() : undefined

    let filtered = entries

    if (actorPubkey) filtered = filtered.filter(e => e.actorPubkey === actorPubkey)

    if (eventType && eventCategories[eventType]) {
      const allowedEvents = eventCategories[eventType]
      filtered = filtered.filter(e => allowedEvents.includes(e.event))
    }

    if (fromTime) filtered = filtered.filter(e => new Date(e.createdAt).getTime() >= fromTime)
    if (toTime) filtered = filtered.filter(e => new Date(e.createdAt).getTime() <= toTime)

    if (search) {
      const lower = search.toLowerCase()
      filtered = filtered.filter(e =>
        e.event.toLowerCase().includes(lower) ||
        e.actorPubkey.toLowerCase().includes(lower) ||
        JSON.stringify(e.details).toLowerCase().includes(lower)
      )
    }

    const sorted = filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    const start = (page - 1) * limit
    return Response.json({
      entries: sorted.slice(start, start + limit),
      total: sorted.length,
    })
  }

  private async addAuditEntry(data: { event: string; actorPubkey: string; details: Record<string, unknown> }): Promise<Response> {
    const entries = await this.ctx.storage.get<AuditLogEntry[]>('auditLog') || []
    const entry: AuditLogEntry = {
      id: crypto.randomUUID(),
      event: data.event,
      actorPubkey: data.actorPubkey,
      details: data.details,
      createdAt: new Date().toISOString(),
    }
    entries.push(entry)
    await this.ctx.storage.put('auditLog', entries)
    return Response.json({ entry })
  }
}
