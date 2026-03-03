import { DurableObject } from 'cloudflare:workers'
import type { Env, Conversation, EncryptedMessage, ConversationStatus } from '../types'
import type { IncomingMessage, MessageStatusUpdate } from '../messaging/adapter'
import type { MessagingChannelType, FileRecord, FileKeyEnvelope } from '@shared/types'
import { encryptMessageForStorage } from '../lib/crypto'
import { DORouter } from '../lib/do-router'
import { runMigrations } from '@shared/migrations/runner'
import { migrations } from '@shared/migrations'

const PAGE_SIZE = 50

/**
 * Lightweight index entry for conversation listing.
 * Kept small to stay under CF DO's 128KB per-key limit.
 */
interface ConvIndexEntry {
  id: string
  lastMessageAt: string
  status: ConversationStatus
  channelType: MessagingChannelType | 'web'
  contactHash: string
  assignedTo?: string
  type?: string  // 'report' for report conversations
}

/** File index entry for quick lookups */
interface FileIndexEntry {
  id: string
  conversationId?: string
  status: string
}

/**
 * ConversationDO — manages messaging conversation state.
 * Singleton Durable Object (idFromName('global-conversations')).
 *
 * Storage layout (per-record keys):
 *   conv:${id}         → Conversation (full record)
 *   conv-index         → ConvIndexEntry[] (lightweight listing index)
 *   messages:${convId} → EncryptedMessage[] (per-conversation message array)
 *   contact:${convId}  → string (actual contact identifier, server-only)
 *   external-id:${eid} → {conversationId, messageId} (message status lookups)
 *   file:${id}         → FileRecord (individual file)
 *   file-index         → FileIndexEntry[] (file listing index)
 *   volunteer-load:${pubkey}          → number
 *   volunteer-conversations:${pubkey} → string[]
 */
export class ConversationDO extends DurableObject<Env> {
  private migrated = false
  private router: DORouter

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.router = new DORouter()

    // --- Conversation CRUD ---
    // Static routes MUST come before parameterized routes (DORouter matches first-match)
    this.router.get('/conversations/stats', () => this.getStats())
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

    // --- File Records ---
    this.router.post('/files', async (req) => this.createFileRecord(await req.json()))
    this.router.get('/files/:id', (_req, { id }) => this.getFileRecord(id))
    this.router.get('/files', (req) => this.listFileRecords(req))
    this.router.post('/files/:id/chunk-complete', async (req, { id }) => this.markChunkComplete(id, await req.json()))
    this.router.post('/files/:id/complete', async (_req, { id }) => this.markFileComplete(id))
    this.router.post('/files/:id/share', async (req, { id }) => this.addFileRecipient(id, await req.json()))

    // --- Volunteer Load Tracking (for auto-assignment) ---
    this.router.get('/load/:pubkey', (_req, { pubkey }) => this.getVolunteerLoad(pubkey))
    this.router.get('/load', () => this.getAllVolunteerLoads())
    this.router.post('/load/increment', async (req) => this.incrementLoad(await req.json()))
    this.router.post('/load/decrement', async (req) => this.decrementLoad(await req.json()))

    // --- Auto-assignment helper ---
    this.router.post('/conversations/:id/auto-assign', async (req, { id }) =>
      this.autoAssignConversation(id, await req.json()))

    // --- Contacts (Epic 123) ---
    this.router.get('/contacts', () => this.getContactSummaries())
    this.router.get('/contacts/:hash', (_req, { hash }) => this.getContactConversations(hash))

    // --- Test Reset ---
    this.router.post('/reset', async () => {
      await this.ctx.storage.deleteAll()
      return Response.json({ ok: true })
    })
  }

  async fetch(request: Request): Promise<Response> {
    if (!this.migrated) {
      await runMigrations(this.ctx.storage, migrations, 'conversations')
      this.migrated = true
    }
    return this.router.handle(request)
  }

  // --- Index Helpers ---

  private async getIndex(): Promise<ConvIndexEntry[]> {
    return await this.ctx.storage.get<ConvIndexEntry[]>('conv-index') || []
  }

  private async putIndex(index: ConvIndexEntry[]): Promise<void> {
    await this.ctx.storage.put('conv-index', index)
  }

  private toIndexEntry(conv: Conversation): ConvIndexEntry {
    return {
      id: conv.id,
      lastMessageAt: conv.lastMessageAt,
      status: conv.status,
      channelType: conv.channelType,
      contactHash: conv.contactIdentifierHash,
      assignedTo: conv.assignedTo,
      type: conv.metadata?.type,
    }
  }

  private async putConversation(conv: Conversation): Promise<void> {
    await this.ctx.storage.put(`conv:${conv.id}`, conv)
  }

  private async getConv(id: string): Promise<Conversation | undefined> {
    return await this.ctx.storage.get<Conversation>(`conv:${id}`)
  }

  // --- Conversation Management ---

  private async listConversations(req: Request): Promise<Response> {
    const url = new URL(req.url)
    const status = url.searchParams.get('status') as ConversationStatus | null
    const assignedTo = url.searchParams.get('assignedTo')
    const channel = url.searchParams.get('channel') as MessagingChannelType | null
    const type = url.searchParams.get('type')
    const contactHash = url.searchParams.get('contactHash')
    const authorPubkey = url.searchParams.get('authorPubkey')
    const page = parseInt(url.searchParams.get('page') || '1')
    const limit = parseInt(url.searchParams.get('limit') || '50')

    let index = await this.getIndex()

    // Filter by type (report vs conversation)
    if (type === 'report') {
      index = index.filter(e => e.type === 'report')
    } else if (!type) {
      // Default: exclude reports from conversation listing
      index = index.filter(e => e.type !== 'report')
    }

    // Filter by contact hash (for contact-level queries)
    if (contactHash) {
      index = index.filter(e => e.contactHash === contactHash)
    }

    // Filter by author pubkey (for reporter's own reports)
    if (authorPubkey) {
      index = index.filter(e => e.contactHash === authorPubkey)
    }

    // Filter
    if (status) {
      index = index.filter(e => e.status === status)
    }
    if (assignedTo) {
      index = index.filter(e => e.assignedTo === assignedTo)
    }
    if (channel) {
      index = index.filter(e => e.channelType === channel)
    }

    // Sort by last message time, newest first
    index.sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime())

    const total = index.length
    const start = (page - 1) * limit
    const pageEntries = index.slice(start, start + limit)

    // Fetch full conversation records for the current page
    const conversations = await Promise.all(
      pageEntries.map(e => this.getConv(e.id))
    )

    return Response.json({
      conversations: conversations.filter(Boolean),
      total,
    })
  }

  private async getConversation(id: string): Promise<Response> {
    const conv = await this.getConv(id)
    if (!conv) return new Response('Conversation not found', { status: 404 })
    return Response.json(conv)
  }

  private async updateConversation(id: string, data: Partial<Conversation>): Promise<Response> {
    const conv = await this.getConv(id)
    if (!conv) return new Response('Conversation not found', { status: 404 })

    const prevStatus = conv.status
    const prevAssignedTo = conv.assignedTo

    // Allowed updates
    if (data.status) conv.status = data.status
    if (data.assignedTo !== undefined) conv.assignedTo = data.assignedTo
    if (data.metadata) conv.metadata = { ...conv.metadata, ...data.metadata }
    conv.updatedAt = new Date().toISOString()

    await this.putConversation(conv)
    await this.updateIndex(conv)

    // Update volunteer load counters
    if (prevAssignedTo && (conv.status === 'closed' || conv.assignedTo !== prevAssignedTo)) {
      await this.decrementLoad({ pubkey: prevAssignedTo, conversationId: id })
    }
    if (conv.assignedTo && conv.assignedTo !== prevAssignedTo && conv.status !== 'closed') {
      await this.incrementLoad({ pubkey: conv.assignedTo, conversationId: id })
    }

    return Response.json(conv)
  }

  private async claimConversation(id: string, data: { pubkey: string }): Promise<Response> {
    const conv = await this.getConv(id)
    if (!conv) return new Response('Conversation not found', { status: 404 })
    if (conv.status !== 'waiting') {
      return new Response(JSON.stringify({ error: 'Conversation is not in waiting state' }), { status: 400 })
    }

    conv.assignedTo = data.pubkey
    conv.status = 'active'
    conv.updatedAt = new Date().toISOString()

    await this.putConversation(conv)
    await this.updateIndex(conv)

    // Increment volunteer load counter
    await this.incrementLoad({ pubkey: data.pubkey, conversationId: id })

    return Response.json(conv)
  }

  /** Update or add an entry in the conversation index */
  private async updateIndex(conv: Conversation): Promise<void> {
    const index = await this.getIndex()
    const entry = this.toIndexEntry(conv)
    const idx = index.findIndex(e => e.id === conv.id)
    if (idx >= 0) {
      index[idx] = entry
    } else {
      index.push(entry)
    }
    await this.putIndex(index)
  }

  /** Remove an entry from the conversation index */
  private async removeFromIndex(id: string): Promise<void> {
    const index = await this.getIndex()
    const filtered = index.filter(e => e.id !== id)
    await this.putIndex(filtered)
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
    const conv = await this.getConv(conversationId)
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
    await this.putConversation(conv)
    await this.updateIndex(conv)

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
      return Response.json({ found: false })
    }

    const { conversationId, messageId } = mapping

    const messages = await this.ctx.storage.get<EncryptedMessage[]>(`messages:${conversationId}`) || []
    const message = messages.find(m => m.id === messageId)
    if (!message) {
      return Response.json({ found: false })
    }

    // Only update if the new status is "more advanced" than current
    const statusOrder: Record<string, number> = {
      'pending': 0,
      'sent': 1,
      'delivered': 2,
      'read': 3,
      'failed': 3,
    }

    const currentOrder = statusOrder[message.status || 'pending']
    const newOrder = statusOrder[update.status]

    if (newOrder <= currentOrder && update.status !== 'failed') {
      return Response.json({ conversationId, messageId, statusUnchanged: true })
    }

    message.status = update.status
    if (update.status === 'delivered') {
      message.deliveredAt = update.timestamp
    } else if (update.status === 'read') {
      message.readAt = update.timestamp
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
    const index = await this.getIndex()
    const now = new Date().toISOString()

    // Find existing active/waiting conversation from this sender on this channel
    const existingEntry = index.find(e =>
      e.channelType === incoming.channelType &&
      e.contactHash === incoming.senderIdentifierHash &&
      (e.status === 'active' || e.status === 'waiting')
    )

    let conv: Conversation
    if (existingEntry) {
      conv = (await this.getConv(existingEntry.id))!
    } else {
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
      await this.putConversation(conv)
      await this.updateIndex(conv)

      // Store the actual contact identifier for outbound sends (server-side only)
      await this.ctx.storage.put(`contact:${conv.id}`, incoming.senderIdentifier)
    }

    // Encrypt the message content using envelope pattern
    const adminDecryptionPubkey = this.env.ADMIN_DECRYPTION_PUBKEY || this.env.ADMIN_PUBKEY
    const readerPubkeys = [adminDecryptionPubkey]
    if (conv.assignedTo && conv.assignedTo !== adminDecryptionPubkey) {
      readerPubkeys.push(conv.assignedTo)
    }

    const encrypted = encryptMessageForStorage(incoming.body || '', readerPubkeys)

    const message: EncryptedMessage = {
      id: crypto.randomUUID(),
      conversationId: conv.id,
      direction: 'inbound',
      authorPubkey: 'system:inbound',
      encryptedContent: encrypted.encryptedContent,
      readerEnvelopes: encrypted.readerEnvelopes,
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
    await this.putConversation(conv)
    await this.updateIndex(conv)

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
    const index = await this.getIndex()
    // Exclude reports from conversation stats
    const conversations = index.filter(e => e.type !== 'report')
    const waiting = conversations.filter(e => e.status === 'waiting').length
    const active = conversations.filter(e => e.status === 'active').length
    const closed = conversations.filter(e => e.status === 'closed').length

    const todayStart = new Date()
    todayStart.setUTCHours(0, 0, 0, 0)
    const todayMs = todayStart.getTime()

    // For today count we need the full records (index has lastMessageAt, not createdAt)
    // Use a heuristic: conversations created today have lastMessageAt >= today
    // This is approximate but avoids loading all records
    const today = conversations.filter(e => new Date(e.lastMessageAt).getTime() >= todayMs).length

    return Response.json({ waiting, active, closed, today, total: conversations.length })
  }

  // --- Create Conversation (for web-originated / reports) ---

  private async createConversation(data: Partial<Conversation>): Promise<Response> {
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

    await this.putConversation(conv)
    await this.updateIndex(conv)
    return Response.json(conv)
  }

  // --- File Records (per-record storage) ---

  private async getFileIndex(): Promise<FileIndexEntry[]> {
    return await this.ctx.storage.get<FileIndexEntry[]>('file-index') || []
  }

  private async putFileIndex(index: FileIndexEntry[]): Promise<void> {
    await this.ctx.storage.put('file-index', index)
  }

  private async createFileRecord(data: FileRecord): Promise<Response> {
    await this.ctx.storage.put(`file:${data.id}`, data)
    const index = await this.getFileIndex()
    index.push({ id: data.id, conversationId: data.conversationId, status: data.status })
    await this.putFileIndex(index)
    return Response.json(data)
  }

  private async getFileRecord(id: string): Promise<Response> {
    const file = await this.ctx.storage.get<FileRecord>(`file:${id}`)
    if (!file) return new Response('File not found', { status: 404 })
    return Response.json(file)
  }

  private async listFileRecords(req: Request): Promise<Response> {
    const url = new URL(req.url)
    const conversationId = url.searchParams.get('conversationId')

    let index = await this.getFileIndex()
    // Only show complete files
    index = index.filter(e => e.status === 'complete')
    if (conversationId) {
      index = index.filter(e => e.conversationId === conversationId)
    }

    const files = await Promise.all(
      index.map(e => this.ctx.storage.get<FileRecord>(`file:${e.id}`))
    )
    return Response.json({ files: files.filter(Boolean) })
  }

  private async markChunkComplete(id: string, _data: { chunkIndex: number }): Promise<Response> {
    const file = await this.ctx.storage.get<FileRecord>(`file:${id}`)
    if (!file) return new Response('File not found', { status: 404 })
    file.completedChunks = (file.completedChunks || 0) + 1
    await this.ctx.storage.put(`file:${id}`, file)
    return Response.json({ completedChunks: file.completedChunks, totalChunks: file.totalChunks })
  }

  private async markFileComplete(id: string): Promise<Response> {
    const file = await this.ctx.storage.get<FileRecord>(`file:${id}`)
    if (!file) return new Response('File not found', { status: 404 })
    file.status = 'complete'
    file.completedAt = new Date().toISOString()
    await this.ctx.storage.put(`file:${id}`, file)

    // Update index
    const index = await this.getFileIndex()
    const entry = index.find(e => e.id === id)
    if (entry) {
      entry.status = 'complete'
      await this.putFileIndex(index)
    }

    return Response.json(file)
  }

  private async addFileRecipient(id: string, data: { envelope: FileKeyEnvelope; encryptedMetadata: { pubkey: string; encryptedContent: string; ephemeralPubkey: string } }): Promise<Response> {
    const file = await this.ctx.storage.get<FileRecord>(`file:${id}`)
    if (!file) return new Response('File not found', { status: 404 })

    if (!file.recipientEnvelopes.some(e => e.pubkey === data.envelope.pubkey)) {
      file.recipientEnvelopes.push(data.envelope)
    }
    if (data.encryptedMetadata && !file.encryptedMetadata.some(m => m.pubkey === data.encryptedMetadata.pubkey)) {
      file.encryptedMetadata.push(data.encryptedMetadata)
    }

    await this.ctx.storage.put(`file:${id}`, file)
    return Response.json(file)
  }

  // --- Volunteer Load Tracking ---

  private async getVolunteerLoad(pubkey: string): Promise<Response> {
    const load = await this.ctx.storage.get<number>(`volunteer-load:${pubkey}`) || 0
    const conversationIds = await this.ctx.storage.get<string[]>(`volunteer-conversations:${pubkey}`) || []
    return Response.json({ pubkey, load, conversationIds })
  }

  private async getAllVolunteerLoads(): Promise<Response> {
    const loadMap = await this.ctx.storage.list<number>({ prefix: 'volunteer-load:' })
    const loads: Record<string, number> = {}
    for (const [key, value] of loadMap) {
      const pubkey = key.replace('volunteer-load:', '')
      loads[pubkey] = value
    }
    return Response.json({ loads })
  }

  private async incrementLoad(data: { pubkey: string; conversationId: string }): Promise<Response> {
    const loadKey = `volunteer-load:${data.pubkey}`
    const convKey = `volunteer-conversations:${data.pubkey}`

    const currentLoad = await this.ctx.storage.get<number>(loadKey) || 0
    const conversationIds = await this.ctx.storage.get<string[]>(convKey) || []

    if (!conversationIds.includes(data.conversationId)) {
      conversationIds.push(data.conversationId)
      await this.ctx.storage.put(loadKey, currentLoad + 1)
      await this.ctx.storage.put(convKey, conversationIds)
    }

    return Response.json({ load: currentLoad + 1 })
  }

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
   * Auto-assign a conversation to a volunteer (server-side assignment).
   */
  private async autoAssignConversation(
    id: string,
    data: { pubkey: string; adminPubkey: string }
  ): Promise<Response> {
    const conv = await this.getConv(id)
    if (!conv) return new Response('Conversation not found', { status: 404 })
    if (conv.status !== 'waiting') {
      return new Response(JSON.stringify({ error: 'Conversation is not in waiting state' }), { status: 400 })
    }

    conv.assignedTo = data.pubkey
    conv.status = 'active'
    conv.updatedAt = new Date().toISOString()

    await this.putConversation(conv)
    await this.updateIndex(conv)

    // Increment volunteer load
    await this.incrementLoad({ pubkey: data.pubkey, conversationId: id })

    // Re-encrypt existing messages for the newly assigned volunteer
    const messages = await this.ctx.storage.get<EncryptedMessage[]>(`messages:${id}`) || []
    let changed = false
    for (const msg of messages) {
      if (msg.direction === 'inbound' && msg.authorPubkey === 'system:inbound') {
        // Security trade-off: volunteer only sees messages from assignment forward
        changed = false
      }
    }
    if (changed) {
      await this.ctx.storage.put(`messages:${id}`, messages)
    }

    return Response.json(conv)
  }

  // --- Alarm: auto-close inactive conversations ---

  override async alarm() {
    const index = await this.getIndex()
    const now = Date.now()
    const timeout = 60 * 60 * 1000 // 60 minutes default

    let changed = false
    const closedAssignees: Array<{ pubkey: string; conversationId: string }> = []

    for (const entry of index) {
      if (entry.status === 'active' || entry.status === 'waiting') {
        const lastActivity = new Date(entry.lastMessageAt).getTime()
        if (now - lastActivity > timeout) {
          const conv = await this.getConv(entry.id)
          if (conv) {
            if (conv.assignedTo) {
              closedAssignees.push({ pubkey: conv.assignedTo, conversationId: conv.id })
            }
            conv.status = 'closed'
            conv.updatedAt = new Date().toISOString()
            await this.putConversation(conv)
            entry.status = 'closed'
            changed = true
          }
        }
      }
    }

    if (changed) {
      await this.putIndex(index)
      for (const { pubkey, conversationId } of closedAssignees) {
        await this.decrementLoad({ pubkey, conversationId })
      }
    }

    // Schedule next alarm in 5 minutes
    try {
      await this.ctx.storage.setAlarm(now + 5 * 60 * 1000)
    } catch { /* alarm already set */ }
  }

  // --- Contact Methods (Epic 123) ---

  private async getContactSummaries(): Promise<Response> {
    const index = await this.getIndex()
    const contactMap = new Map<string, {
      last4?: string
      conversationCount: number
      reportCount: number
      firstSeen: string
      lastSeen: string
    }>()

    for (const entry of index) {
      const hash = entry.contactHash
      if (!hash) continue
      const conv = await this.getConv(entry.id)
      if (!conv) continue

      const existing = contactMap.get(hash)
      const isReport = conv.metadata?.type === 'report'
      if (existing) {
        if (isReport) existing.reportCount++
        else existing.conversationCount++
        if (conv.createdAt < existing.firstSeen) existing.firstSeen = conv.createdAt
        if (conv.lastMessageAt > existing.lastSeen) existing.lastSeen = conv.lastMessageAt
        if (conv.contactLast4) existing.last4 = conv.contactLast4
      } else {
        contactMap.set(hash, {
          last4: conv.contactLast4,
          conversationCount: isReport ? 0 : 1,
          reportCount: isReport ? 1 : 0,
          firstSeen: conv.createdAt,
          lastSeen: conv.lastMessageAt,
        })
      }
    }

    return Response.json({ contacts: Object.fromEntries(contactMap) })
  }

  private async getContactConversations(hash: string): Promise<Response> {
    const index = await this.getIndex()
    const matching = index.filter(e => e.contactHash === hash)
    const conversations: Conversation[] = []

    for (const entry of matching) {
      const conv = await this.getConv(entry.id)
      if (conv) conversations.push(conv)
    }

    conversations.sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime())
    return Response.json({ conversations })
  }
}
