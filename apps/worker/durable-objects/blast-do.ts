import { DurableObject } from 'cloudflare:workers'
import type { Env } from '../types'
import type { MessagingChannelType, Subscriber, Blast, BlastSettings, BlastContent } from '@shared/types'
import { DEFAULT_BLAST_SETTINGS } from '@shared/types'
import { DORouter } from '../lib/do-router'
import { runMigrations } from '@shared/migrations/runner'
import { migrations } from '@shared/migrations'
import { registerMigrationRoutes } from '@shared/migrations/do-routes'
import { hmac } from '@noble/hashes/hmac.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import { utf8ToBytes } from '@noble/ciphers/utils.js'
import { HMAC_PREFERENCE_TOKEN, HMAC_SUBSCRIBER } from '@shared/crypto-labels'

/**
 * BlastDO — manages subscriber lists and broadcast messaging.
 * Singleton Durable Object (idFromName('global-blasts')).
 *
 * Extracted from ConversationDO (Epic 119) to separate concerns:
 * - Subscriber lifecycle (subscribe, unsubscribe, import, preferences)
 * - Blast CRUD (create, schedule, send, cancel)
 * - Blast settings (keywords, double opt-in)
 * - Alarm-driven batch delivery
 */
export class BlastDO extends DurableObject<Env> {
  private migrated = false
  private router: DORouter

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.router = new DORouter()

    // --- Subscribers ---
    this.router.post('/subscribers/keyword', async (req) => this.handleSubscriberKeyword(await req.json()))
    this.router.get('/subscribers', (req) => this.listSubscribers(req))
    this.router.get('/subscribers/stats', () => this.getSubscriberStats())
    this.router.post('/subscribers/import', async (req) => this.importSubscribers(await req.json()))
    this.router.post('/subscribers/validate-token', async (req) => this.validatePreferenceToken(await req.json()))
    this.router.patch('/subscribers/update-preferences', async (req) => this.updateSubscriberPreferences(await req.json()))
    this.router.delete('/subscribers/:id', (_req, { id }) => this.deleteSubscriber(id))

    // --- Blasts ---
    this.router.post('/blasts', async (req) => this.createBlast(await req.json()))
    this.router.get('/blasts', (req) => this.listBlasts(req))
    this.router.get('/blasts/:id', (_req, { id }) => this.getBlast(id))
    this.router.patch('/blasts/:id', async (req, { id }) => this.updateBlast(id, await req.json()))
    this.router.delete('/blasts/:id', (_req, { id }) => this.deleteBlast(id))
    this.router.post('/blasts/:id/send', (_req, { id }) => this.sendBlast(id))
    this.router.post('/blasts/:id/schedule', async (req, { id }) => this.scheduleBlast(id, await req.json()))
    this.router.post('/blasts/:id/cancel', (_req, { id }) => this.cancelBlast(id))

    // --- Blast Settings ---
    this.router.get('/blast-settings', () => this.getBlastSettings())
    this.router.patch('/blast-settings', async (req) => this.updateBlastSettings(await req.json()))

    // --- Migration Management (Epic 286) ---
    registerMigrationRoutes(this.router, () => this.ctx.storage, 'blasts')

    // --- Test Reset (demo mode only — Epic 258 C3) ---
    this.router.post('/reset', async () => {
      if (this.env.DEMO_MODE !== 'true') {
        return new Response('Reset not allowed outside demo mode', { status: 403 })
      }
      await this.ctx.storage.deleteAll()
      return Response.json({ ok: true })
    })
  }

  async fetch(request: Request): Promise<Response> {
    if (!this.migrated) {
      await runMigrations(this.ctx.storage, migrations, 'blasts')
      this.migrated = true
    }
    return this.router.handle(request)
  }

  // --- Subscriber Management ---

  private generatePreferenceToken(identifierHash: string): string {
    const key = hexToBytes(this.env.HMAC_SECRET)
    const input = utf8ToBytes(`${HMAC_PREFERENCE_TOKEN}${identifierHash}`)
    return bytesToHex(hmac(sha256, key, input))
  }

  private async getBlastSettingsData(): Promise<BlastSettings> {
    return await this.ctx.storage.get<BlastSettings>('blast-settings') || DEFAULT_BLAST_SETTINGS
  }

  private async getAllSubscribers(): Promise<Subscriber[]> {
    const map = await this.ctx.storage.list<Subscriber>({ prefix: 'subscribers:' })
    return [...map.values()]
  }

  private async handleSubscriberKeyword(data: {
    identifier: string
    identifierHash: string
    keyword: string
    channel: MessagingChannelType
  }): Promise<Response> {
    const settings = await this.getBlastSettingsData()
    const normalizedKeyword = data.keyword.toUpperCase()

    if (normalizedKeyword === settings.unsubscribeKeyword.toUpperCase() || normalizedKeyword === 'STOP') {
      // Find subscriber by identifierHash
      const existing = await this.ctx.storage.get<Subscriber>(`subscribers:${data.identifierHash}`)
      if (existing) {
        existing.status = 'unsubscribed'
        await this.ctx.storage.put(`subscribers:${data.identifierHash}`, existing)
      }
      return Response.json({ action: 'unsubscribed', message: settings.unsubscribeMessage })
    }

    if (normalizedKeyword === settings.subscribeKeyword.toUpperCase()) {
      const existing = await this.ctx.storage.get<Subscriber>(`subscribers:${data.identifierHash}`)
      if (existing) {
        // Re-subscribe
        existing.status = 'active'
        const hasChannel = existing.channels.some(ch => ch.type === data.channel)
        if (!hasChannel) {
          existing.channels.push({ type: data.channel, verified: true })
        }
        await this.ctx.storage.put(`subscribers:${data.identifierHash}`, existing)
        // Update channel index
        await this.addToChannelIndex(data.channel, existing.id)
        return Response.json({ action: 'resubscribed', message: settings.confirmationMessage })
      }

      // Create new subscriber
      const subscriber: Subscriber = {
        id: crypto.randomUUID(),
        identifierHash: data.identifierHash,
        channels: [{ type: data.channel, verified: true }],
        tags: [],
        language: 'en',
        subscribedAt: new Date().toISOString(),
        status: settings.doubleOptIn ? 'paused' : 'active',
        doubleOptInConfirmed: !settings.doubleOptIn,
        preferenceToken: this.generatePreferenceToken(data.identifierHash),
      }

      await this.ctx.storage.put(`subscribers:${data.identifierHash}`, subscriber)
      // Write preference token index for constant-time lookup
      await this.ctx.storage.put(`preferenceToken:${subscriber.preferenceToken}`, data.identifierHash)
      await this.addToChannelIndex(data.channel, subscriber.id)

      return Response.json({
        action: 'subscribed',
        message: settings.confirmationMessage,
        subscriberId: subscriber.id,
      })
    }

    return Response.json({ action: 'ignored' })
  }

  private async addToChannelIndex(channel: MessagingChannelType, subscriberId: string): Promise<void> {
    const key = `subscriber-index:channel:${channel}`
    const ids = await this.ctx.storage.get<string[]>(key) || []
    if (!ids.includes(subscriberId)) {
      ids.push(subscriberId)
      await this.ctx.storage.put(key, ids)
    }
  }

  private async removeFromChannelIndex(channel: MessagingChannelType, subscriberId: string): Promise<void> {
    const key = `subscriber-index:channel:${channel}`
    const ids = await this.ctx.storage.get<string[]>(key) || []
    const filtered = ids.filter(id => id !== subscriberId)
    await this.ctx.storage.put(key, filtered)
  }

  private async listSubscribers(req: Request): Promise<Response> {
    const url = new URL(req.url)
    const tag = url.searchParams.get('tag')
    const channel = url.searchParams.get('channel') as MessagingChannelType | null
    const status = url.searchParams.get('status') as Subscriber['status'] | null
    const page = parseInt(url.searchParams.get('page') || '1')
    const limit = parseInt(url.searchParams.get('limit') || '50')

    let subscribers = await this.getAllSubscribers()

    if (tag) {
      subscribers = subscribers.filter(s => s.tags.includes(tag))
    }
    if (channel) {
      subscribers = subscribers.filter(s => s.channels.some(ch => ch.type === channel))
    }
    if (status) {
      subscribers = subscribers.filter(s => s.status === status)
    }

    // Sort by subscribedAt, newest first
    subscribers.sort((a, b) => new Date(b.subscribedAt).getTime() - new Date(a.subscribedAt).getTime())

    const start = (page - 1) * limit
    return Response.json({
      subscribers: subscribers.slice(start, start + limit),
      total: subscribers.length,
    })
  }

  private async deleteSubscriber(id: string): Promise<Response> {
    const subscribers = await this.getAllSubscribers()
    const subscriber = subscribers.find(s => s.id === id)
    if (!subscriber) return new Response('Subscriber not found', { status: 404 })

    // Remove from channel indexes
    for (const ch of subscriber.channels) {
      await this.removeFromChannelIndex(ch.type, subscriber.id)
    }

    // Remove preference token index
    if (subscriber.preferenceToken) {
      await this.ctx.storage.delete(`preferenceToken:${subscriber.preferenceToken}`)
    }

    await this.ctx.storage.delete(`subscribers:${subscriber.identifierHash}`)
    return Response.json({ ok: true })
  }

  private async getSubscriberStats(): Promise<Response> {
    const subscribers = await this.getAllSubscribers()
    const byChannel: Record<string, number> = {}
    const byStatus: Record<string, number> = { active: 0, paused: 0, unsubscribed: 0 }

    for (const sub of subscribers) {
      const statusKey = sub.status
      byStatus[statusKey] = (byStatus[statusKey] || 0) + 1
      for (const ch of sub.channels) {
        byChannel[ch.type] = (byChannel[ch.type] || 0) + 1
      }
    }

    return Response.json({ total: subscribers.length, byChannel, byStatus })
  }

  private async importSubscribers(data: {
    subscribers: Array<{
      identifier: string
      channel: MessagingChannelType
      tags?: string[]
      language?: string
    }>
  }): Promise<Response> {
    let imported = 0
    let skipped = 0

    for (const entry of data.subscribers) {
      // Generate identifier hash using HMAC with server secret (consistent with hashPhone pattern)
      const identifierHash = bytesToHex(
        hmac(sha256, hexToBytes(this.env.HMAC_SECRET), utf8ToBytes(`${HMAC_SUBSCRIBER}${entry.identifier}`))
      )

      const existing = await this.ctx.storage.get<Subscriber>(`subscribers:${identifierHash}`)
      if (existing) {
        // Add channel if not present
        const hasChannel = existing.channels.some(ch => ch.type === entry.channel)
        if (!hasChannel) {
          existing.channels.push({ type: entry.channel, verified: false })
          await this.ctx.storage.put(`subscribers:${identifierHash}`, existing)
          await this.addToChannelIndex(entry.channel, existing.id)
        }
        if (entry.tags) {
          const newTags = entry.tags.filter(t => !existing.tags.includes(t))
          if (newTags.length > 0) {
            existing.tags.push(...newTags)
            await this.ctx.storage.put(`subscribers:${identifierHash}`, existing)
          }
        }
        skipped++
        continue
      }

      const subscriber: Subscriber = {
        id: crypto.randomUUID(),
        identifierHash,
        channels: [{ type: entry.channel, verified: false }],
        tags: entry.tags || [],
        language: entry.language || 'en',
        subscribedAt: new Date().toISOString(),
        status: 'active',
        doubleOptInConfirmed: false,
        preferenceToken: this.generatePreferenceToken(identifierHash),
      }

      await this.ctx.storage.put(`subscribers:${identifierHash}`, subscriber)
      // Write preference token index for constant-time lookup
      await this.ctx.storage.put(`preferenceToken:${subscriber.preferenceToken}`, identifierHash)
      await this.addToChannelIndex(entry.channel, subscriber.id)
      imported++
    }

    return Response.json({ imported, skipped, total: imported + skipped })
  }

  private async validatePreferenceToken(data: { token: string }): Promise<Response> {
    // Direct storage lookup via index instead of scanning all subscribers
    const subscriberHash = await this.ctx.storage.get<string>(`preferenceToken:${data.token}`)
    if (!subscriberHash) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 404 })
    }
    const subscriber = await this.ctx.storage.get<Subscriber>(`subscribers:${subscriberHash}`)
    if (!subscriber) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 404 })
    }
    return Response.json({
      id: subscriber.id,
      channels: subscriber.channels,
      tags: subscriber.tags,
      language: subscriber.language,
      status: subscriber.status,
    })
  }

  private async updateSubscriberPreferences(data: {
    token: string
    language?: string
    status?: 'active' | 'paused' | 'unsubscribed'
    tags?: string[]
  }): Promise<Response> {
    // Direct storage lookup via index instead of scanning all subscribers
    const subscriberHash = await this.ctx.storage.get<string>(`preferenceToken:${data.token}`)
    if (!subscriberHash) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 404 })
    }
    const subscriber = await this.ctx.storage.get<Subscriber>(`subscribers:${subscriberHash}`)
    if (!subscriber) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 404 })
    }

    if (data.language) subscriber.language = data.language
    if (data.status) subscriber.status = data.status
    if (data.tags) subscriber.tags = data.tags

    await this.ctx.storage.put(`subscribers:${subscriber.identifierHash}`, subscriber)
    return Response.json({
      id: subscriber.id,
      channels: subscriber.channels,
      tags: subscriber.tags,
      language: subscriber.language,
      status: subscriber.status,
    })
  }

  // --- Blast CRUD ---

  private async createBlast(data: {
    name: string
    content: BlastContent
    targetChannels: MessagingChannelType[]
    targetTags?: string[]
    targetLanguages?: string[]
    createdBy: string
  }): Promise<Response> {
    const blast: Blast = {
      id: crypto.randomUUID(),
      name: data.name,
      content: data.content,
      status: 'draft',
      targetChannels: data.targetChannels,
      targetTags: data.targetTags || [],
      targetLanguages: data.targetLanguages || [],
      createdBy: data.createdBy,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      stats: { totalRecipients: 0, sent: 0, delivered: 0, failed: 0, optedOut: 0 },
    }

    await this.ctx.storage.put(`blasts:${blast.id}`, blast)
    return Response.json(blast)
  }

  private async listBlasts(_req: Request): Promise<Response> {
    const map = await this.ctx.storage.list<Blast>({ prefix: 'blasts:' })
    const blasts = [...map.values()]
    // Sort by createdAt, newest first
    blasts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    return Response.json({ blasts })
  }

  private async getBlast(id: string): Promise<Response> {
    const blast = await this.ctx.storage.get<Blast>(`blasts:${id}`)
    if (!blast) return new Response('Blast not found', { status: 404 })
    return Response.json(blast)
  }

  private async updateBlast(id: string, data: Partial<Pick<Blast, 'name' | 'content' | 'targetChannels' | 'targetTags' | 'targetLanguages'>>): Promise<Response> {
    const blast = await this.ctx.storage.get<Blast>(`blasts:${id}`)
    if (!blast) return new Response('Blast not found', { status: 404 })
    if (blast.status !== 'draft') {
      return new Response(JSON.stringify({ error: 'Can only edit draft blasts' }), { status: 400 })
    }

    if (data.name !== undefined) blast.name = data.name
    if (data.content !== undefined) blast.content = data.content
    if (data.targetChannels !== undefined) blast.targetChannels = data.targetChannels
    if (data.targetTags !== undefined) blast.targetTags = data.targetTags
    if (data.targetLanguages !== undefined) blast.targetLanguages = data.targetLanguages
    blast.updatedAt = new Date().toISOString()

    await this.ctx.storage.put(`blasts:${id}`, blast)
    return Response.json(blast)
  }

  private async deleteBlast(id: string): Promise<Response> {
    const blast = await this.ctx.storage.get<Blast>(`blasts:${id}`)
    if (!blast) return new Response('Blast not found', { status: 404 })
    if (blast.status !== 'draft') {
      return new Response(JSON.stringify({ error: 'Can only delete draft blasts' }), { status: 400 })
    }

    await this.ctx.storage.delete(`blasts:${id}`)
    // Also clean up any queued items
    await this.ctx.storage.delete(`blast-queue:${id}`)
    return Response.json({ ok: true })
  }

  private async sendBlast(id: string): Promise<Response> {
    const blast = await this.ctx.storage.get<Blast>(`blasts:${id}`)
    if (!blast) return new Response('Blast not found', { status: 404 })
    if (blast.status !== 'draft' && blast.status !== 'scheduled') {
      return new Response(JSON.stringify({ error: 'Blast is not in a sendable state' }), { status: 400 })
    }

    // Enforce maxBlastsPerDay limit
    const settings = await this.getBlastSettingsData()
    const today = new Date().toISOString().slice(0, 10)
    const allBlasts = await this.ctx.storage.list<Blast>({ prefix: 'blasts:' })
    let sentToday = 0
    for (const [, b] of allBlasts) {
      if ((b.status === 'sent' || b.status === 'sending') && b.sentAt?.startsWith(today)) {
        sentToday++
      }
    }
    if (sentToday >= (settings.maxBlastsPerDay || 10)) {
      return new Response(JSON.stringify({ error: 'Daily blast limit reached' }), { status: 429 })
    }

    // Gather target subscribers
    let subscribers = await this.getAllSubscribers()
    subscribers = subscribers.filter(s => s.status === 'active')

    // Filter by target channels
    if (blast.targetChannels.length > 0) {
      subscribers = subscribers.filter(s =>
        s.channels.some(ch => blast.targetChannels.includes(ch.type) && ch.verified)
      )
    }

    // Filter by tags
    if (blast.targetTags.length > 0) {
      subscribers = subscribers.filter(s =>
        blast.targetTags.some(tag => s.tags.includes(tag))
      )
    }

    // Filter by languages
    if (blast.targetLanguages.length > 0) {
      subscribers = subscribers.filter(s =>
        blast.targetLanguages.includes(s.language)
      )
    }

    blast.status = 'sending'
    blast.sentAt = new Date().toISOString()
    blast.stats.totalRecipients = subscribers.length
    blast.updatedAt = new Date().toISOString()
    await this.ctx.storage.put(`blasts:${id}`, blast)

    // Mark blast as active for alarm-based delivery
    await this.ctx.storage.put(`blast-active:${id}`, true)

    // Schedule alarm to begin processing
    try {
      await this.ctx.storage.setAlarm(Date.now() + 100)
    } catch { /* alarm already set */ }

    return Response.json(blast)
  }

  private async scheduleBlast(id: string, data: { scheduledAt: string }): Promise<Response> {
    const blast = await this.ctx.storage.get<Blast>(`blasts:${id}`)
    if (!blast) return new Response('Blast not found', { status: 404 })
    if (blast.status !== 'draft') {
      return new Response(JSON.stringify({ error: 'Can only schedule draft blasts' }), { status: 400 })
    }

    const scheduledTime = new Date(data.scheduledAt).getTime()
    if (isNaN(scheduledTime) || scheduledTime <= Date.now()) {
      return new Response(JSON.stringify({ error: 'scheduledAt must be a future date' }), { status: 400 })
    }

    blast.status = 'scheduled'
    blast.scheduledAt = data.scheduledAt
    blast.updatedAt = new Date().toISOString()
    await this.ctx.storage.put(`blasts:${id}`, blast)

    // Schedule alarm for the blast time
    try {
      await this.ctx.storage.setAlarm(scheduledTime)
    } catch { /* alarm already set — alarm handler checks for due blasts */ }

    return Response.json(blast)
  }

  private async cancelBlast(id: string): Promise<Response> {
    const blast = await this.ctx.storage.get<Blast>(`blasts:${id}`)
    if (!blast) return new Response('Blast not found', { status: 404 })
    if (blast.status !== 'scheduled' && blast.status !== 'sending') {
      return new Response(JSON.stringify({ error: 'Can only cancel scheduled or sending blasts' }), { status: 400 })
    }

    blast.status = 'cancelled'
    blast.cancelledAt = new Date().toISOString()
    blast.updatedAt = new Date().toISOString()
    await this.ctx.storage.put(`blasts:${id}`, blast)

    // Remove from active queue
    await this.ctx.storage.delete(`blast-active:${id}`)

    return Response.json(blast)
  }

  // --- Blast Settings ---

  private async getBlastSettings(): Promise<Response> {
    const settings = await this.getBlastSettingsData()
    return Response.json(settings)
  }

  private async updateBlastSettings(data: Partial<BlastSettings>): Promise<Response> {
    const current = await this.getBlastSettingsData()
    const updated: BlastSettings = { ...current, ...data }
    await this.ctx.storage.put('blast-settings', updated)
    return Response.json(updated)
  }

  // --- Blast Delivery (alarm-driven) ---

  private async processActiveBlasts(): Promise<void> {
    // Find all active blast keys
    const activeMap = await this.ctx.storage.list<boolean>({ prefix: 'blast-active:' })
    if (activeMap.size === 0) return

    for (const [key] of activeMap) {
      const blastId = key.replace('blast-active:', '')
      const blast = await this.ctx.storage.get<Blast>(`blasts:${blastId}`)
      if (!blast || blast.status === 'cancelled') {
        await this.ctx.storage.delete(key)
        continue
      }

      // If scheduled and due, transition to sending
      if (blast.status === 'scheduled') {
        const scheduledTime = blast.scheduledAt ? new Date(blast.scheduledAt).getTime() : 0
        if (scheduledTime > Date.now()) continue // Not yet due

        // Trigger the send
        await this.sendBlast(blastId)
        continue
      }

      if (blast.status === 'sending') {
        // Mark as sent (actual delivery would go through messaging adapters)
        // In a full implementation, this would process batches via the messaging adapter
        blast.stats.sent = blast.stats.totalRecipients
        blast.status = 'sent'
        blast.updatedAt = new Date().toISOString()
        await this.ctx.storage.put(`blasts:${blastId}`, blast)
        await this.ctx.storage.delete(key)
      }
    }
  }

  // --- Alarm: process blast delivery + check scheduled blasts ---

  override async alarm() {
    // --- Process active blast deliveries ---
    await this.processActiveBlasts()

    // --- Check for scheduled blasts that are now due ---
    const allBlasts = await this.ctx.storage.list<Blast>({ prefix: 'blasts:' })
    for (const [, blast] of allBlasts) {
      if (blast.status === 'scheduled' && blast.scheduledAt) {
        const scheduledTime = new Date(blast.scheduledAt).getTime()
        if (scheduledTime <= Date.now()) {
          await this.sendBlast(blast.id)
        }
      }
    }

    // Re-schedule alarm if there are active or scheduled blasts
    const hasActive = (await this.ctx.storage.list<boolean>({ prefix: 'blast-active:' })).size > 0
    const hasScheduled = [...allBlasts.values()].some(b => b.status === 'scheduled')
    if (hasActive || hasScheduled) {
      try {
        await this.ctx.storage.setAlarm(Date.now() + 5 * 60 * 1000)
      } catch { /* alarm already set */ }
    }
  }
}
