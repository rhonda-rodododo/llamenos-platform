import { DurableObject } from 'cloudflare:workers'
import type { Env, Conversation, EncryptedMessage, ConversationStatus } from '../types'
import type { IncomingMessage, MessageStatusUpdate } from '../messaging/adapter'
import type { MessagingChannelType, FileRecord, RecipientEnvelope, Subscriber, Blast, BlastSettings, BlastContent } from '../../shared/types'
import { DEFAULT_BLAST_SETTINGS } from '../../shared/types'
import { encryptForPublicKey, hashPhone } from '../lib/crypto'
import { DORouter } from '../lib/do-router'
import { runMigrations } from '../../shared/migrations/runner'
import { migrations } from '../../shared/migrations'
import { hmac } from '@noble/hashes/hmac.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import { utf8ToBytes } from '@noble/ciphers/utils.js'
import { HMAC_PREFERENCE_TOKEN, HMAC_SUBSCRIBER } from '@shared/crypto-labels'

const PAGE_SIZE = 50

/**
 * ConversationDO — manages messaging conversation state.
 * Singleton Durable Object (idFromName('global-conversations')).
 *
 * Handles:
 * - Conversation lifecycle (create, assign, close)
 * - Encrypted message storage per conversation
 * - Inbound message processing from webhooks
 * - Conversation listing/filtering
 * - Message pagination
 */
export class ConversationDO extends DurableObject<Env> {
  private initialized = false
  private migrated = false
  private router: DORouter

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.router = new DORouter()

    // --- Conversation CRUD ---
    this.router.get('/conversations', (req) => this.listConversations(req))
    this.router.get('/conversations/:id', (_req, { id }) => this.getConversation(id))
    this.router.patch('/conversations/:id', async (req, { id }) => this.updateConversation(id, await req.json()))
    this.router.post('/conversations/:id/claim', async (req, { id }) => this.claimConversation(id, await req.json()))

    // --- Messages ---
    this.router.get('/conversations/:id/messages', (req, { id }) => this.getMessages(id, req))
    this.router.post('/conversations/:id/messages', async (req, { id }) => this.addMessage(id, await req.json()))

    // --- Create conversation (for reports / web-originated) ---
    this.router.post('/conversations', async (req) => this.createConversation(await req.json()))

    // --- Inbound from webhooks ---
    this.router.post('/conversations/incoming', async (req) => this.handleIncoming(await req.json()))

    // --- Message status updates ---
    this.router.post('/messages/status', async (req) => this.updateMessageStatus(await req.json()))

    // --- Contact lookup (server-side only, for outbound sends) ---
    this.router.get('/conversations/:id/contact', async (_req, { id }) => this.getContactIdentifier(id))

    // --- Stats ---
    this.router.get('/conversations/stats', () => this.getStats())

    // --- File Records ---
    this.router.post('/files', async (req) => this.createFileRecord(await req.json()))
    this.router.get('/files/:id', (_req, { id }) => this.getFileRecord(id))
    this.router.get('/files', (req) => this.listFileRecords(req))
    this.router.post('/files/:id/chunk-complete', async (req, { id }) => this.markChunkComplete(id, await req.json()))
    this.router.post('/files/:id/complete', async (_req, { id }) => this.markFileComplete(id))
    this.router.post('/files/:id/share', async (req, { id }) => this.addFileRecipient(id, await req.json()))

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

    // --- Volunteer Load Tracking (for auto-assignment) ---
    this.router.get('/load/:pubkey', (_req, { pubkey }) => this.getVolunteerLoad(pubkey))
    this.router.get('/load', () => this.getAllVolunteerLoads())
    this.router.post('/load/increment', async (req) => this.incrementLoad(await req.json()))
    this.router.post('/load/decrement', async (req) => this.decrementLoad(await req.json()))

    // --- Auto-assignment helper ---
    this.router.post('/conversations/:id/auto-assign', async (req, { id }) =>
      this.autoAssignConversation(id, await req.json()))

    // --- Test Reset ---
    this.router.post('/reset', async () => {
      await this.ctx.storage.deleteAll()
      this.initialized = false
      return Response.json({ ok: true })
    })
  }

  private async ensureInit() {
    if (this.initialized) return
    this.initialized = true
    // Initialize conversations list if not present
    if (!(await this.ctx.storage.get('conversations'))) {
      await this.ctx.storage.put('conversations', [] as Conversation[])
    }
  }

  async fetch(request: Request): Promise<Response> {
    if (!this.migrated) {
      await runMigrations(this.ctx.storage, migrations, 'conversations')
      this.migrated = true
    }
    await this.ensureInit()
    return this.router.handle(request)
  }

  // --- Conversation Management ---

  private async listConversations(req: Request): Promise<Response> {
    const url = new URL(req.url)
    const status = url.searchParams.get('status') as ConversationStatus | null
    const assignedTo = url.searchParams.get('assignedTo')
    const channel = url.searchParams.get('channel') as MessagingChannelType | null
    const page = parseInt(url.searchParams.get('page') || '1')
    const limit = parseInt(url.searchParams.get('limit') || '50')

    let conversations = await this.ctx.storage.get<Conversation[]>('conversations') || []

    // Filter
    if (status) {
      conversations = conversations.filter(c => c.status === status)
    }
    if (assignedTo) {
      conversations = conversations.filter(c => c.assignedTo === assignedTo)
    }
    if (channel) {
      conversations = conversations.filter(c => c.channelType === channel)
    }

    // Sort by last message time, newest first
    conversations.sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime())

    const start = (page - 1) * limit
    return Response.json({
      conversations: conversations.slice(start, start + limit),
      total: conversations.length,
    })
  }

  private async getConversation(id: string): Promise<Response> {
    const conversations = await this.ctx.storage.get<Conversation[]>('conversations') || []
    const conv = conversations.find(c => c.id === id)
    if (!conv) return new Response('Conversation not found', { status: 404 })
    return Response.json(conv)
  }

  private async updateConversation(id: string, data: Partial<Conversation>): Promise<Response> {
    const conversations = await this.ctx.storage.get<Conversation[]>('conversations') || []
    const conv = conversations.find(c => c.id === id)
    if (!conv) return new Response('Conversation not found', { status: 404 })

    const prevStatus = conv.status
    const prevAssignedTo = conv.assignedTo

    // Allowed updates
    if (data.status) conv.status = data.status
    if (data.assignedTo !== undefined) conv.assignedTo = data.assignedTo
    if (data.metadata) conv.metadata = { ...conv.metadata, ...data.metadata }
    conv.updatedAt = new Date().toISOString()

    await this.ctx.storage.put('conversations', conversations)

    // Update volunteer load counters
    // Decrement from previous volunteer if closing or reassigning
    if (prevAssignedTo && (conv.status === 'closed' || conv.assignedTo !== prevAssignedTo)) {
      await this.decrementLoad({ pubkey: prevAssignedTo, conversationId: id })
    }
    // Increment for new volunteer if assigning
    if (conv.assignedTo && conv.assignedTo !== prevAssignedTo && conv.status !== 'closed') {
      await this.incrementLoad({ pubkey: conv.assignedTo, conversationId: id })
    }

    return Response.json(conv)
  }

  private async claimConversation(id: string, data: { pubkey: string }): Promise<Response> {
    const conversations = await this.ctx.storage.get<Conversation[]>('conversations') || []
    const conv = conversations.find(c => c.id === id)
    if (!conv) return new Response('Conversation not found', { status: 404 })
    if (conv.status !== 'waiting') {
      return new Response(JSON.stringify({ error: 'Conversation is not in waiting state' }), { status: 400 })
    }

    conv.assignedTo = data.pubkey
    conv.status = 'active'
    conv.updatedAt = new Date().toISOString()

    await this.ctx.storage.put('conversations', conversations)

    // Increment volunteer load counter
    await this.incrementLoad({ pubkey: data.pubkey, conversationId: id })

    return Response.json(conv)
  }

  // --- Messages ---

  private async getMessages(conversationId: string, req: Request): Promise<Response> {
    const url = new URL(req.url)
    const page = parseInt(url.searchParams.get('page') || '1')
    const limit = parseInt(url.searchParams.get('limit') || String(PAGE_SIZE))

    const messages = await this.ctx.storage.get<EncryptedMessage[]>(`messages:${conversationId}`) || []
    // Messages are stored newest first; paginate from end
    const start = (page - 1) * limit
    return Response.json({
      messages: messages.slice(start, start + limit),
      total: messages.length,
    })
  }

  private async addMessage(conversationId: string, data: EncryptedMessage): Promise<Response> {
    const conversations = await this.ctx.storage.get<Conversation[]>('conversations') || []
    const conv = conversations.find(c => c.id === conversationId)
    if (!conv) return new Response('Conversation not found', { status: 404 })

    const message: EncryptedMessage = {
      ...data,
      id: data.id || crypto.randomUUID(),
      conversationId,
      createdAt: new Date().toISOString(),
      // Set initial status for outbound messages
      status: data.direction === 'outbound' ? 'pending' : undefined,
    }

    const messages = await this.ctx.storage.get<EncryptedMessage[]>(`messages:${conversationId}`) || []
    messages.unshift(message) // newest first
    await this.ctx.storage.put(`messages:${conversationId}`, messages)

    // Update conversation timestamps and count
    conv.lastMessageAt = message.createdAt
    conv.updatedAt = message.createdAt
    conv.messageCount = messages.length
    await this.ctx.storage.put('conversations', conversations)

    // Store external ID mapping for status tracking
    if (message.externalId) {
      await this.ctx.storage.put(`external-id:${message.externalId}`, {
        conversationId,
        messageId: message.id,
      })
    }

    return Response.json(message)
  }

  /**
   * Update message delivery status based on provider webhook callback.
   * Uses external ID to look up the message.
   */
  private async updateMessageStatus(update: MessageStatusUpdate): Promise<Response> {
    // Look up message by external ID
    const mapping = await this.ctx.storage.get<{ conversationId: string; messageId: string }>(
      `external-id:${update.externalId}`
    )
    if (!mapping) {
      // Message not found — might be for a different hub or old message
      return Response.json({ found: false })
    }

    const { conversationId, messageId } = mapping

    // Get messages for the conversation
    const messages = await this.ctx.storage.get<EncryptedMessage[]>(`messages:${conversationId}`) || []
    const message = messages.find(m => m.id === messageId)
    if (!message) {
      return Response.json({ found: false })
    }

    // Only update if the new status is "more advanced" than current
    // pending -> sent -> delivered -> read / failed
    const statusOrder: Record<string, number> = {
      'pending': 0,
      'sent': 1,
      'delivered': 2,
      'read': 3,
      'failed': 3, // failed is also terminal
    }

    const currentOrder = statusOrder[message.status || 'pending']
    const newOrder = statusOrder[update.status]

    if (newOrder <= currentOrder && update.status !== 'failed') {
      // Don't downgrade status (except failed can override anything)
      return Response.json({ conversationId, messageId, statusUnchanged: true })
    }

    // Update the message status
    message.status = update.status
    if (update.status === 'delivered') {
      message.deliveredAt = update.timestamp
    } else if (update.status === 'read') {
      message.readAt = update.timestamp
      // Set deliveredAt if not already set
      if (!message.deliveredAt) {
        message.deliveredAt = update.timestamp
      }
    } else if (update.status === 'failed') {
      message.failureReason = update.failureReason
    }

    await this.ctx.storage.put(`messages:${conversationId}`, messages)

    return Response.json({ conversationId, messageId, status: update.status })
  }

  // --- Inbound Message Processing ---

  private async handleIncoming(incoming: IncomingMessage): Promise<Response> {
    const conversations = await this.ctx.storage.get<Conversation[]>('conversations') || []
    const now = new Date().toISOString()

    // Find existing active/waiting conversation from this sender on this channel
    let conv = conversations.find(c =>
      c.channelType === incoming.channelType &&
      c.contactIdentifierHash === incoming.senderIdentifierHash &&
      (c.status === 'active' || c.status === 'waiting')
    )

    if (!conv) {
      // Create new conversation
      const digits = incoming.senderIdentifier.replace(/\D/g, '')
      const last4 = digits.length >= 4 ? digits.slice(-4) : digits

      conv = {
        id: crypto.randomUUID(),
        channelType: incoming.channelType,
        contactIdentifierHash: incoming.senderIdentifierHash,
        contactLast4: last4,
        status: 'waiting',
        createdAt: now,
        updatedAt: now,
        lastMessageAt: now,
        messageCount: 0,
      }
      conversations.push(conv)
      await this.ctx.storage.put('conversations', conversations)

      // Store the actual contact identifier for outbound sends (server-side only).
      // This is NOT sent to clients — only used by the server to send replies.
      // DO storage is encrypted at rest by Cloudflare.
      await this.ctx.storage.put(`contact:${conv.id}`, incoming.senderIdentifier)
    }

    // Encrypt the message content using ECIES for the assigned volunteer (if any) and admin
    // For inbound messages, the server encrypts the plaintext that arrived via the channel
    // The plaintext is discarded after encryption
    const adminDecryptionPubkey = this.env.ADMIN_DECRYPTION_PUBKEY || this.env.ADMIN_PUBKEY
    const adminEncrypted = encryptForPublicKey(incoming.body || '', adminDecryptionPubkey)

    let volunteerEncrypted = { encryptedContent: '', ephemeralPubkey: '' }
    if (conv.assignedTo) {
      volunteerEncrypted = encryptForPublicKey(incoming.body || '', conv.assignedTo)
    } else {
      // If no volunteer assigned, duplicate the admin encryption
      // When a volunteer claims the conversation, admin can re-encrypt for them
      volunteerEncrypted = { ...adminEncrypted }
    }

    const message: EncryptedMessage = {
      id: crypto.randomUUID(),
      conversationId: conv.id,
      direction: 'inbound',
      authorPubkey: 'system:inbound',
      encryptedContent: volunteerEncrypted.encryptedContent,
      ephemeralPubkey: volunteerEncrypted.ephemeralPubkey,
      encryptedContentAdmin: adminEncrypted.encryptedContent,
      ephemeralPubkeyAdmin: adminEncrypted.ephemeralPubkey,
      hasAttachments: !!(incoming.mediaUrls && incoming.mediaUrls.length > 0),
      createdAt: incoming.timestamp || now,
      externalId: incoming.externalId,
    }

    const messages = await this.ctx.storage.get<EncryptedMessage[]>(`messages:${conv.id}`) || []
    messages.unshift(message)
    await this.ctx.storage.put(`messages:${conv.id}`, messages)

    // Update conversation
    conv.lastMessageAt = message.createdAt
    conv.updatedAt = message.createdAt
    conv.messageCount = messages.length
    await this.ctx.storage.put('conversations', conversations)

    return Response.json({
      conversationId: conv.id,
      messageId: message.id,
      isNew: conv.messageCount === 1,
      status: conv.status,
    })
  }

  // --- Contact Identifier Lookup (server-side only) ---

  private async getContactIdentifier(conversationId: string): Promise<Response> {
    const identifier = await this.ctx.storage.get<string>(`contact:${conversationId}`)
    if (!identifier) {
      return new Response(JSON.stringify({ error: 'No contact identifier stored' }), { status: 404 })
    }
    return Response.json({ identifier })
  }

  // --- Stats ---

  private async getStats(): Promise<Response> {
    const conversations = await this.ctx.storage.get<Conversation[]>('conversations') || []
    const waiting = conversations.filter(c => c.status === 'waiting').length
    const active = conversations.filter(c => c.status === 'active').length
    const closed = conversations.filter(c => c.status === 'closed').length

    const todayStart = new Date()
    todayStart.setUTCHours(0, 0, 0, 0)
    const todayMs = todayStart.getTime()
    const today = conversations.filter(c => new Date(c.createdAt).getTime() >= todayMs).length

    return Response.json({ waiting, active, closed, today, total: conversations.length })
  }

  // --- Create Conversation (for web-originated / reports) ---

  private async createConversation(data: Partial<Conversation>): Promise<Response> {
    const conversations = await this.ctx.storage.get<Conversation[]>('conversations') || []
    const now = new Date().toISOString()

    const conv: Conversation = {
      id: crypto.randomUUID(),
      channelType: (data.channelType as MessagingChannelType | 'web') || 'web',
      contactIdentifierHash: data.contactIdentifierHash || '',
      contactLast4: data.contactLast4,
      assignedTo: data.assignedTo,
      status: (data.status as ConversationStatus) || 'waiting',
      createdAt: now,
      updatedAt: now,
      lastMessageAt: now,
      messageCount: 0,
      metadata: data.metadata,
    }

    conversations.push(conv)
    await this.ctx.storage.put('conversations', conversations)
    return Response.json(conv)
  }

  // --- File Records ---

  private async createFileRecord(data: FileRecord): Promise<Response> {
    const files = await this.ctx.storage.get<FileRecord[]>('fileRecords') || []
    files.push(data)
    await this.ctx.storage.put('fileRecords', files)
    return Response.json(data)
  }

  private async getFileRecord(id: string): Promise<Response> {
    const files = await this.ctx.storage.get<FileRecord[]>('fileRecords') || []
    const file = files.find(f => f.id === id)
    if (!file) return new Response('File not found', { status: 404 })
    return Response.json(file)
  }

  private async listFileRecords(req: Request): Promise<Response> {
    const url = new URL(req.url)
    const conversationId = url.searchParams.get('conversationId')
    let files = await this.ctx.storage.get<FileRecord[]>('fileRecords') || []
    if (conversationId) {
      files = files.filter(f => f.conversationId === conversationId)
    }
    return Response.json({ files: files.filter(f => f.status === 'complete') })
  }

  private async markChunkComplete(id: string, data: { chunkIndex: number }): Promise<Response> {
    const files = await this.ctx.storage.get<FileRecord[]>('fileRecords') || []
    const file = files.find(f => f.id === id)
    if (!file) return new Response('File not found', { status: 404 })
    file.completedChunks = (file.completedChunks || 0) + 1
    await this.ctx.storage.put('fileRecords', files)
    return Response.json({ completedChunks: file.completedChunks, totalChunks: file.totalChunks })
  }

  private async markFileComplete(id: string): Promise<Response> {
    const files = await this.ctx.storage.get<FileRecord[]>('fileRecords') || []
    const file = files.find(f => f.id === id)
    if (!file) return new Response('File not found', { status: 404 })
    file.status = 'complete'
    file.completedAt = new Date().toISOString()
    await this.ctx.storage.put('fileRecords', files)
    return Response.json(file)
  }

  private async addFileRecipient(id: string, data: { envelope: RecipientEnvelope; encryptedMetadata: { pubkey: string; encryptedContent: string; ephemeralPubkey: string } }): Promise<Response> {
    const files = await this.ctx.storage.get<FileRecord[]>('fileRecords') || []
    const file = files.find(f => f.id === id)
    if (!file) return new Response('File not found', { status: 404 })

    // Add envelope if not already present
    if (!file.recipientEnvelopes.some(e => e.pubkey === data.envelope.pubkey)) {
      file.recipientEnvelopes.push(data.envelope)
    }
    if (data.encryptedMetadata && !file.encryptedMetadata.some(m => m.pubkey === data.encryptedMetadata.pubkey)) {
      file.encryptedMetadata.push(data.encryptedMetadata)
    }

    await this.ctx.storage.put('fileRecords', files)
    return Response.json(file)
  }

  // --- Subscriber Management ---

  private generatePreferenceToken(identifierHash: string): string {
    const key = utf8ToBytes(HMAC_PREFERENCE_TOKEN)
    const input = utf8ToBytes(identifierHash)
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
      // Generate identifier hash using HMAC (consistent with messaging router pattern)
      const identifierHash = bytesToHex(
        hmac(sha256, utf8ToBytes(HMAC_SUBSCRIBER), utf8ToBytes(entry.identifier))
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
      await this.addToChannelIndex(entry.channel, subscriber.id)
      imported++
    }

    return Response.json({ imported, skipped, total: imported + skipped })
  }

  private async validatePreferenceToken(data: { token: string }): Promise<Response> {
    const subscribers = await this.getAllSubscribers()
    const subscriber = subscribers.find(s => s.preferenceToken === data.token)
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
    const subscribers = await this.getAllSubscribers()
    const subscriber = subscribers.find(s => s.preferenceToken === data.token)
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

  // --- Volunteer Load Tracking ---

  /**
   * Get the number of active conversations assigned to a volunteer.
   * Storage key: `volunteer-load:{pubkey}` = number
   */
  private async getVolunteerLoad(pubkey: string): Promise<Response> {
    const load = await this.ctx.storage.get<number>(`volunteer-load:${pubkey}`) || 0
    const conversationIds = await this.ctx.storage.get<string[]>(`volunteer-conversations:${pubkey}`) || []
    return Response.json({ pubkey, load, conversationIds })
  }

  /**
   * Get all volunteer load counts.
   */
  private async getAllVolunteerLoads(): Promise<Response> {
    const loadMap = await this.ctx.storage.list<number>({ prefix: 'volunteer-load:' })
    const loads: Record<string, number> = {}
    for (const [key, value] of loadMap) {
      const pubkey = key.replace('volunteer-load:', '')
      loads[pubkey] = value
    }
    return Response.json({ loads })
  }

  /**
   * Increment volunteer load counter and track conversation ID.
   */
  private async incrementLoad(data: { pubkey: string; conversationId: string }): Promise<Response> {
    const loadKey = `volunteer-load:${data.pubkey}`
    const convKey = `volunteer-conversations:${data.pubkey}`

    const currentLoad = await this.ctx.storage.get<number>(loadKey) || 0
    const conversationIds = await this.ctx.storage.get<string[]>(convKey) || []

    // Avoid double-counting
    if (!conversationIds.includes(data.conversationId)) {
      conversationIds.push(data.conversationId)
      await this.ctx.storage.put(loadKey, currentLoad + 1)
      await this.ctx.storage.put(convKey, conversationIds)
    }

    return Response.json({ load: currentLoad + 1 })
  }

  /**
   * Decrement volunteer load counter and remove conversation ID.
   */
  private async decrementLoad(data: { pubkey: string; conversationId: string }): Promise<Response> {
    const loadKey = `volunteer-load:${data.pubkey}`
    const convKey = `volunteer-conversations:${data.pubkey}`

    const currentLoad = await this.ctx.storage.get<number>(loadKey) || 0
    const conversationIds = await this.ctx.storage.get<string[]>(convKey) || []

    const idx = conversationIds.indexOf(data.conversationId)
    if (idx >= 0) {
      conversationIds.splice(idx, 1)
      await this.ctx.storage.put(loadKey, Math.max(0, currentLoad - 1))
      await this.ctx.storage.put(convKey, conversationIds)
    }

    return Response.json({ load: Math.max(0, currentLoad - 1) })
  }

  /**
   * Auto-assign a conversation to a volunteer (server-side assignment, for new conversations).
   * Used by the messaging router after auto-assignment logic selects a volunteer.
   */
  private async autoAssignConversation(
    id: string,
    data: { pubkey: string; adminPubkey: string }
  ): Promise<Response> {
    const conversations = await this.ctx.storage.get<Conversation[]>('conversations') || []
    const conv = conversations.find(c => c.id === id)
    if (!conv) return new Response('Conversation not found', { status: 404 })
    if (conv.status !== 'waiting') {
      return new Response(JSON.stringify({ error: 'Conversation is not in waiting state' }), { status: 400 })
    }

    conv.assignedTo = data.pubkey
    conv.status = 'active'
    conv.updatedAt = new Date().toISOString()

    await this.ctx.storage.put('conversations', conversations)

    // Increment volunteer load
    await this.incrementLoad({ pubkey: data.pubkey, conversationId: id })

    // Re-encrypt existing messages for the newly assigned volunteer
    // For inbound messages that were encrypted with admin key, we need to re-encrypt
    const messages = await this.ctx.storage.get<EncryptedMessage[]>(`messages:${id}`) || []
    let changed = false
    for (const msg of messages) {
      if (msg.direction === 'inbound' && msg.authorPubkey === 'system:inbound') {
        // Re-encrypt using admin's decryption of the content (this would require admin nsec)
        // For now, we'll leave messages encrypted for admin only until volunteer sends
        // The volunteer will see "[Encrypted for admin]" for pre-assignment messages
        // This is a security trade-off: volunteer only sees messages from assignment forward
        changed = false
      }
    }
    if (changed) {
      await this.ctx.storage.put(`messages:${id}`, messages)
    }

    return Response.json(conv)
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

  // --- Alarm: auto-close inactive conversations + process blast delivery ---

  override async alarm() {
    await this.ensureInit()

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

    // --- Auto-close conversations that have been inactive past the timeout ---
    // Timeout is read from settings, default 60 minutes
    const conversations = await this.ctx.storage.get<Conversation[]>('conversations') || []
    const now = Date.now()
    const timeout = 60 * 60 * 1000 // 60 minutes default

    let changed = false
    const closedAssignees: Array<{ pubkey: string; conversationId: string }> = []
    for (const conv of conversations) {
      if (conv.status === 'active' || conv.status === 'waiting') {
        const lastActivity = new Date(conv.lastMessageAt).getTime()
        if (now - lastActivity > timeout) {
          // Track assigned volunteer for load counter update
          if (conv.assignedTo) {
            closedAssignees.push({ pubkey: conv.assignedTo, conversationId: conv.id })
          }
          conv.status = 'closed'
          conv.updatedAt = new Date().toISOString()
          changed = true
        }
      }
    }

    if (changed) {
      await this.ctx.storage.put('conversations', conversations)
      // Decrement load counters for auto-closed conversations
      for (const { pubkey, conversationId } of closedAssignees) {
        await this.decrementLoad({ pubkey, conversationId })
      }
    }

    // Schedule next alarm in 5 minutes
    try {
      await this.ctx.storage.setAlarm(now + 5 * 60 * 1000)
    } catch { /* alarm already set */ }
  }
}
