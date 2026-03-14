import { DurableObject } from 'cloudflare:workers'
import type { Env, Volunteer, InviteCode, WebAuthnCredential, WebAuthnSettings, ServerSession, DeviceRecord } from '../types'
import { DORouter } from '../lib/do-router'
import { runMigrations } from '@shared/migrations/runner'
import { migrations } from '@shared/migrations'
import { registerMigrationRoutes } from '@shared/migrations/do-routes'
import { DEMO_ACCOUNTS } from '@shared/demo-accounts'
import { createLogger } from '../lib/logger'
import { incError } from '../lib/error-counter'
import { collectByPrefix } from '../lib/pagination'
import { resolveTTL, CLEANUP_ALARM_INTERVAL_MS, type TTLOverrides, type CleanupMetrics, emptyCleanupMetrics } from '../lib/ttl'
import { incCounter } from '../routes/metrics'

/**
 * IdentityDO — manages people and auth:
 * - Volunteers: per-entry keys `vol:{pubkey}` (sharded — Epic 281)
 * - Invites: per-entry keys `invite:{code}` (sharded — Epic 281)
 * - WebAuthn credentials, challenges, settings
 * - Server sessions
 */
export class IdentityDO extends DurableObject<Env> {
  private initialized = false
  private migrated = false
  private router: DORouter

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.router = new DORouter()

    // --- Volunteers ---
    this.router.get('/volunteers', () => this.getVolunteers())
    this.router.post('/volunteers', async (req) => this.createVolunteer(await req.json()))
    this.router.get('/volunteer/:pubkey', (_req, { pubkey }) => this.getVolunteer(pubkey))
    this.router.patch('/volunteers/:pubkey', async (req, { pubkey }) => {
      return this.updateVolunteer(pubkey, await req.json(), false)
    })
    this.router.patch('/admin/volunteers/:pubkey', async (req, { pubkey }) => {
      return this.updateVolunteer(pubkey, await req.json(), true)
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

    // --- Cleanup Metrics ---
    this.router.get('/identity/cleanup-metrics', () => this.getCleanupMetrics())

    // --- Admin Bootstrap ---
    this.router.get('/has-admin', () => this.hasAdmin())
    this.router.post('/bootstrap', async (req) => this.bootstrapAdmin(await req.json()))

    // --- Hub Role Management ---
    this.router.post('/identity/hub-role', async (req) => this.setHubRole(await req.json()))
    this.router.delete('/identity/hub-role', async (req) => this.removeHubRole(await req.json()))

    // --- Device Push Token Management (Epic 86) ---
    this.router.get('/devices/:pubkey', (_req, { pubkey }) => this.getDevices(pubkey))
    this.router.post('/devices/:pubkey/register', async (req, { pubkey }) =>
      this.registerDevice(pubkey, await req.json()))
    this.router.post('/devices/:pubkey/cleanup', async (req, { pubkey }) =>
      this.cleanupDevices(pubkey, await req.json()))
    this.router.delete('/devices/:pubkey', (_req, { pubkey }) => this.deleteAllDevices(pubkey))

    // --- Migration Management (Epic 286) ---
    registerMigrationRoutes(this.router, () => this.ctx.storage, 'identity')

    // --- Test: skip admin seed on next ensureInit (for bootstrap tests) ---
    this.router.post('/test-skip-admin-seed', async () => {
      await this.ctx.storage.put('_skipAdminSeed', true)
      // Delete all volunteer keys (sharded storage cleanup)
      const volKeys = await this.ctx.storage.list({ prefix: 'vol:' })
      for (const [key] of volKeys) {
        await this.ctx.storage.delete(key)
      }
      return Response.json({ ok: true })
    })

    // --- Test Reset (demo/development only — Epic 258 C3) ---
    this.router.post('/reset', async () => {
      if (this.env.DEMO_MODE !== 'true' && this.env.ENVIRONMENT !== 'development') {
        return new Response('Reset not allowed outside demo/development mode', { status: 403 })
      }
      await this.ctx.storage.deleteAll()
      this.initialized = false
      await this.ensureInit()
      return Response.json({ ok: true })
    })
  }

  // --- Volunteer Storage Helpers ---

  /** Get all volunteers by scanning the `vol:` prefix */
  private async getAllVolunteersMap(): Promise<Map<string, Volunteer>> {
    const entries = await this.ctx.storage.list<Volunteer>({ prefix: 'vol:' })
    const result = new Map<string, Volunteer>()
    for (const [key, value] of entries) {
      const pubkey = key.slice(4) // strip 'vol:'
      result.set(pubkey, value)
    }
    return result
  }

  /** Get a single volunteer by pubkey */
  private async getVolunteerByPubkey(pubkey: string): Promise<Volunteer | undefined> {
    return this.ctx.storage.get<Volunteer>(`vol:${pubkey}`)
  }

  /** Save a volunteer to its per-entry key */
  private async saveVolunteer(vol: Volunteer): Promise<void> {
    await this.ctx.storage.put(`vol:${vol.pubkey}`, vol)
  }

  // --- Invite Storage Helpers ---

  /** Get all invites by scanning the `invite:` prefix */
  private async getAllInvites(): Promise<InviteCode[]> {
    return collectByPrefix<InviteCode>(this.ctx.storage, 'invite:')
  }

  /** Get a single invite by code */
  private async getInviteByCode(code: string): Promise<InviteCode | undefined> {
    return this.ctx.storage.get<InviteCode>(`invite:${code}`)
  }

  /** Save an invite */
  private async saveInvite(invite: InviteCode): Promise<void> {
    await this.ctx.storage.put(`invite:${invite.code}`, invite)
  }

  private async ensureInit() {
    if (this.initialized) return
    this.initialized = true

    const adminPubkey = this.env.ADMIN_PUBKEY
    const skipAdminSeed = await this.ctx.storage.get<boolean>('_skipAdminSeed')

    if (adminPubkey && !skipAdminSeed) {
      const existing = await this.getVolunteerByPubkey(adminPubkey)
      if (!existing) {
        await this.saveVolunteer({
          pubkey: adminPubkey,
          name: 'Admin',
          phone: '',
          roles: ['role-super-admin'],
          active: true,
          createdAt: new Date().toISOString(),
          encryptedSecretKey: '',
          transcriptionEnabled: true,
          spokenLanguages: ['en', 'es'],
          uiLanguage: 'en',
          profileCompleted: true,
          onBreak: false,
          callPreference: 'phone',
        })
      }
    }

    // Seed demo volunteer accounts when DEMO_MODE is enabled
    if (this.env.DEMO_MODE === 'true' && !skipAdminSeed) {
      for (const account of DEMO_ACCOUNTS) {
        const existing = await this.getVolunteerByPubkey(account.pubkey)
        if (!existing) {
          await this.saveVolunteer({
            pubkey: account.pubkey,
            name: account.name,
            phone: account.phone,
            roles: account.roleIds,
            active: account.name !== 'Fatima Al-Rashid',
            createdAt: new Date().toISOString(),
            encryptedSecretKey: '',
            transcriptionEnabled: true,
            spokenLanguages: account.spokenLanguages,
            uiLanguage: 'en',
            profileCompleted: true,
            onBreak: false,
            callPreference: 'phone',
          })
        }
      }
    }

    if (!(await this.ctx.storage.get('webauthnSettings'))) {
      await this.ctx.storage.put<WebAuthnSettings>('webauthnSettings', {
        requireForAdmins: false,
        requireForVolunteers: false,
      })
    }
  }

  async fetch(request: Request): Promise<Response> {
    if (!this.migrated) {
      await runMigrations(this.ctx.storage, migrations, 'identity')
      this.migrated = true
    }
    await this.ensureInit()
    return this.router.handle(request)
  }

  override async alarm() {
    const log = createLogger('identity-do:alarm')
    const now = Date.now()
    const overrides = await this.ctx.storage.get<TTLOverrides>('ttlOverrides')
    const metrics = await this.ctx.storage.get<CleanupMetrics>('cleanupMetrics') || emptyCleanupMetrics()

    try {
      // --- Clean up expired WebAuthn challenges ---
      const challengeTTL = resolveTTL('webauthnChallenge', overrides ?? undefined)
      const challengeKeys = await this.ctx.storage.list({ prefix: 'webauthn:challenge:' })
      for (const [key, value] of challengeKeys) {
        const data = value as { challenge: string; createdAt: number }
        if (now - data.createdAt > challengeTTL) {
          await this.ctx.storage.delete(key)
          metrics.webauthnChallengesDeleted++
          incCounter('llamenos_cleanup_items_deleted', { type: 'webauthn_challenge', do: 'identity' })
        }
      }

      // --- Clean up expired sessions ---
      const sessionKeys = await this.ctx.storage.list({ prefix: 'session:' })
      for (const [key, value] of sessionKeys) {
        const session = value as ServerSession
        if (new Date(session.expiresAt).getTime() <= now) {
          await this.ctx.storage.delete(key)
          metrics.expiredSessionsDeleted++
          incCounter('llamenos_cleanup_items_deleted', { type: 'expired_session', do: 'identity' })
        }
      }

      // --- Clean up expired provisioning rooms ---
      const provisionTTL = resolveTTL('provisionRoom', overrides ?? undefined)
      const provisionKeys = await this.ctx.storage.list({ prefix: 'provision:' })
      for (const [key, value] of provisionKeys) {
        const room = value as ProvisionRoom
        if (now - room.createdAt > provisionTTL) {
          await this.ctx.storage.delete(key)
          metrics.provisionRoomsDeleted++
          incCounter('llamenos_cleanup_items_deleted', { type: 'provision_room', do: 'identity' })
        }
      }

      // --- Clean up redeemed and expired invites (sharded storage) ---
      const redeemedTTL = resolveTTL('redeemedInvite', overrides ?? undefined)
      const expiredInviteTTL = resolveTTL('expiredInvite', overrides ?? undefined)
      const invites = await this.getAllInvites()
      let invitesCleaned = 0
      for (const invite of invites) {
        let shouldDelete = false
        if (invite.usedAt) {
          // Redeemed invite: delete after redeemedTTL
          shouldDelete = now - new Date(invite.usedAt).getTime() >= redeemedTTL
        } else if (new Date(invite.expiresAt).getTime() <= now) {
          // Expired but never redeemed: delete after expiredInviteTTL
          shouldDelete = now - new Date(invite.expiresAt).getTime() >= expiredInviteTTL
        }
        if (shouldDelete) {
          await this.ctx.storage.delete(`invite:${invite.code}`)
          invitesCleaned++
          incCounter('llamenos_cleanup_items_deleted', { type: 'expired_invite', do: 'identity' })
        }
      }
      metrics.expiredInvitesCleaned += invitesCleaned

      metrics.lastCleanupAt = new Date().toISOString()
      await this.ctx.storage.put('cleanupMetrics', metrics)

      log.debug('Alarm completed', {
        challengesCleaned: challengeKeys.size,
        sessionsCleaned: sessionKeys.size,
        provisionsCleaned: provisionKeys.size,
        invitesCleaned,
      })
    } catch (err) {
      incError('alarm')
      log.error('Alarm failed', {
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      })
    }

    // Schedule next cleanup alarm
    try {
      await this.ctx.storage.setAlarm(now + CLEANUP_ALARM_INTERVAL_MS)
    } catch { /* alarm already set */ }
  }

  private async getCleanupMetrics(): Promise<Response> {
    const metrics = await this.ctx.storage.get<CleanupMetrics>('cleanupMetrics') || emptyCleanupMetrics()
    return Response.json(metrics)
  }

  // --- Admin Bootstrap Methods ---

  private async hasAdmin(): Promise<Response> {
    const volunteers = await this.getAllVolunteersMap()
    let hasAdmin = false
    for (const vol of volunteers.values()) {
      if (vol.active && vol.roles.includes('role-super-admin')) {
        hasAdmin = true
        break
      }
    }
    return Response.json({ hasAdmin })
  }

  private async bootstrapAdmin(data: { pubkey: string }): Promise<Response> {
    // Epic 258 H18: Check for existing admin
    const volunteers = await this.getAllVolunteersMap()
    for (const vol of volunteers.values()) {
      if (vol.active && vol.roles.includes('role-super-admin')) {
        return new Response(JSON.stringify({ error: 'Admin already exists' }), { status: 403 })
      }
    }

    const volunteer: Volunteer = {
      pubkey: data.pubkey,
      name: 'Admin',
      phone: '',
      roles: ['role-super-admin'],
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
    await this.saveVolunteer(volunteer)
    return Response.json({ ok: true })
  }

  // --- Volunteer Methods ---

  private async getVolunteers(): Promise<Response> {
    const volunteers = await this.getAllVolunteersMap()
    return Response.json({
      volunteers: [...volunteers.values()].map(v => ({ ...v, encryptedSecretKey: undefined })),
    })
  }

  private async getVolunteer(pubkey: string): Promise<Response> {
    const vol = await this.getVolunteerByPubkey(pubkey)
    if (!vol) return new Response('Not found', { status: 404 })
    return Response.json({ ...vol, encryptedSecretKey: undefined })
  }

  private async createVolunteer(data: {
    pubkey: string
    name: string
    phone: string
    roleIds?: string[]
    roles?: string[]
    encryptedSecretKey: string
    specializations?: string[]
    maxCaseAssignments?: number
    teamId?: string
    supervisorPubkey?: string
  }): Promise<Response> {
    const volunteer: Volunteer = {
      pubkey: data.pubkey,
      name: data.name,
      phone: data.phone,
      roles: data.roleIds || data.roles || ['role-volunteer'],
      active: true,
      createdAt: new Date().toISOString(),
      encryptedSecretKey: data.encryptedSecretKey,
      transcriptionEnabled: true,
      spokenLanguages: ['en'],
      uiLanguage: 'en',
      profileCompleted: false,
      onBreak: false,
      callPreference: 'phone',
      // Epic 340: Volunteer profile extensions
      ...(data.specializations && { specializations: data.specializations }),
      ...(data.maxCaseAssignments !== undefined && { maxCaseAssignments: data.maxCaseAssignments }),
      ...(data.teamId && { teamId: data.teamId }),
      ...(data.supervisorPubkey && { supervisorPubkey: data.supervisorPubkey }),
    }
    await this.saveVolunteer(volunteer)
    return Response.json({ volunteer: { ...volunteer, encryptedSecretKey: undefined } })
  }

  private static readonly VOLUNTEER_SAFE_FIELDS = new Set([
    'name', 'phone', 'spokenLanguages', 'uiLanguage', 'profileCompleted',
    'transcriptionEnabled', 'onBreak', 'callPreference',
    'specializations', // Epic 340: volunteers can self-update specializations
  ])

  private async updateVolunteer(pubkey: string, data: Partial<Volunteer>, isAdmin = false): Promise<Response> {
    const vol = await this.getVolunteerByPubkey(pubkey)
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
    await this.saveVolunteer(vol)
    return Response.json({ volunteer: { ...vol, encryptedSecretKey: undefined } })
  }

  private async deleteVolunteer(pubkey: string): Promise<Response> {
    await this.ctx.storage.delete(`vol:${pubkey}`)
    return Response.json({ ok: true })
  }

  // --- Invite Methods ---

  private async getInvites(): Promise<Response> {
    const invites = await this.getAllInvites()
    return Response.json({ invites: invites.filter(i => !i.usedAt) })
  }

  private async createInvite(data: { name: string; phone: string; roleIds: string[]; createdBy: string }): Promise<Response> {
    const code = crypto.randomUUID()
    const invite: InviteCode = {
      code,
      name: data.name,
      phone: data.phone,
      roleIds: data.roleIds || ['role-volunteer'],
      createdBy: data.createdBy,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    }
    await this.saveInvite(invite)
    return Response.json({ invite })
  }

  private async validateInvite(code: string): Promise<Response> {
    const invite = await this.getInviteByCode(code)
    if (!invite) return Response.json({ valid: false, error: 'not_found' })
    if (invite.usedAt) return Response.json({ valid: false, error: 'already_used' })
    if (new Date(invite.expiresAt) < new Date()) return Response.json({ valid: false, error: 'expired' })
    return Response.json({ valid: true, name: invite.name, roleIds: invite.roleIds })
  }

  private async redeemInvite(data: { code: string; pubkey: string }): Promise<Response> {
    const invite = await this.getInviteByCode(data.code)
    if (!invite) return new Response(JSON.stringify({ error: 'Invalid invite code' }), { status: 400 })
    if (invite.usedAt) return new Response(JSON.stringify({ error: 'Invite already used' }), { status: 400 })
    if (new Date(invite.expiresAt) < new Date()) return new Response(JSON.stringify({ error: 'Invite expired' }), { status: 400 })

    invite.usedAt = new Date().toISOString()
    invite.usedBy = data.pubkey
    await this.saveInvite(invite)

    const volunteer: Volunteer = {
      pubkey: data.pubkey,
      name: invite.name,
      phone: invite.phone,
      roles: invite.roleIds || ['role-volunteer'],
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
    await this.saveVolunteer(volunteer)
    return Response.json({ volunteer: { ...volunteer, encryptedSecretKey: undefined } })
  }

  private async revokeInvite(code: string): Promise<Response> {
    await this.ctx.storage.delete(`invite:${code}`)
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
    const volunteers = await this.getAllVolunteersMap()
    const allCreds: Array<WebAuthnCredential & { ownerPubkey: string }> = []
    for (const pubkey of volunteers.keys()) {
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
    // Sliding expiry
    const SESSION_DURATION_MS = 8 * 60 * 60 * 1000
    const RENEWAL_THRESHOLD_MS = SESSION_DURATION_MS - (1 * 60 * 60 * 1000)
    const remaining = new Date(session.expiresAt).getTime() - Date.now()
    if (remaining < RENEWAL_THRESHOLD_MS) {
      session.expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString()
      await this.ctx.storage.put(`session:${token}`, session)
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

  // --- Hub Role Methods ---

  private async setHubRole(data: { pubkey: string; hubId: string; roleIds: string[] }): Promise<Response> {
    const vol = await this.getVolunteerByPubkey(data.pubkey)
    if (!vol) return Response.json({ error: 'Volunteer not found' }, { status: 404 })

    const hubRoles = vol.hubRoles || []
    const idx = hubRoles.findIndex(hr => hr.hubId === data.hubId)
    if (idx >= 0) {
      hubRoles[idx].roleIds = data.roleIds
    } else {
      hubRoles.push({ hubId: data.hubId, roleIds: data.roleIds })
    }
    vol.hubRoles = hubRoles
    await this.saveVolunteer(vol)
    return Response.json({ volunteer: vol })
  }

  private async removeHubRole(data: { pubkey: string; hubId: string }): Promise<Response> {
    const vol = await this.getVolunteerByPubkey(data.pubkey)
    if (!vol) return Response.json({ error: 'Volunteer not found' }, { status: 404 })

    vol.hubRoles = (vol.hubRoles || []).filter(hr => hr.hubId !== data.hubId)
    await this.saveVolunteer(vol)
    return Response.json({ volunteer: vol })
  }

  // --- Device Push Token Management (Epic 86) ---

  private async getDevices(pubkey: string): Promise<Response> {
    const devices = await this.ctx.storage.get<DeviceRecord[]>(`devices:${pubkey}`) || []
    return Response.json({ devices })
  }

  private async registerDevice(pubkey: string, data: {
    platform: 'ios' | 'android'
    pushToken: string
    wakeKeyPublic: string
  }): Promise<Response> {
    const devices = await this.ctx.storage.get<DeviceRecord[]>(`devices:${pubkey}`) || []
    const now = new Date().toISOString()

    // Upsert by platform + pushToken
    const existingIdx = devices.findIndex(d => d.pushToken === data.pushToken)
    if (existingIdx >= 0) {
      devices[existingIdx] = {
        ...devices[existingIdx],
        wakeKeyPublic: data.wakeKeyPublic,
        lastSeenAt: now,
      }
    } else {
      // Limit to 5 devices per volunteer
      if (devices.length >= 5) {
        // Remove oldest device
        devices.sort((a, b) => a.lastSeenAt.localeCompare(b.lastSeenAt))
        devices.shift()
      }
      devices.push({
        platform: data.platform,
        pushToken: data.pushToken,
        wakeKeyPublic: data.wakeKeyPublic,
        registeredAt: now,
        lastSeenAt: now,
      })
    }

    await this.ctx.storage.put(`devices:${pubkey}`, devices)
    return Response.json({ ok: true })
  }

  private async cleanupDevices(pubkey: string, data: { tokens: string[] }): Promise<Response> {
    const devices = await this.ctx.storage.get<DeviceRecord[]>(`devices:${pubkey}`) || []
    const cleaned = devices.filter(d => !data.tokens.includes(d.pushToken))
    await this.ctx.storage.put(`devices:${pubkey}`, cleaned)
    return Response.json({ ok: true, removed: devices.length - cleaned.length })
  }

  private async deleteAllDevices(pubkey: string): Promise<Response> {
    await this.ctx.storage.delete(`devices:${pubkey}`)
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
