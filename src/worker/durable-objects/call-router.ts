import { DurableObject } from 'cloudflare:workers'
import type { Env, CallRecord } from '../types'
import { hashPhone } from '../lib/crypto'
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
 * Handles:
 * - Active call tracking
 * - Parallel ringing coordination
 * - Call history
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
      const activeCalls = await this.ctx.storage.get<CallRecord[]>('activeCalls') || []
      const historyAll = await this.ctx.storage.get<CallRecord[]>('callHistory') || []
      console.log(`[call-history] active=${activeCalls.length} history=${historyAll.length}`)
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
      const history = await this.ctx.storage.get<CallRecord[]>('callHistory') || []
      return Response.json({
        activeCount: activeCalls.length,
        historyCount: history.length,
        activeCalls: activeCalls.map(c => ({
          id: c.id,
          status: c.status,
          startedAt: c.startedAt,
          answeredBy: c.answeredBy,
          callerLast4: c.callerLast4,
        })),
        recentHistory: history.slice(0, 5).map(c => ({
          id: c.id,
          status: c.status,
          startedAt: c.startedAt,
          endedAt: c.endedAt,
          duration: c.duration,
          answeredBy: c.answeredBy,
          callerLast4: c.callerLast4,
          hasTranscription: c.hasTranscription,
          hasVoicemail: c.hasVoicemail,
        })),
      })
    })

    // Broadcast endpoint — publishes to Nostr relay.
    // Previously sent to WebSocket connections; now routes publish Nostr directly
    // but some routes still call /broadcast as a convenience endpoint.
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
    // Search active calls first, then history
    const activeCalls = await this.ctx.storage.get<CallRecord[]>('activeCalls') || []
    let call = activeCalls.find(c => c.id === callId)
    if (!call) {
      const history = await this.ctx.storage.get<CallRecord[]>('callHistory') || []
      call = history.find(c => c.id === callId)
    }
    if (!call) return new Response('Call not found', { status: 404 })
    return Response.json({ call })
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

    // Move to history
    activeCalls.splice(callIdx, 1)
    await this.ctx.storage.put('activeCalls', activeCalls)

    const history = await this.ctx.storage.get<CallRecord[]>('callHistory') || []
    history.unshift(call)
    // Keep last 10000 records
    if (history.length > 10000) history.length = 10000
    await this.ctx.storage.put('callHistory', history)

    // Publish call ended to Nostr relay
    this.publishNostrEvent(KIND_CALL_UPDATE, {
      type: 'call:update',
      callId: call.id,
      status: 'completed',
    })

    // Publish presence update
    this.publishPresenceUpdate()

    return Response.json({ call })
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

    // Store in history
    const history = await this.ctx.storage.get<CallRecord[]>('callHistory') || []
    history.unshift(call)
    if (history.length > 10000) history.length = 10000
    await this.ctx.storage.put('callHistory', history)

    // Publish voicemail event to Nostr relay
    this.publishNostrEvent(KIND_CALL_VOICEMAIL, {
      type: 'voicemail:new',
      callId: call.id,
      startedAt: call.startedAt,
    })

    return Response.json({ call })
  }

  private async handleUpdateMetadata(callId: string, data: Record<string, unknown>): Promise<Response> {
    // Search active calls first, then history
    const activeCalls = await this.ctx.storage.get<CallRecord[]>('activeCalls') || []
    let call = activeCalls.find(c => c.id === callId)
    let source: 'active' | 'history' | null = call ? 'active' : null

    let history: CallRecord[] = []
    if (!call) {
      history = await this.ctx.storage.get<CallRecord[]>('callHistory') || []
      call = history.find(c => c.id === callId)
      source = call ? 'history' : null
    }

    if (!call || !source) {
      return new Response('Call not found', { status: 404 })
    }

    // Apply allowed metadata fields
    if (data.hasTranscription !== undefined) call.hasTranscription = Boolean(data.hasTranscription)
    if (data.hasVoicemail !== undefined) call.hasVoicemail = Boolean(data.hasVoicemail)
    if (data.recordingSid !== undefined) call.recordingSid = String(data.recordingSid)
    if (data.hasRecording !== undefined) call.hasRecording = Boolean(data.hasRecording)

    if (source === 'active') {
      await this.ctx.storage.put('activeCalls', activeCalls)
    } else {
      await this.ctx.storage.put('callHistory', history)
    }

    return Response.json({ call })
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
    // Ringing calls older than 3 minutes are stale (Twilio queues timeout well before this)
    // In-progress calls older than 2 hours are stale (no call should last that long)
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

    // Move stale calls to history instead of silently dropping them
    if (stale.length > 0) {
      const history = await this.ctx.storage.get<CallRecord[]>('callHistory') || []
      for (const call of stale) {
        call.status = call.status === 'ringing' ? 'unanswered' : 'completed'
        call.endedAt = call.endedAt || new Date().toISOString()
        call.duration = call.duration || Math.floor(
          (new Date(call.endedAt).getTime() - new Date(call.startedAt).getTime()) / 1000
        )
        history.unshift(call)
      }
      if (history.length > 10000) history.length = 10000
      await this.ctx.storage.put('callHistory', history)
      await this.ctx.storage.put('activeCalls', active)
    }

    return active
  }

  private async getCallHistory(
    page: number,
    limit: number,
    filters?: { search?: string; dateFrom?: string; dateTo?: string },
  ): Promise<Response> {
    let history = await this.ctx.storage.get<CallRecord[]>('callHistory') || []

    if (filters?.search) {
      const q = filters.search.toLowerCase()
      history = history.filter(c =>
        c.callerNumber.toLowerCase().includes(q) ||
        (c.answeredBy && c.answeredBy.toLowerCase().includes(q))
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

  /**
   * Derive volunteer presence from shift state + active calls.
   * Queries ShiftManagerDO for on-shift volunteers and correlates
   * with active call assignments.
   */
  private async getVolunteerPresence(): Promise<Response> {
    const onCallPubkeys = await this.getOnCallPubkeys()

    // Get on-shift volunteers from ShiftManagerDO
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
    const history = await this.ctx.storage.get<CallRecord[]>('callHistory') || []
    const activeCalls = await this.ctx.storage.get<CallRecord[]>('activeCalls') || []
    const todayStart = new Date()
    todayStart.setUTCHours(0, 0, 0, 0)
    const todayMs = todayStart.getTime()

    const historyToday = history.filter(c => new Date(c.startedAt).getTime() >= todayMs).length
    const activeToday = activeCalls.filter(c => new Date(c.startedAt).getTime() >= todayMs).length
    return Response.json({ count: historyToday + activeToday })
  }

  // --- Nostr Event Publishing ---

  /**
   * Publish a Nostr event for the hub this DO instance represents.
   * Content is JSON-stringified and published as-is — hub key encryption
   * will be added in Epic 76.2 integration.
   */
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

  /**
   * Publish a presence summary to the Nostr relay.
   * Derived from shift state + active calls.
   */
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
