import { DurableObject } from 'cloudflare:workers'
import type { Env, Conversation, EncryptedMessage, ConversationStatus } from '../types'
import type { IncomingMessage } from '../messaging/adapter'
import type { MessagingChannelType, FileRecord, RecipientEnvelope } from '../../shared/types'
import { encryptForPublicKey, hashPhone } from '../lib/crypto'
import { DORouter } from '../lib/do-router'
import { runMigrations } from '../../shared/migrations/runner'
import { migrations } from '../../shared/migrations'

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

    // Allowed updates
    if (data.status) conv.status = data.status
    if (data.assignedTo !== undefined) conv.assignedTo = data.assignedTo
    if (data.metadata) conv.metadata = { ...conv.metadata, ...data.metadata }
    conv.updatedAt = new Date().toISOString()

    await this.ctx.storage.put('conversations', conversations)
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

    // Broadcast assignment via CallRouterDO (WebSocket hub)
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
    }

    const messages = await this.ctx.storage.get<EncryptedMessage[]>(`messages:${conversationId}`) || []
    messages.unshift(message) // newest first
    await this.ctx.storage.put(`messages:${conversationId}`, messages)

    // Update conversation timestamps and count
    conv.lastMessageAt = message.createdAt
    conv.updatedAt = message.createdAt
    conv.messageCount = messages.length
    await this.ctx.storage.put('conversations', conversations)

    return Response.json(message)
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
    const adminPubkey = this.env.ADMIN_PUBKEY
    const adminEncrypted = encryptForPublicKey(incoming.body || '', adminPubkey)

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

  // --- Alarm: auto-close inactive conversations ---

  override async alarm() {
    await this.ensureInit()
    // Auto-close conversations that have been inactive past the timeout
    // Timeout is read from settings, default 60 minutes
    const conversations = await this.ctx.storage.get<Conversation[]>('conversations') || []
    const now = Date.now()
    const timeout = 60 * 60 * 1000 // 60 minutes default

    let changed = false
    for (const conv of conversations) {
      if (conv.status === 'active' || conv.status === 'waiting') {
        const lastActivity = new Date(conv.lastMessageAt).getTime()
        if (now - lastActivity > timeout) {
          conv.status = 'closed'
          conv.updatedAt = new Date().toISOString()
          changed = true
        }
      }
    }

    if (changed) {
      await this.ctx.storage.put('conversations', conversations)
    }

    // Schedule next alarm in 5 minutes
    try {
      await this.ctx.storage.setAlarm(now + 5 * 60 * 1000)
    } catch { /* alarm already set */ }
  }
}
