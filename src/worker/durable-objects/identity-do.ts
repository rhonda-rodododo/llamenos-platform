import { DurableObject } from 'cloudflare:workers'
import type { Env, UserRole, Volunteer, InviteCode, WebAuthnCredential, WebAuthnSettings, ServerSession } from '../types'
import { DORouter } from '../lib/do-router'

/**
 * IdentityDO — manages people and auth:
 * - Volunteers CRUD
 * - Invites
 * - WebAuthn credentials, challenges, settings
 * - Server sessions
 */
export class IdentityDO extends DurableObject<Env> {
  private initialized = false
  private router: DORouter

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.router = new DORouter()

    // --- Volunteers ---
    this.router.get('/volunteers', () => this.getVolunteers())
    this.router.post('/volunteers', async (req) => this.createVolunteer(await req.json()))
    this.router.get('/volunteer/:pubkey', (_req, { pubkey }) => this.getVolunteer(pubkey))
    this.router.patch('/volunteers/:pubkey', async (req, { pubkey }) => {
      const url = new URL(req.url)
      const isAdmin = url.searchParams.get('admin') === 'true'
      return this.updateVolunteer(pubkey, await req.json(), isAdmin)
    })
    this.router.delete('/volunteers/:pubkey', (_req, { pubkey }) => this.deleteVolunteer(pubkey))

    // --- Invites ---
    this.router.get('/invites', () => this.getInvites())
    this.router.post('/invites', async (req) => this.createInvite(await req.json()))
    this.router.get('/invites/validate/:code', (_req, { code }) => this.validateInvite(code))
    this.router.post('/invites/redeem', async (req) => this.redeemInvite(await req.json()))
    this.router.delete('/invites/:code', (_req, { code }) => this.revokeInvite(code))

    // --- WebAuthn Credentials ---
    this.router.get('/webauthn/credentials', (req) => {
      const pubkey = new URL(req.url).searchParams.get('pubkey')
      if (!pubkey) return new Response('Missing pubkey', { status: 400 })
      return this.getWebAuthnCredentials(pubkey)
    })
    this.router.post('/webauthn/credentials', async (req) => this.addWebAuthnCredential(await req.json()))
    this.router.delete('/webauthn/credentials/:credId', (req, { credId }) => {
      const pubkey = new URL(req.url).searchParams.get('pubkey')
      if (!pubkey) return new Response('Missing pubkey', { status: 400 })
      return this.deleteWebAuthnCredential(pubkey, credId)
    })
    this.router.post('/webauthn/credentials/update-counter', async (req) => this.updateWebAuthnCounter(await req.json()))
    this.router.get('/webauthn/all-credentials', () => this.getAllWebAuthnCredentials())

    // --- WebAuthn Challenges ---
    this.router.post('/webauthn/challenge', async (req) => this.storeWebAuthnChallenge(await req.json()))
    this.router.get('/webauthn/challenge/:id', (_req, { id }) => this.getWebAuthnChallenge(id))

    // --- WebAuthn Settings ---
    this.router.get('/settings/webauthn', () => this.getWebAuthnSettings())
    this.router.patch('/settings/webauthn', async (req) => this.updateWebAuthnSettings(await req.json()))

    // --- Server Sessions ---
    this.router.post('/sessions/create', async (req) => this.createSession(await req.json()))
    this.router.get('/sessions/validate/:token', (_req, { token }) => this.validateSession(token))
    this.router.delete('/sessions/revoke/:token', (_req, { token }) => this.revokeSession(token))
    this.router.delete('/sessions/revoke-all', (req) => {
      const pubkey = new URL(req.url).searchParams.get('pubkey')
      if (!pubkey) return new Response('Missing pubkey', { status: 400 })
      return this.revokeAllSessions(pubkey)
    })
    this.router.delete('/sessions/revoke-all/:pubkey', (_req, { pubkey }) => this.revokeAllSessions(pubkey))

    // --- Device Provisioning ---
    this.router.post('/provision/rooms', async (req) => this.createProvisionRoom(await req.json()))
    this.router.get('/provision/rooms/:id', (req, { id }) => {
      const token = new URL(req.url).searchParams.get('token')
      if (!token) return new Response('Missing token', { status: 400 })
      return this.getProvisionRoom(id, token)
    })
    this.router.post('/provision/rooms/:id/payload', async (req, { id }) =>
      this.setProvisionPayload(id, await req.json()))

    // --- Admin Bootstrap ---
    this.router.get('/has-admin', () => this.hasAdmin())
    this.router.post('/bootstrap', async (req) => this.bootstrapAdmin(await req.json()))

    // --- Test Reset ---
    this.router.post('/reset', async () => {
      await this.ctx.storage.deleteAll()
      this.initialized = false
      await this.ensureInit()
      return Response.json({ ok: true })
    })
  }

  private async ensureInit() {
    if (this.initialized) return
    this.initialized = true

    const adminPubkey = this.env.ADMIN_PUBKEY
    const volunteers = await this.ctx.storage.get<Record<string, Volunteer>>('volunteers') || {}
    if (adminPubkey && !volunteers[adminPubkey]) {
      volunteers[adminPubkey] = {
        pubkey: adminPubkey,
        name: 'Admin',
        phone: '',
        role: 'admin',
        active: true,
        createdAt: new Date().toISOString(),
        encryptedSecretKey: '',
        transcriptionEnabled: true,
        spokenLanguages: ['en', 'es'],
        uiLanguage: 'en',
        profileCompleted: true,
        onBreak: false,
        callPreference: 'phone',
      }
      await this.ctx.storage.put('volunteers', volunteers)
    }

    if (!(await this.ctx.storage.get('webauthnSettings'))) {
      await this.ctx.storage.put<WebAuthnSettings>('webauthnSettings', {
        requireForAdmins: false,
        requireForVolunteers: false,
      })
    }
  }

  async fetch(request: Request): Promise<Response> {
    await this.ensureInit()
    return this.router.handle(request)
  }

  override async alarm() {
    const now = Date.now()

    // Clean up expired WebAuthn challenges
    const challengeKeys = await this.ctx.storage.list({ prefix: 'webauthn:challenge:' })
    for (const [key, value] of challengeKeys) {
      const data = value as { challenge: string; createdAt: number }
      if (now - data.createdAt > 5 * 60 * 1000) {
        await this.ctx.storage.delete(key)
      }
    }

    // Clean up expired sessions
    const sessionKeys = await this.ctx.storage.list({ prefix: 'session:' })
    for (const [key, value] of sessionKeys) {
      const session = value as ServerSession
      if (new Date(session.expiresAt) < new Date()) {
        await this.ctx.storage.delete(key)
      }
    }

    // Clean up expired provisioning rooms (5-minute TTL)
    const provisionKeys = await this.ctx.storage.list({ prefix: 'provision:' })
    for (const [key, value] of provisionKeys) {
      const room = value as ProvisionRoom
      if (now - room.createdAt > 5 * 60 * 1000) {
        await this.ctx.storage.delete(key)
      }
    }
  }

  // --- Admin Bootstrap Methods ---

  private async hasAdmin(): Promise<Response> {
    const volunteers = await this.ctx.storage.get<Record<string, Volunteer>>('volunteers') || {}
    const hasAdmin = Object.values(volunteers).some(v => v.role === 'admin' && v.active)
    return Response.json({ hasAdmin })
  }

  private async bootstrapAdmin(data: { pubkey: string }): Promise<Response> {
    const volunteers = await this.ctx.storage.get<Record<string, Volunteer>>('volunteers') || {}
    // One-shot: reject if any admin already exists
    const adminExists = Object.values(volunteers).some(v => v.role === 'admin' && v.active)
    if (adminExists) {
      return new Response(JSON.stringify({ error: 'Admin already exists' }), { status: 403 })
    }

    const volunteer: Volunteer = {
      pubkey: data.pubkey,
      name: 'Admin',
      phone: '',
      role: 'admin',
      active: true,
      createdAt: new Date().toISOString(),
      encryptedSecretKey: '',
      transcriptionEnabled: true,
      spokenLanguages: ['en', 'es'],
      uiLanguage: 'en',
      profileCompleted: false,
      onBreak: false,
      callPreference: 'phone',
    }
    volunteers[data.pubkey] = volunteer
    await this.ctx.storage.put('volunteers', volunteers)
    return Response.json({ ok: true })
  }

  // --- Volunteer Methods ---

  private async getVolunteers(): Promise<Response> {
    const volunteers = await this.ctx.storage.get<Record<string, Volunteer>>('volunteers') || {}
    return Response.json({
      volunteers: Object.values(volunteers).map(v => ({ ...v, encryptedSecretKey: undefined })),
    })
  }

  private async getVolunteer(pubkey: string): Promise<Response> {
    const volunteers = await this.ctx.storage.get<Record<string, Volunteer>>('volunteers') || {}
    const vol = volunteers[pubkey]
    if (!vol) return new Response('Not found', { status: 404 })
    return Response.json({ ...vol, encryptedSecretKey: undefined })
  }

  private async createVolunteer(data: {
    pubkey: string
    name: string
    phone: string
    role: UserRole
    encryptedSecretKey: string
  }): Promise<Response> {
    const volunteers = await this.ctx.storage.get<Record<string, Volunteer>>('volunteers') || {}
    const volunteer: Volunteer = {
      pubkey: data.pubkey,
      name: data.name,
      phone: data.phone,
      role: data.role,
      active: true,
      createdAt: new Date().toISOString(),
      encryptedSecretKey: data.encryptedSecretKey,
      transcriptionEnabled: true,
      spokenLanguages: ['en'],
      uiLanguage: 'en',
      profileCompleted: false,
      onBreak: false,
      callPreference: 'phone',
    }
    volunteers[data.pubkey] = volunteer
    await this.ctx.storage.put('volunteers', volunteers)
    return Response.json({ volunteer: { ...volunteer, encryptedSecretKey: undefined } })
  }

  private static readonly VOLUNTEER_SAFE_FIELDS = new Set([
    'name', 'phone', 'spokenLanguages', 'uiLanguage', 'profileCompleted',
    'transcriptionEnabled', 'onBreak', 'callPreference',
  ])

  private async updateVolunteer(pubkey: string, data: Partial<Volunteer>, isAdmin = false): Promise<Response> {
    const volunteers = await this.ctx.storage.get<Record<string, Volunteer>>('volunteers') || {}
    const vol = volunteers[pubkey]
    if (!vol) return new Response('Not found', { status: 404 })

    if (isAdmin) {
      Object.assign(vol, data, { pubkey })
    } else {
      const safeData: Partial<Volunteer> = {}
      for (const key of Object.keys(data) as Array<keyof Volunteer>) {
        if (IdentityDO.VOLUNTEER_SAFE_FIELDS.has(key)) {
          (safeData as Record<string, unknown>)[key] = data[key]
        }
      }
      Object.assign(vol, safeData, { pubkey })
    }
    volunteers[pubkey] = vol
    await this.ctx.storage.put('volunteers', volunteers)
    return Response.json({ volunteer: { ...vol, encryptedSecretKey: undefined } })
  }

  private async deleteVolunteer(pubkey: string): Promise<Response> {
    const volunteers = await this.ctx.storage.get<Record<string, Volunteer>>('volunteers') || {}
    delete volunteers[pubkey]
    await this.ctx.storage.put('volunteers', volunteers)
    return Response.json({ ok: true })
  }

  // --- Invite Methods ---

  private async getInvites(): Promise<Response> {
    const invites = await this.ctx.storage.get<InviteCode[]>('invites') || []
    return Response.json({ invites: invites.filter(i => !i.usedAt) })
  }

  private async createInvite(data: { name: string; phone: string; role: UserRole; createdBy: string }): Promise<Response> {
    const invites = await this.ctx.storage.get<InviteCode[]>('invites') || []
    const code = crypto.randomUUID()
    const invite: InviteCode = {
      code,
      name: data.name,
      phone: data.phone,
      role: data.role,
      createdBy: data.createdBy,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    }
    invites.push(invite)
    await this.ctx.storage.put('invites', invites)
    return Response.json({ invite })
  }

  private async validateInvite(code: string): Promise<Response> {
    const invites = await this.ctx.storage.get<InviteCode[]>('invites') || []
    const invite = invites.find(i => i.code === code)
    if (!invite) return Response.json({ valid: false, error: 'not_found' })
    if (invite.usedAt) return Response.json({ valid: false, error: 'already_used' })
    if (new Date(invite.expiresAt) < new Date()) return Response.json({ valid: false, error: 'expired' })
    return Response.json({ valid: true, name: invite.name, role: invite.role })
  }

  private async redeemInvite(data: { code: string; pubkey: string }): Promise<Response> {
    const invites = await this.ctx.storage.get<InviteCode[]>('invites') || []
    const invite = invites.find(i => i.code === data.code)
    if (!invite) return new Response(JSON.stringify({ error: 'Invalid invite code' }), { status: 400 })
    if (invite.usedAt) return new Response(JSON.stringify({ error: 'Invite already used' }), { status: 400 })
    if (new Date(invite.expiresAt) < new Date()) return new Response(JSON.stringify({ error: 'Invite expired' }), { status: 400 })

    invite.usedAt = new Date().toISOString()
    invite.usedBy = data.pubkey
    await this.ctx.storage.put('invites', invites)

    const volunteers = await this.ctx.storage.get<Record<string, Volunteer>>('volunteers') || {}
    const volunteer: Volunteer = {
      pubkey: data.pubkey,
      name: invite.name,
      phone: invite.phone,
      role: invite.role,
      active: true,
      createdAt: new Date().toISOString(),
      encryptedSecretKey: '',
      transcriptionEnabled: true,
      spokenLanguages: ['en'],
      uiLanguage: 'en',
      profileCompleted: false,
      onBreak: false,
      callPreference: 'phone',
    }
    volunteers[data.pubkey] = volunteer
    await this.ctx.storage.put('volunteers', volunteers)
    return Response.json({ volunteer: { ...volunteer, encryptedSecretKey: undefined } })
  }

  private async revokeInvite(code: string): Promise<Response> {
    const invites = await this.ctx.storage.get<InviteCode[]>('invites') || []
    await this.ctx.storage.put('invites', invites.filter(i => i.code !== code))
    return Response.json({ ok: true })
  }

  // --- WebAuthn Credential Methods ---

  private async getWebAuthnCredentials(pubkey: string): Promise<Response> {
    const creds = await this.ctx.storage.get<WebAuthnCredential[]>(`webauthn:creds:${pubkey}`) || []
    return Response.json({ credentials: creds })
  }

  private async addWebAuthnCredential(data: { pubkey: string; credential: WebAuthnCredential }): Promise<Response> {
    const key = `webauthn:creds:${data.pubkey}`
    const creds = await this.ctx.storage.get<WebAuthnCredential[]>(key) || []
    creds.push(data.credential)
    await this.ctx.storage.put(key, creds)
    return Response.json({ ok: true })
  }

  private async deleteWebAuthnCredential(pubkey: string, credId: string): Promise<Response> {
    const key = `webauthn:creds:${pubkey}`
    const creds = await this.ctx.storage.get<WebAuthnCredential[]>(key) || []
    const filtered = creds.filter(c => c.id !== credId)
    if (filtered.length === creds.length) return new Response('Credential not found', { status: 404 })
    await this.ctx.storage.put(key, filtered)
    return Response.json({ ok: true })
  }

  private async updateWebAuthnCounter(data: { pubkey: string; credId: string; counter: number; lastUsedAt: string }): Promise<Response> {
    const key = `webauthn:creds:${data.pubkey}`
    const creds = await this.ctx.storage.get<WebAuthnCredential[]>(key) || []
    const cred = creds.find(c => c.id === data.credId)
    if (!cred) return new Response('Credential not found', { status: 404 })
    cred.counter = data.counter
    cred.lastUsedAt = data.lastUsedAt
    await this.ctx.storage.put(key, creds)
    return Response.json({ ok: true })
  }

  private async getAllWebAuthnCredentials(): Promise<Response> {
    const volunteers = await this.ctx.storage.get<Record<string, Volunteer>>('volunteers') || {}
    const allCreds: Array<WebAuthnCredential & { ownerPubkey: string }> = []
    for (const pubkey of Object.keys(volunteers)) {
      const creds = await this.ctx.storage.get<WebAuthnCredential[]>(`webauthn:creds:${pubkey}`) || []
      for (const c of creds) {
        allCreds.push({ ...c, ownerPubkey: pubkey })
      }
    }
    return Response.json({ credentials: allCreds })
  }

  // --- WebAuthn Challenge Methods ---

  private async storeWebAuthnChallenge(data: { id: string; challenge: string }): Promise<Response> {
    const key = `webauthn:challenge:${data.id}`
    await this.ctx.storage.put(key, { challenge: data.challenge, createdAt: Date.now() })
    this.ctx.storage.setAlarm(Date.now() + 5 * 60 * 1000)
    return Response.json({ ok: true })
  }

  private async getWebAuthnChallenge(id: string): Promise<Response> {
    const key = `webauthn:challenge:${id}`
    const data = await this.ctx.storage.get<{ challenge: string; createdAt: number }>(key)
    if (!data) return new Response('Challenge not found', { status: 404 })
    await this.ctx.storage.delete(key)
    if (Date.now() - data.createdAt > 5 * 60 * 1000) {
      return new Response('Challenge expired', { status: 410 })
    }
    return Response.json({ challenge: data.challenge })
  }

  // --- WebAuthn Settings Methods ---

  private async getWebAuthnSettings(): Promise<Response> {
    const settings = await this.ctx.storage.get<WebAuthnSettings>('webauthnSettings') || {
      requireForAdmins: false,
      requireForVolunteers: false,
    }
    return Response.json(settings)
  }

  private async updateWebAuthnSettings(data: Partial<WebAuthnSettings>): Promise<Response> {
    const current = await this.ctx.storage.get<WebAuthnSettings>('webauthnSettings') || {
      requireForAdmins: false,
      requireForVolunteers: false,
    }
    const updated = { ...current, ...data }
    await this.ctx.storage.put('webauthnSettings', updated)
    return Response.json(updated)
  }

  // --- Server Session Methods ---

  private async createSession(data: { pubkey: string }): Promise<Response> {
    const tokenBytes = new Uint8Array(32)
    crypto.getRandomValues(tokenBytes)
    const token = Array.from(tokenBytes).map(b => b.toString(16).padStart(2, '0')).join('')

    const session: ServerSession = {
      token,
      pubkey: data.pubkey,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
    }
    await this.ctx.storage.put(`session:${token}`, session)
    return Response.json(session)
  }

  private async validateSession(token: string): Promise<Response> {
    const session = await this.ctx.storage.get<ServerSession>(`session:${token}`)
    if (!session) return new Response('Invalid session', { status: 401 })
    if (new Date(session.expiresAt) < new Date()) {
      await this.ctx.storage.delete(`session:${token}`)
      return new Response('Session expired', { status: 401 })
    }
    return Response.json(session)
  }

  private async revokeSession(token: string): Promise<Response> {
    await this.ctx.storage.delete(`session:${token}`)
    return Response.json({ ok: true })
  }

  private async revokeAllSessions(pubkey: string): Promise<Response> {
    const sessionKeys = await this.ctx.storage.list({ prefix: 'session:' })
    let count = 0
    for (const [key, value] of sessionKeys) {
      const session = value as ServerSession
      if (session.pubkey === pubkey) {
        await this.ctx.storage.delete(key)
        count++
      }
    }
    return Response.json({ ok: true, revoked: count })
  }

  // --- Device Provisioning Methods ---

  private async createProvisionRoom(data: { ephemeralPubkey: string }): Promise<Response> {
    const roomId = crypto.randomUUID()
    const tokenBytes = new Uint8Array(16)
    crypto.getRandomValues(tokenBytes)
    const token = Array.from(tokenBytes).map(b => b.toString(16).padStart(2, '0')).join('')

    const room: ProvisionRoom = {
      ephemeralPubkey: data.ephemeralPubkey,
      token,
      createdAt: Date.now(),
      status: 'waiting',
    }
    await this.ctx.storage.put(`provision:${roomId}`, room)
    // Schedule cleanup
    this.ctx.storage.setAlarm(Date.now() + 5 * 60 * 1000)
    return Response.json({ roomId, token })
  }

  private async getProvisionRoom(id: string, token: string): Promise<Response> {
    const room = await this.ctx.storage.get<ProvisionRoom>(`provision:${id}`)
    if (!room) return new Response('Room not found', { status: 404 })
    if (room.token !== token) return new Response('Invalid token', { status: 403 })
    if (Date.now() - room.createdAt > 5 * 60 * 1000) {
      await this.ctx.storage.delete(`provision:${id}`)
      return Response.json({ status: 'expired' })
    }
    if (room.encryptedNsec) {
      // Consume: delete after delivering payload
      await this.ctx.storage.delete(`provision:${id}`)
      return Response.json({
        status: 'ready',
        ephemeralPubkey: room.ephemeralPubkey,
        encryptedNsec: room.encryptedNsec,
        primaryPubkey: room.primaryPubkey,
      })
    }
    return Response.json({ status: 'waiting', ephemeralPubkey: room.ephemeralPubkey })
  }

  private async setProvisionPayload(id: string, data: {
    token: string
    encryptedNsec: string
    primaryPubkey: string
    senderPubkey: string
  }): Promise<Response> {
    const room = await this.ctx.storage.get<ProvisionRoom>(`provision:${id}`)
    if (!room) return new Response('Room not found', { status: 404 })
    if (room.token !== data.token) return new Response('Invalid token', { status: 403 })
    if (Date.now() - room.createdAt > 5 * 60 * 1000) {
      await this.ctx.storage.delete(`provision:${id}`)
      return new Response('Room expired', { status: 410 })
    }
    room.encryptedNsec = data.encryptedNsec
    room.primaryPubkey = data.primaryPubkey
    room.status = 'ready'
    await this.ctx.storage.put(`provision:${id}`, room)
    return Response.json({ ok: true })
  }
}

interface ProvisionRoom {
  ephemeralPubkey: string
  token: string
  createdAt: number
  status: 'waiting' | 'ready'
  encryptedNsec?: string
  primaryPubkey?: string
}
