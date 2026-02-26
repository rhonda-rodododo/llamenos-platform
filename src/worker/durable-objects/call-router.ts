import { DurableObject } from 'cloudflare:workers'
import type { Env, CallRecord, EncryptedCallRecord, CallRecordMetadata } from '../types'
import { hashPhone, encryptCallRecordForStorage } from '../lib/crypto'
import { DORouter } from '../lib/do-router'
import { runMigrations } from '../../shared/migrations/runner'
import { migrations } from '../../shared/migrations'
import { getNostrPublisher } from '../lib/do-access'
import { KIND_CALL_RING, KIND_CALL_UPDATE, KIND_CALL_VOICEMAIL, KIND_PRESENCE_UPDATE } from '../../shared/nostr-events'

/**
 * CallRouterDO — manages real-time call state.
 *
 * Real-time event delivery is handled via the Nostr relay.
 * Call actions (answer, hangup, spam) are REST endpoints.
 * Presence is derived from shift state + active calls.
 *
 * Storage strategy (Epic 77):
 * - Active calls: array in 'activeCalls' key (transient, needed for routing)
 * - Call history: per-record keys `callrecord:${callId}` (encrypted, scalable)
 *   Sensitive metadata (answeredBy, callerNumber) is envelope-encrypted for admins.
 */
export class CallRouterDO extends DurableObject<Env> {
  private migrated = false
  private router: DORouter

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.router = new DORouter()

    this.router.get('/calls/active', () => this.getActiveCalls())
    this.router.get('/calls/presence', () => this.getVolunteerPresence())
    this.router.get('/calls/today-count', () => this.getCallsTodayCount())
    this.router.get('/calls/history', async (req) => {
      const url = new URL(req.url)
      const page = parseInt(url.searchParams.get('page') || '1')
      const limit = parseInt(url.searchParams.get('limit') || '50')
      const search = url.searchParams.get('search') || undefined
      const dateFrom = url.searchParams.get('dateFrom') || undefined
      const dateTo = url.searchParams.get('dateTo') || undefined
      return this.getCallHistory(page, limit, { search, dateFrom, dateTo })
    })
    this.router.get('/calls/:callId', async (_req, { callId }) => this.getCallById(callId))
    this.router.post('/calls/incoming', async (req) => this.handleIncomingCall(await req.json()))
    this.router.post('/calls/:callId/answer', async (req, { callId }) => this.handleCallAnswered(callId, await req.json()))
    this.router.post('/calls/:callId/end', (_req, { callId }) => this.handleCallEnded(callId))
    this.router.post('/calls/:callId/voicemail', (_req, { callId }) => this.handleVoicemailLeft(callId))
    this.router.patch('/calls/:callId/metadata', async (req, { callId }) => this.handleUpdateMetadata(callId, await req.json()))
    this.router.post('/calls/:callId/spam', async (req, { callId }) => this.handleReportSpam(callId, await req.json()))
    this.router.get('/calls/debug', async () => {
      const activeCalls = await this.ctx.storage.get<CallRecord[]>('activeCalls') || []
      const historyRecords = await this.ctx.storage.list<EncryptedCallRecord>({ prefix: 'callrecord:' })
      return Response.json({
        activeCount: activeCalls.length,
        historyCount: historyRecords.size,
        activeCalls: activeCalls.map(c => ({
          id: c.id,
          status: c.status,
          startedAt: c.startedAt,
          answeredBy: c.answeredBy,
          callerLast4: c.callerLast4,
        })),
        recentHistory: Array.from(historyRecords.values()).slice(0, 5).map(c => ({
          id: c.id,
          status: c.status,
          startedAt: c.startedAt,
          endedAt: c.endedAt,
          duration: c.duration,
          callerLast4: c.callerLast4,
          hasTranscription: c.hasTranscription,
          hasVoicemail: c.hasVoicemail,
        })),
      })
    })

    // Broadcast endpoint — publishes to Nostr relay.
    this.router.post('/broadcast', async (req) => {
      const message = await req.json() as Record<string, unknown>
      this.publishNostrEvent(KIND_CALL_UPDATE, message)
      return Response.json({ ok: true })
    })

    // Targeted broadcast — publishes to Nostr (target filtering is client-side)
    this.router.post('/broadcast/targeted', async (req) => {
      const { message } = await req.json() as { pubkeys: string[]; message: Record<string, unknown> }
      this.publishNostrEvent(KIND_CALL_UPDATE, message)
      return Response.json({ ok: true })
    })

    this.router.post('/reset', async () => {
      await this.ctx.storage.deleteAll()
      return Response.json({ ok: true })
    })
  }

  async fetch(request: Request): Promise<Response> {
    if (!this.migrated) {
      await runMigrations(this.ctx.storage, migrations, 'calls')
      this.migrated = true
    }
    return this.router.handle(request)
  }

  // --- Helpers ---

  /** Get admin decryption pubkeys for envelope encryption */
  private getAdminPubkeys(): string[] {
    const pubkeys: string[] = []
    const decryptionPubkey = this.env.ADMIN_DECRYPTION_PUBKEY || this.env.ADMIN_PUBKEY
    if (decryptionPubkey) pubkeys.push(decryptionPubkey)
    return pubkeys
  }

  /** Encrypt a completed call record and store as per-record key */
  private async storeEncryptedCallRecord(call: CallRecord): Promise<EncryptedCallRecord> {
    const adminPubkeys = this.getAdminPubkeys()

    // Sensitive metadata encrypted for admins
    const metadata: CallRecordMetadata = {
      answeredBy: call.answeredBy,
      callerNumber: call.callerNumber,
    }

    const { encryptedContent, adminEnvelopes } = adminPubkeys.length > 0
      ? encryptCallRecordForStorage({ ...metadata }, adminPubkeys)
      : { encryptedContent: '', adminEnvelopes: [] }

    const encrypted: EncryptedCallRecord = {
      id: call.id,
      callerLast4: call.callerLast4,
      startedAt: call.startedAt,
      endedAt: call.endedAt,
      duration: call.duration,
      status: call.status as 'completed' | 'unanswered',
      hasTranscription: call.hasTranscription,
      hasVoicemail: call.hasVoicemail,
      hasRecording: call.hasRecording,
      recordingSid: call.recordingSid,
      encryptedContent,
      adminEnvelopes,
    }

    await this.ctx.storage.put(`callrecord:${call.id}`, encrypted)
    return encrypted
  }

  /** Get the set of pubkeys currently on an active call */
  private async getOnCallPubkeys(): Promise<Set<string>> {
    const calls = await this.ctx.storage.get<CallRecord[]>('activeCalls') || []
    return new Set(
      calls
        .filter(c => c.answeredBy && c.status === 'in-progress')
        .map(c => c.answeredBy!)
    )
  }

  // --- Single Call Lookup ---

  private async getCallById(callId: string): Promise<Response> {
    // Search active calls first, then per-record history
    const activeCalls = await this.ctx.storage.get<CallRecord[]>('activeCalls') || []
    const activeCall = activeCalls.find(c => c.id === callId)
    if (activeCall) return Response.json({ call: activeCall })

    const encrypted = await this.ctx.storage.get<EncryptedCallRecord>(`callrecord:${callId}`)
    if (encrypted) return Response.json({ call: encrypted })

    return new Response('Call not found', { status: 404 })
  }

  // --- Call Handling ---

  private async handleIncomingCall(data: {
    callSid: string
    callerNumber: string
    volunteerPubkeys: string[]
  }): Promise<Response> {
    // Store last 4 digits for admin display, hash the rest
    const digits = data.callerNumber.replace(/\D/g, '')
    const last4 = digits.length >= 4 ? digits.slice(-4) : digits

    const call: CallRecord = {
      id: data.callSid,
      callerNumber: hashPhone(data.callerNumber, this.env.HMAC_SECRET),
      callerLast4: last4,
      answeredBy: null,
      startedAt: new Date().toISOString(),
      status: 'ringing',
      hasTranscription: false,
      hasVoicemail: false,
    }

    // Store active call
    const activeCalls = await this.ctx.storage.get<CallRecord[]>('activeCalls') || []
    activeCalls.push(call)
    await this.ctx.storage.put('activeCalls', activeCalls)

    // Publish to Nostr relay (redacted — no PII in relay events)
    this.publishNostrEvent(KIND_CALL_RING, {
      type: 'call:ring',
      callId: call.id,
      callerLast4: call.callerLast4,
      startedAt: call.startedAt,
    })

    return Response.json({ call })
  }

  private async handleCallAnswered(callId: string, data: { pubkey: string }): Promise<Response> {
    const activeCalls = await this.ctx.storage.get<CallRecord[]>('activeCalls') || []
    const call = activeCalls.find(c => c.id === callId)
    if (!call) return new Response('Call not found', { status: 404 })

    call.answeredBy = data.pubkey
    call.status = 'in-progress'
    await this.ctx.storage.put('activeCalls', activeCalls)

    // Publish call update to Nostr relay
    this.publishNostrEvent(KIND_CALL_UPDATE, {
      type: 'call:update',
      callId: call.id,
      status: call.status,
      answeredBy: call.answeredBy,
    })

    // Publish presence update
    this.publishPresenceUpdate()

    return Response.json({ call })
  }

  private async handleCallEnded(callId: string): Promise<Response> {
    const activeCalls = await this.ctx.storage.get<CallRecord[]>('activeCalls') || []
    const callIdx = activeCalls.findIndex(c => c.id === callId)
    if (callIdx === -1) return new Response('Call not found', { status: 404 })

    const call = activeCalls[callIdx]
    call.status = 'completed'
    call.endedAt = new Date().toISOString()
    call.duration = Math.floor(
      (new Date(call.endedAt).getTime() - new Date(call.startedAt).getTime()) / 1000
    )

    // Remove from active, encrypt and store per-record
    activeCalls.splice(callIdx, 1)
    await this.ctx.storage.put('activeCalls', activeCalls)
    const encrypted = await this.storeEncryptedCallRecord(call)

    // Publish call ended to Nostr relay
    this.publishNostrEvent(KIND_CALL_UPDATE, {
      type: 'call:update',
      callId: call.id,
      status: 'completed',
    })

    // Publish presence update
    this.publishPresenceUpdate()

    return Response.json({ call: encrypted })
  }

  private async handleVoicemailLeft(callId: string): Promise<Response> {
    // Move from active calls to history as 'unanswered' with voicemail
    const activeCalls = await this.ctx.storage.get<CallRecord[]>('activeCalls') || []
    const callIdx = activeCalls.findIndex(c => c.id === callId)

    let call: CallRecord
    if (callIdx !== -1) {
      call = activeCalls[callIdx]
      call.status = 'unanswered'
      call.hasVoicemail = true
      call.endedAt = new Date().toISOString()
      call.duration = Math.floor(
        (new Date(call.endedAt).getTime() - new Date(call.startedAt).getTime()) / 1000
      )
      activeCalls.splice(callIdx, 1)
      await this.ctx.storage.put('activeCalls', activeCalls)
    } else {
      // Call wasn't tracked (edge case) — create a record
      call = {
        id: callId,
        callerNumber: '[unknown]',
        answeredBy: null,
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
        duration: 0,
        status: 'unanswered',
        hasTranscription: false,
        hasVoicemail: true,
      }
    }

    // Encrypt and store per-record
    const encrypted = await this.storeEncryptedCallRecord(call)

    // Publish voicemail event to Nostr relay
    this.publishNostrEvent(KIND_CALL_VOICEMAIL, {
      type: 'voicemail:new',
      callId: call.id,
      startedAt: call.startedAt,
    })

    return Response.json({ call: encrypted })
  }

  private async handleUpdateMetadata(callId: string, data: Record<string, unknown>): Promise<Response> {
    // Search active calls first
    const activeCalls = await this.ctx.storage.get<CallRecord[]>('activeCalls') || []
    const activeCall = activeCalls.find(c => c.id === callId)

    if (activeCall) {
      if (data.hasTranscription !== undefined) activeCall.hasTranscription = Boolean(data.hasTranscription)
      if (data.hasVoicemail !== undefined) activeCall.hasVoicemail = Boolean(data.hasVoicemail)
      if (data.recordingSid !== undefined) activeCall.recordingSid = String(data.recordingSid)
      if (data.hasRecording !== undefined) activeCall.hasRecording = Boolean(data.hasRecording)
      await this.ctx.storage.put('activeCalls', activeCalls)
      return Response.json({ call: activeCall })
    }

    // Search per-record history
    const encrypted = await this.ctx.storage.get<EncryptedCallRecord>(`callrecord:${callId}`)
    if (encrypted) {
      // Update plaintext metadata fields (not inside encrypted content)
      if (data.hasTranscription !== undefined) encrypted.hasTranscription = Boolean(data.hasTranscription)
      if (data.hasVoicemail !== undefined) encrypted.hasVoicemail = Boolean(data.hasVoicemail)
      if (data.recordingSid !== undefined) encrypted.recordingSid = String(data.recordingSid)
      if (data.hasRecording !== undefined) encrypted.hasRecording = Boolean(data.hasRecording)
      await this.ctx.storage.put(`callrecord:${callId}`, encrypted)
      return Response.json({ call: encrypted })
    }

    return new Response('Call not found', { status: 404 })
  }

  private async handleReportSpam(callId: string, data: { pubkey: string }): Promise<Response> {
    const activeCalls = await this.ctx.storage.get<CallRecord[]>('activeCalls') || []
    const call = activeCalls.find(c => c.id === callId)
    // Return the caller number so the API can add it to the ban list
    return Response.json({
      callId,
      callerNumber: call?.callerNumber || null,
      reportedBy: data.pubkey,
    })
  }

  // --- Query Methods ---

  private async getActiveCalls(): Promise<Response> {
    const calls = await this.getActiveCallsList()
    return Response.json({ calls })
  }

  private async getActiveCallsList(): Promise<CallRecord[]> {
    const calls = await this.ctx.storage.get<CallRecord[]>('activeCalls') || []
    const now = Date.now()
    const RINGING_TTL = 3 * 60 * 1000
    const IN_PROGRESS_TTL = 2 * 60 * 60 * 1000

    const active: CallRecord[] = []
    const stale: CallRecord[] = []

    for (const c of calls) {
      const age = now - new Date(c.startedAt).getTime()
      if ((c.status === 'ringing' && age > RINGING_TTL) ||
          (c.status === 'in-progress' && age > IN_PROGRESS_TTL)) {
        stale.push(c)
      } else {
        active.push(c)
      }
    }

    // Move stale calls to encrypted per-record history
    if (stale.length > 0) {
      for (const call of stale) {
        call.status = call.status === 'ringing' ? 'unanswered' : 'completed'
        call.endedAt = call.endedAt || new Date().toISOString()
        call.duration = call.duration || Math.floor(
          (new Date(call.endedAt).getTime() - new Date(call.startedAt).getTime()) / 1000
        )
        await this.storeEncryptedCallRecord(call)
      }
      await this.ctx.storage.put('activeCalls', active)
    }

    return active
  }

  private async getCallHistory(
    page: number,
    limit: number,
    filters?: { search?: string; dateFrom?: string; dateTo?: string },
  ): Promise<Response> {
    // Fetch all per-record history entries
    const records = await this.ctx.storage.list<EncryptedCallRecord>({ prefix: 'callrecord:' })
    let history = Array.from(records.values())

    // Sort newest first
    history.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())

    // Filter by callerLast4 (only plaintext-searchable field)
    if (filters?.search) {
      const q = filters.search.toLowerCase()
      history = history.filter(c =>
        (c.callerLast4 && c.callerLast4.includes(q)) ||
        c.id.toLowerCase().includes(q)
      )
    }
    if (filters?.dateFrom) {
      const from = new Date(filters.dateFrom).getTime()
      history = history.filter(c => new Date(c.startedAt).getTime() >= from)
    }
    if (filters?.dateTo) {
      const to = new Date(filters.dateTo).getTime() + 86_400_000 // end of day
      history = history.filter(c => new Date(c.startedAt).getTime() <= to)
    }

    const start = (page - 1) * limit
    return Response.json({
      calls: history.slice(start, start + limit),
      total: history.length,
    })
  }

  // --- Presence ---

  private async getVolunteerPresence(): Promise<Response> {
    const onCallPubkeys = await this.getOnCallPubkeys()

    let onShiftPubkeys: string[] = []
    try {
      const shiftDO = this.env.SHIFT_MANAGER.get(this.env.SHIFT_MANAGER.idFromName('global-shifts'))
      const shiftRes = await shiftDO.fetch(new Request('http://do/current-volunteers'))
      if (shiftRes.ok) {
        const data = await shiftRes.json() as { volunteers?: string[] }
        onShiftPubkeys = Array.isArray(data.volunteers) ? data.volunteers : []
      }
    } catch {
      // Shift DO not available — fall back to empty
    }

    const statuses: Array<{ pubkey: string; status: 'available' | 'on-call' | 'online' }> = []
    for (const pubkey of onShiftPubkeys) {
      statuses.push({
        pubkey,
        status: onCallPubkeys.has(pubkey) ? 'on-call' : 'available',
      })
    }

    return Response.json({ volunteers: statuses })
  }

  private async getCallsTodayCount(): Promise<Response> {
    const activeCalls = await this.ctx.storage.get<CallRecord[]>('activeCalls') || []
    const todayStart = new Date()
    todayStart.setUTCHours(0, 0, 0, 0)
    const todayMs = todayStart.getTime()

    // Count active calls from today
    const activeToday = activeCalls.filter(c => new Date(c.startedAt).getTime() >= todayMs).length

    // Count history records from today (per-record storage)
    const records = await this.ctx.storage.list<EncryptedCallRecord>({ prefix: 'callrecord:' })
    let historyToday = 0
    for (const record of records.values()) {
      if (new Date(record.startedAt).getTime() >= todayMs) historyToday++
    }

    return Response.json({ count: historyToday + activeToday })
  }

  // --- Nostr Event Publishing ---

  private publishNostrEvent(kind: number, content: Record<string, unknown>): void {
    try {
      const publisher = getNostrPublisher(this.env)
      const hubTag = 'global'
      publisher.publish({
        kind,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ['d', hubTag],
          ['t', 'llamenos:event'],
        ],
        content: JSON.stringify(content),
      }).catch(err => {
        console.error('[nostr] Failed to publish event:', err)
      })
    } catch {
      // Nostr not configured — silently skip
    }
  }

  private async publishPresenceUpdate(): Promise<void> {
    const onCallPubkeys = await this.getOnCallPubkeys()

    let onShiftCount = 0
    try {
      const shiftDO = this.env.SHIFT_MANAGER.get(this.env.SHIFT_MANAGER.idFromName('global-shifts'))
      const shiftRes = await shiftDO.fetch(new Request('http://do/current-volunteers'))
      if (shiftRes.ok) {
        const data = await shiftRes.json() as { volunteers?: string[] }
        onShiftCount = Array.isArray(data.volunteers) ? data.volunteers.length : 0
      }
    } catch {}

    const available = Math.max(0, onShiftCount - onCallPubkeys.size)
    this.publishNostrEvent(KIND_PRESENCE_UPDATE, {
      type: 'presence:summary',
      hasAvailable: available > 0,
    })
  }
}
