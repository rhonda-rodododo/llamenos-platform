/**
 * IdentityService — replaces IdentityDO.
 *
 * Manages volunteers, sessions, invite codes, WebAuthn credentials/challenges,
 * devices, provisioning rooms, hub roles, and admin bootstrap.
 * All state is stored in PostgreSQL via Drizzle ORM.
 */
import { eq, and, lt, sql, inArray } from 'drizzle-orm'
import type { Database } from '../db'
import {
  users,
  sessions,
  inviteCodes,
  webauthnCredentials,
  webauthnChallenges,
  devices,
  provisionRooms,
  systemSettings,
} from '../db/schema'
import type {
  User,
  InviteCode,
  WebAuthnCredential,
  WebAuthnSettings,
  ServerSession,
  DeviceRecord,
} from '../types'
import { ServiceError } from './settings'
import { DEMO_ACCOUNTS } from '@shared/demo-accounts'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SESSION_DURATION_MS = 8 * 60 * 60 * 1000 // 8 hours
const RENEWAL_THRESHOLD_MS = 7 * 60 * 60 * 1000 // renew when < 1h remaining
const INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
const CHALLENGE_TTL_MS = 5 * 60 * 1000 // 5 minutes
const PROVISION_ROOM_TTL_MS = 5 * 60 * 1000 // 5 minutes
const MAX_DEVICES_PER_VOLUNTEER = 5

/** Fields a non-admin volunteer may self-update */
const VOLUNTEER_SAFE_FIELDS = new Set([
  'name', 'phone', 'spokenLanguages', 'uiLanguage', 'profileCompleted',
  'transcriptionEnabled', 'onBreak', 'callPreference',
  'specializations', // Epic 340: volunteers can self-update specializations
])

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a cryptographically random hex token of `bytes` length */
function randomHexToken(bytes: number): string {
  const buf = new Uint8Array(bytes)
  crypto.getRandomValues(buf)
  return Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('')
}

/** Map a DB volunteer row to the legacy User interface shape */
function rowToUser(row: typeof users.$inferSelect): User {
  return {
    pubkey: row.pubkey,
    name: row.displayName ?? '',
    phone: row.phone ?? '',
    roles: row.roles,
    hubRoles: (row.hubRoles as User['hubRoles']) ?? [],
    active: row.active,
    createdAt: row.createdAt.toISOString(),
    encryptedSecretKey: row.encryptedSecretKey ?? '',
    transcriptionEnabled: row.transcriptionEnabled ?? true,
    spokenLanguages: row.spokenLanguages ?? [],
    uiLanguage: row.uiLanguage ?? 'en',
    profileCompleted: row.profileCompleted ?? false,
    onBreak: row.onBreak ?? false,
    callPreference: (row.callPreference as User['callPreference']) ?? 'phone',
    supportedMessagingChannels: (row.supportedMessagingChannels as User['supportedMessagingChannels']),
    messagingEnabled: row.messagingEnabled ?? undefined,
    specializations: row.specializations ?? [],
    maxCaseAssignments: row.maxCaseAssignments ?? undefined,
    teamId: row.teamId ?? undefined,
    supervisorPubkey: row.supervisorPubkey ?? undefined,
  }
}

/** Strip encryptedSecretKey from volunteer for external responses */
function sanitizeUser(vol: User): Omit<User, 'encryptedSecretKey'> & { encryptedSecretKey?: undefined } {
  return { ...vol, encryptedSecretKey: undefined }
}

/** Map a DB invite row to InviteCode interface */
function rowToInvite(row: typeof inviteCodes.$inferSelect): InviteCode {
  return {
    code: row.code,
    name: row.name,
    phone: row.phone,
    roleIds: row.roleIds,
    createdBy: row.createdBy ?? '',
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    usedAt: row.usedAt?.toISOString(),
    usedBy: row.usedBy ?? undefined,
  }
}

/** Map a DB session row to ServerSession interface */
function rowToSession(row: typeof sessions.$inferSelect): ServerSession {
  return {
    token: row.token,
    pubkey: row.pubkey,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
  }
}

/** Map a DB webauthn credential row to WebAuthnCredential interface */
function rowToWebAuthnCredential(row: typeof webauthnCredentials.$inferSelect): WebAuthnCredential {
  return {
    id: row.credentialId,
    publicKey: row.publicKey,
    counter: row.counter,
    transports: row.transports ?? [],
    backedUp: row.backedUp ?? false,
    label: row.label,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? '',
  }
}

/** Map a DB device row to DeviceRecord interface */
function rowToDevice(row: typeof devices.$inferSelect): DeviceRecord {
  return {
    platform: row.platform as DeviceRecord['platform'],
    pushToken: row.pushToken ?? '',
    wakeKeyPublic: row.wakeKeyPublic ?? '',
    registeredAt: row.registeredAt.toISOString(),
    lastSeenAt: row.lastSeenAt?.toISOString() ?? row.registeredAt.toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class IdentityService {
  constructor(protected db: Database) {}

  // =========================================================================
  // Admin Bootstrap & Init
  // =========================================================================

  /**
   * Check whether any active super-admin volunteer exists.
   */
  async hasAdmin(): Promise<{ hasAdmin: boolean }> {
    const rows = await this.db
      .select({ pubkey: users.pubkey })
      .from(users)
      .where(
        and(
          eq(users.active, true),
          sql`${users.roles} @> ARRAY['role-super-admin']::text[]`,
        ),
      )
      .limit(1)
    return { hasAdmin: rows.length > 0 }
  }

  /**
   * Bootstrap the first admin. Fails if an admin already exists.
   */
  async bootstrapAdmin(pubkey: string): Promise<void> {
    const { hasAdmin } = await this.hasAdmin()
    if (hasAdmin) throw new ServiceError(403, 'Admin already exists')

    await this.db.insert(users).values({
      pubkey,
      displayName: 'Admin',
      phone: '',
      roles: ['role-super-admin'],
      active: true,
      encryptedSecretKey: '',
      transcriptionEnabled: true,
      spokenLanguages: ['en', 'es'],
      uiLanguage: 'en',
      profileCompleted: false,
      onBreak: false,
      callPreference: 'phone',
    }).onConflictDoNothing()
  }

  /**
   * Ensure default admin is seeded (called on startup).
   * Also seeds demo accounts when DEMO_MODE is true.
   */
  async ensureInit(adminPubkey?: string, demoMode = false): Promise<void> {
    if (adminPubkey) {
      await this.db.insert(users).values({
        pubkey: adminPubkey,
        displayName: 'Admin',
        phone: '',
        roles: ['role-super-admin'],
        active: true,
        encryptedSecretKey: '',
        transcriptionEnabled: true,
        spokenLanguages: ['en', 'es'],
        uiLanguage: 'en',
        profileCompleted: true,
        onBreak: false,
        callPreference: 'phone',
      }).onConflictDoNothing()
    }

    if (demoMode) {
      for (const account of DEMO_ACCOUNTS) {
        await this.db.insert(users).values({
          pubkey: account.pubkey,
          displayName: account.name,
          phone: account.phone,
          roles: account.roleIds,
          active: account.name !== 'Fatima Al-Rashid',
          encryptedSecretKey: '',
          transcriptionEnabled: true,
          spokenLanguages: account.spokenLanguages,
          uiLanguage: 'en',
          profileCompleted: true,
          onBreak: false,
          callPreference: 'phone',
        }).onConflictDoNothing()
      }
    }
  }

  // =========================================================================
  // User CRUD
  // =========================================================================

  /**
   * List all users (encryptedSecretKey stripped).
   */
  async getUsers(): Promise<{ users: ReturnType<typeof sanitizeUser>[] }> {
    const rows = await this.db.select().from(users)
    return {
      users: rows.map(r => sanitizeUser(rowToUser(r))),
    }
  }

  /**
   * Get a single volunteer by pubkey.
   */
  async getUser(pubkey: string): Promise<ReturnType<typeof sanitizeUser>> {
    const rows = await this.db
      .select()
      .from(users)
      .where(eq(users.pubkey, pubkey))
      .limit(1)
    if (rows.length === 0) throw new ServiceError(404, 'Not found')
    return sanitizeUser(rowToUser(rows[0]))
  }

  /**
   * Get a volunteer's full record (including encryptedSecretKey) — internal use only.
   */
  async getUserInternal(pubkey: string): Promise<User | null> {
    const rows = await this.db
      .select()
      .from(users)
      .where(eq(users.pubkey, pubkey))
      .limit(1)
    return rows.length > 0 ? rowToUser(rows[0]) : null
  }

  /**
   * Create a new volunteer.
   */
  async createUser(data: {
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
  }): Promise<{ volunteer: ReturnType<typeof sanitizeUser> }> {
    const roles = data.roleIds ?? data.roles ?? ['role-volunteer']
    const [row] = await this.db.insert(users).values({
      pubkey: data.pubkey,
      displayName: data.name,
      phone: data.phone,
      roles,
      active: true,
      encryptedSecretKey: data.encryptedSecretKey,
      transcriptionEnabled: true,
      spokenLanguages: ['en'],
      uiLanguage: 'en',
      profileCompleted: false,
      onBreak: false,
      callPreference: 'phone',
      specializations: data.specializations ?? [],
      maxCaseAssignments: data.maxCaseAssignments,
      teamId: data.teamId,
      supervisorPubkey: data.supervisorPubkey,
    }).returning()

    return { volunteer: sanitizeUser(rowToUser(row)) }
  }

  /**
   * Update a volunteer's fields. Non-admin callers are restricted to safe fields.
   */
  async updateUser(
    pubkey: string,
    data: Partial<User>,
    isAdmin: boolean,
  ): Promise<{ volunteer: ReturnType<typeof sanitizeUser> }> {
    // Verify volunteer exists
    const existing = await this.db
      .select()
      .from(users)
      .where(eq(users.pubkey, pubkey))
      .limit(1)
    if (existing.length === 0) throw new ServiceError(404, 'Not found')

    // Build update payload — map User fields to DB columns
    const updates: Partial<typeof users.$inferInsert> = {}

    const applyField = (key: string, value: unknown) => {
      switch (key) {
        case 'name': updates.displayName = value as string; break
        case 'phone': updates.phone = value as string; break
        case 'roles': updates.roles = value as string[]; break
        case 'active': updates.active = value as boolean; break
        case 'encryptedSecretKey': updates.encryptedSecretKey = value as string; break
        case 'transcriptionEnabled': updates.transcriptionEnabled = value as boolean; break
        case 'spokenLanguages': updates.spokenLanguages = value as string[]; break
        case 'uiLanguage': updates.uiLanguage = value as string; break
        case 'profileCompleted': updates.profileCompleted = value as boolean; break
        case 'onBreak': updates.onBreak = value as boolean; break
        case 'callPreference': updates.callPreference = value as string; break
        case 'hubRoles': updates.hubRoles = value; break
        case 'supportedMessagingChannels': updates.supportedMessagingChannels = value as string[]; break
        case 'messagingEnabled': updates.messagingEnabled = value as boolean; break
        case 'specializations': updates.specializations = value as string[]; break
        case 'maxCaseAssignments': updates.maxCaseAssignments = value as number; break
        case 'teamId': updates.teamId = value as string; break
        case 'supervisorPubkey': updates.supervisorPubkey = value as string; break
      }
    }

    for (const [key, value] of Object.entries(data)) {
      if (key === 'pubkey') continue // never overwrite PK
      if (isAdmin || VOLUNTEER_SAFE_FIELDS.has(key)) {
        applyField(key, value)
      }
    }
    updates.updatedAt = new Date()

    const [row] = await this.db
      .update(users)
      .set(updates)
      .where(eq(users.pubkey, pubkey))
      .returning()

    return { volunteer: sanitizeUser(rowToUser(row)) }
  }

  /**
   * Delete (hard-remove) a volunteer. Cascading FKs clean up sessions, creds, devices.
   */
  async deleteUser(pubkey: string): Promise<void> {
    await this.db.delete(users).where(eq(users.pubkey, pubkey))
  }

  // =========================================================================
  // Hub Role Management
  // =========================================================================

  /**
   * Set hub-specific role assignments for a volunteer.
   */
  async setHubRole(data: { pubkey: string; hubId: string; roleIds: string[] }): Promise<{ volunteer: User }> {
    const vol = await this.getUserInternal(data.pubkey)
    if (!vol) throw new ServiceError(404, 'User not found')

    const hubRoles = vol.hubRoles ?? []
    const idx = hubRoles.findIndex(hr => hr.hubId === data.hubId)
    if (idx >= 0) {
      hubRoles[idx].roleIds = data.roleIds
    } else {
      hubRoles.push({ hubId: data.hubId, roleIds: data.roleIds })
    }

    const [row] = await this.db
      .update(users)
      .set({ hubRoles, updatedAt: new Date() })
      .where(eq(users.pubkey, data.pubkey))
      .returning()

    return { volunteer: rowToUser(row) }
  }

  /**
   * Remove all hub-specific roles for a volunteer in a given hub.
   */
  async removeHubRole(data: { pubkey: string; hubId: string }): Promise<{ volunteer: User }> {
    const vol = await this.getUserInternal(data.pubkey)
    if (!vol) throw new ServiceError(404, 'User not found')

    const hubRoles = (vol.hubRoles ?? []).filter(hr => hr.hubId !== data.hubId)

    const [row] = await this.db
      .update(users)
      .set({ hubRoles, updatedAt: new Date() })
      .where(eq(users.pubkey, data.pubkey))
      .returning()

    return { volunteer: rowToUser(row) }
  }

  // =========================================================================
  // Invite Code Management
  // =========================================================================

  /**
   * List all unredeemed invites.
   */
  async getInvites(): Promise<{ invites: InviteCode[] }> {
    const rows = await this.db
      .select()
      .from(inviteCodes)
      .where(sql`${inviteCodes.usedAt} IS NULL`)
    return { invites: rows.map(rowToInvite) }
  }

  /**
   * Create a new invite code.
   */
  async createInvite(data: {
    name: string
    phone: string
    roleIds: string[]
    createdBy: string
  }): Promise<{ invite: InviteCode }> {
    const code = crypto.randomUUID()
    const now = new Date()
    const expiresAt = new Date(now.getTime() + INVITE_EXPIRY_MS)

    const [row] = await this.db.insert(inviteCodes).values({
      code,
      name: data.name,
      phone: data.phone,
      roleIds: data.roleIds || ['role-volunteer'],
      createdBy: data.createdBy,
      createdAt: now,
      expiresAt,
    }).returning()

    return { invite: rowToInvite(row) }
  }

  /**
   * Validate an invite code (check existence, usage, expiry).
   */
  async validateInvite(code: string): Promise<{
    valid: boolean
    error?: string
    name?: string
    roleIds?: string[]
  }> {
    const rows = await this.db
      .select()
      .from(inviteCodes)
      .where(eq(inviteCodes.code, code))
      .limit(1)

    if (rows.length === 0) return { valid: false, error: 'not_found' }
    const invite = rows[0]
    if (invite.usedAt) return { valid: false, error: 'already_used' }
    if (invite.expiresAt < new Date()) return { valid: false, error: 'expired' }
    return { valid: true, name: invite.name, roleIds: invite.roleIds }
  }

  /**
   * Redeem an invite code — marks it used and creates a volunteer.
   */
  async redeemInvite(data: { code: string; pubkey: string }): Promise<{
    volunteer: ReturnType<typeof sanitizeUser>
  }> {
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(inviteCodes)
        .where(eq(inviteCodes.code, data.code))
        .limit(1)

      if (rows.length === 0) throw new ServiceError(400, 'Invalid invite code')
      const invite = rows[0]
      if (invite.usedAt) throw new ServiceError(400, 'Invite already used')
      if (invite.expiresAt < new Date()) throw new ServiceError(400, 'Invite expired')

      // Mark invite as used
      await tx
        .update(inviteCodes)
        .set({ usedAt: new Date(), usedBy: data.pubkey })
        .where(eq(inviteCodes.code, data.code))

      // Create volunteer
      const [volRow] = await tx.insert(users).values({
        pubkey: data.pubkey,
        displayName: invite.name,
        phone: invite.phone,
        roles: invite.roleIds.length > 0 ? invite.roleIds : ['role-volunteer'],
        active: true,
        encryptedSecretKey: '',
        transcriptionEnabled: true,
        spokenLanguages: ['en'],
        uiLanguage: 'en',
        profileCompleted: false,
        onBreak: false,
        callPreference: 'phone',
      }).returning()

      return { volunteer: sanitizeUser(rowToUser(volRow)) }
    })
  }

  /**
   * Revoke (delete) an invite code.
   */
  async revokeInvite(code: string): Promise<void> {
    await this.db.delete(inviteCodes).where(eq(inviteCodes.code, code))
  }

  // =========================================================================
  // Server Sessions
  // =========================================================================

  /**
   * Create a new session for a pubkey (8h expiry).
   */
  async createSession(pubkey: string): Promise<ServerSession> {
    const token = randomHexToken(32)
    const now = new Date()
    const expiresAt = new Date(now.getTime() + SESSION_DURATION_MS)

    const [row] = await this.db.insert(sessions).values({
      token,
      pubkey,
      createdAt: now,
      expiresAt,
    }).returning()

    return rowToSession(row)
  }

  /**
   * Validate a session token. Implements sliding expiry: if remaining time < 1h,
   * extend to now + 8h.
   */
  async validateSession(token: string): Promise<ServerSession> {
    const rows = await this.db
      .select()
      .from(sessions)
      .where(eq(sessions.token, token))
      .limit(1)

    if (rows.length === 0) throw new ServiceError(401, 'Invalid session')
    const row = rows[0]

    if (row.expiresAt < new Date()) {
      await this.db.delete(sessions).where(eq(sessions.token, token))
      throw new ServiceError(401, 'Session expired')
    }

    // Sliding expiry — renew when less than 1h remaining
    const remaining = row.expiresAt.getTime() - Date.now()
    if (remaining < RENEWAL_THRESHOLD_MS) {
      const newExpiry = new Date(Date.now() + SESSION_DURATION_MS)
      await this.db
        .update(sessions)
        .set({ expiresAt: newExpiry })
        .where(eq(sessions.token, token))
      return { ...rowToSession(row), expiresAt: newExpiry.toISOString() }
    }

    return rowToSession(row)
  }

  /**
   * Revoke a single session by token.
   */
  async revokeSession(token: string): Promise<void> {
    await this.db.delete(sessions).where(eq(sessions.token, token))
  }

  /**
   * Revoke all sessions for a given pubkey.
   */
  async revokeAllSessions(pubkey: string): Promise<{ revoked: number }> {
    const deleted = await this.db
      .delete(sessions)
      .where(eq(sessions.pubkey, pubkey))
      .returning({ token: sessions.token })
    return { revoked: deleted.length }
  }

  // =========================================================================
  // WebAuthn Credentials
  // =========================================================================

  /**
   * Get all WebAuthn credentials for a pubkey.
   */
  async getWebAuthnCredentials(pubkey: string): Promise<{ credentials: WebAuthnCredential[] }> {
    const rows = await this.db
      .select()
      .from(webauthnCredentials)
      .where(eq(webauthnCredentials.pubkey, pubkey))
    return { credentials: rows.map(rowToWebAuthnCredential) }
  }

  /**
   * Store a new WebAuthn credential.
   */
  async addWebAuthnCredential(pubkey: string, credential: WebAuthnCredential): Promise<void> {
    await this.db.insert(webauthnCredentials).values({
      credentialId: credential.id,
      pubkey,
      publicKey: credential.publicKey,
      counter: credential.counter,
      transports: credential.transports,
      backedUp: credential.backedUp,
      label: credential.label,
      lastUsedAt: credential.lastUsedAt ? new Date(credential.lastUsedAt) : null,
    })
  }

  /**
   * Delete a specific WebAuthn credential for a pubkey.
   */
  async deleteWebAuthnCredential(pubkey: string, credId: string): Promise<void> {
    const result = await this.db
      .delete(webauthnCredentials)
      .where(
        and(
          eq(webauthnCredentials.pubkey, pubkey),
          eq(webauthnCredentials.credentialId, credId),
        ),
      )
      .returning({ credentialId: webauthnCredentials.credentialId })

    if (result.length === 0) throw new ServiceError(404, 'Credential not found')
  }

  /**
   * Update the signature counter and lastUsedAt for a credential.
   */
  async updateWebAuthnCounter(data: {
    pubkey: string
    credId: string
    counter: number
    lastUsedAt: string
  }): Promise<void> {
    const result = await this.db
      .update(webauthnCredentials)
      .set({
        counter: data.counter,
        lastUsedAt: new Date(data.lastUsedAt),
      })
      .where(
        and(
          eq(webauthnCredentials.pubkey, data.pubkey),
          eq(webauthnCredentials.credentialId, data.credId),
        ),
      )
      .returning({ credentialId: webauthnCredentials.credentialId })

    if (result.length === 0) throw new ServiceError(404, 'Credential not found')
  }

  /**
   * Get all WebAuthn credentials across all volunteers (admin view).
   */
  async getAllWebAuthnCredentials(): Promise<{
    credentials: Array<WebAuthnCredential & { ownerPubkey: string }>
  }> {
    const rows = await this.db.select().from(webauthnCredentials)
    return {
      credentials: rows.map(r => ({
        ...rowToWebAuthnCredential(r),
        ownerPubkey: r.pubkey,
      })),
    }
  }

  // =========================================================================
  // WebAuthn Challenges
  // =========================================================================

  /**
   * Store a WebAuthn challenge (5-minute TTL, consumed on read).
   */
  async storeWebAuthnChallenge(id: string, challenge: string): Promise<void> {
    await this.db.insert(webauthnChallenges).values({
      challengeId: id,
      challenge,
    })
  }

  /**
   * Retrieve and consume a WebAuthn challenge. Throws if not found or expired.
   */
  async getWebAuthnChallenge(id: string): Promise<{ challenge: string }> {
    const rows = await this.db
      .select()
      .from(webauthnChallenges)
      .where(eq(webauthnChallenges.challengeId, id))
      .limit(1)

    if (rows.length === 0) throw new ServiceError(404, 'Challenge not found')
    const row = rows[0]

    // Delete immediately (one-time use)
    await this.db
      .delete(webauthnChallenges)
      .where(eq(webauthnChallenges.challengeId, id))

    // Check expiry
    if (Date.now() - row.createdAt.getTime() > CHALLENGE_TTL_MS) {
      throw new ServiceError(410, 'Challenge expired')
    }

    return { challenge: row.challenge }
  }

  // =========================================================================
  // WebAuthn Settings (stored in systemSettings table)
  // =========================================================================

  /**
   * Get WebAuthn enforcement settings.
   */
  async getWebAuthnSettings(): Promise<WebAuthnSettings> {
    const rows = await this.db
      .select({ webauthnSettings: systemSettings.webauthnSettings })
      .from(systemSettings)
      .limit(1)

    if (rows.length === 0 || !rows[0].webauthnSettings) {
      return { requireForAdmins: false, requireForUsers: false }
    }
    return rows[0].webauthnSettings as WebAuthnSettings
  }

  /**
   * Update WebAuthn enforcement settings.
   */
  async updateWebAuthnSettings(data: Partial<WebAuthnSettings>): Promise<WebAuthnSettings> {
    const current = await this.getWebAuthnSettings()
    const updated = { ...current, ...data }

    // Upsert into systemSettings — assumes a single row exists (created by SettingsService.ensureInit)
    await this.db
      .update(systemSettings)
      .set({ webauthnSettings: updated })

    return updated
  }

  // =========================================================================
  // Device Push Token Management (Epic 86)
  // =========================================================================

  /**
   * List all devices for a volunteer.
   */
  async getDevices(pubkey: string): Promise<{ devices: DeviceRecord[] }> {
    const rows = await this.db
      .select()
      .from(devices)
      .where(eq(devices.pubkey, pubkey))
    return { devices: rows.map(rowToDevice) }
  }

  /**
   * Register (upsert) a device. Enforces max 5 devices per volunteer.
   */
  async registerDevice(pubkey: string, data: {
    platform: 'ios' | 'android'
    pushToken: string
    wakeKeyPublic: string
  }): Promise<void> {
    const now = new Date()

    // Check for existing device with same pushToken
    const existing = await this.db
      .select()
      .from(devices)
      .where(
        and(
          eq(devices.pubkey, pubkey),
          eq(devices.pushToken, data.pushToken),
        ),
      )
      .limit(1)

    if (existing.length > 0) {
      // Update existing device
      await this.db
        .update(devices)
        .set({
          wakeKeyPublic: data.wakeKeyPublic,
          lastSeenAt: now,
        })
        .where(eq(devices.id, existing[0].id))
      return
    }

    // Check device count
    const allDevices = await this.db
      .select({ id: devices.id, lastSeenAt: devices.lastSeenAt })
      .from(devices)
      .where(eq(devices.pubkey, pubkey))

    if (allDevices.length >= MAX_DEVICES_PER_VOLUNTEER) {
      // Remove oldest device
      const sorted = allDevices.sort((a, b) => {
        const aTime = a.lastSeenAt?.getTime() ?? 0
        const bTime = b.lastSeenAt?.getTime() ?? 0
        return aTime - bTime
      })
      await this.db.delete(devices).where(eq(devices.id, sorted[0].id))
    }

    // Insert new device
    await this.db.insert(devices).values({
      pubkey,
      platform: data.platform,
      pushToken: data.pushToken,
      wakeKeyPublic: data.wakeKeyPublic,
      registeredAt: now,
      lastSeenAt: now,
    })
  }

  /**
   * Remove devices with specific push tokens (e.g., after APNS feedback).
   */
  async cleanupDevices(pubkey: string, tokens: string[]): Promise<{ removed: number }> {
    if (tokens.length === 0) return { removed: 0 }

    const deleted = await this.db
      .delete(devices)
      .where(
        and(
          eq(devices.pubkey, pubkey),
          inArray(devices.pushToken, tokens),
        ),
      )
      .returning({ id: devices.id })

    return { removed: deleted.length }
  }

  /**
   * Delete all devices for a volunteer.
   */
  async deleteAllDevices(pubkey: string): Promise<void> {
    await this.db.delete(devices).where(eq(devices.pubkey, pubkey))
  }

  /**
   * Register or update a VoIP push token for a device.
   * Updates the voipToken on the device matching the pubkey + platform,
   * or creates a new device entry if none exists.
   */
  async registerVoipToken(pubkey: string, data: {
    platform: 'ios' | 'android'
    voipToken: string
  }): Promise<void> {
    const now = new Date()

    // Find existing device for this pubkey + platform
    const existing = await this.db
      .select()
      .from(devices)
      .where(
        and(
          eq(devices.pubkey, pubkey),
          eq(devices.platform, data.platform),
        ),
      )
      .limit(1)

    if (existing.length > 0) {
      await this.db
        .update(devices)
        .set({ voipToken: data.voipToken, lastSeenAt: now })
        .where(eq(devices.id, existing[0].id))
    } else {
      // Create a device record just for the voip token
      await this.db.insert(devices).values({
        pubkey,
        platform: data.platform,
        voipToken: data.voipToken,
        registeredAt: now,
        lastSeenAt: now,
      })
    }
  }

  /**
   * Get VoIP tokens for multiple volunteers (batch).
   * Used by VoIP push dispatch during incoming calls.
   */
  async getVoipTokens(pubkeys: string[]): Promise<{
    devices: Array<{ pubkey: string; platform: 'ios' | 'android'; voipToken: string }>
  }> {
    if (pubkeys.length === 0) return { devices: [] }

    const rows = await this.db
      .select({
        pubkey: devices.pubkey,
        platform: devices.platform,
        voipToken: devices.voipToken,
      })
      .from(devices)
      .where(
        and(
          inArray(devices.pubkey, pubkeys),
          sql`${devices.voipToken} IS NOT NULL`,
        ),
      )

    return {
      devices: rows
        .filter((r): r is typeof r & { voipToken: string } => r.voipToken !== null)
        .map(r => ({
          pubkey: r.pubkey,
          platform: r.platform as 'ios' | 'android',
          voipToken: r.voipToken,
        })),
    }
  }

  /**
   * Remove VoIP push token from all devices for a volunteer.
   */
  async deleteVoipToken(pubkey: string): Promise<void> {
    await this.db
      .update(devices)
      .set({ voipToken: null })
      .where(eq(devices.pubkey, pubkey))
  }

  // =========================================================================
  // Device Provisioning Rooms
  // =========================================================================

  /**
   * Create a provisioning room for cross-device key transfer.
   */
  async createProvisionRoom(ephemeralPubkey: string): Promise<{ roomId: string; token: string }> {
    const roomId = crypto.randomUUID()
    const token = randomHexToken(16)
    const now = new Date()
    const expiresAt = new Date(now.getTime() + PROVISION_ROOM_TTL_MS)

    await this.db.insert(provisionRooms).values({
      roomId,
      ephemeralPubkey,
      token,
      status: 'waiting',
      createdAt: now,
      expiresAt,
    })

    return { roomId, token }
  }

  /**
   * Get provisioning room status. Consumes the room if payload is ready.
   */
  async getProvisionRoom(id: string, token: string): Promise<{
    status: 'waiting' | 'ready' | 'expired'
    ephemeralPubkey?: string
    encryptedNsec?: string
    primaryPubkey?: string
  }> {
    const rows = await this.db
      .select()
      .from(provisionRooms)
      .where(eq(provisionRooms.roomId, id))
      .limit(1)

    if (rows.length === 0) throw new ServiceError(404, 'Room not found')
    const room = rows[0]
    if (room.token !== token) throw new ServiceError(403, 'Invalid token')

    if (room.expiresAt < new Date()) {
      await this.db.delete(provisionRooms).where(eq(provisionRooms.roomId, id))
      return { status: 'expired' }
    }

    if (room.encryptedNsec) {
      // Consume the room
      await this.db.delete(provisionRooms).where(eq(provisionRooms.roomId, id))
      return {
        status: 'ready',
        ephemeralPubkey: room.ephemeralPubkey,
        encryptedNsec: room.encryptedNsec,
        primaryPubkey: room.primaryPubkey ?? undefined,
      }
    }

    return { status: 'waiting', ephemeralPubkey: room.ephemeralPubkey }
  }

  /**
   * Set the encrypted payload on a provisioning room.
   */
  async setProvisionPayload(id: string, data: {
    token: string
    encryptedNsec: string
    primaryPubkey: string
    senderPubkey: string
  }): Promise<void> {
    const rows = await this.db
      .select()
      .from(provisionRooms)
      .where(eq(provisionRooms.roomId, id))
      .limit(1)

    if (rows.length === 0) throw new ServiceError(404, 'Room not found')
    const room = rows[0]
    if (room.token !== data.token) throw new ServiceError(403, 'Invalid token')

    if (room.expiresAt < new Date()) {
      await this.db.delete(provisionRooms).where(eq(provisionRooms.roomId, id))
      throw new ServiceError(410, 'Room expired')
    }

    await this.db
      .update(provisionRooms)
      .set({
        encryptedNsec: data.encryptedNsec,
        primaryPubkey: data.primaryPubkey,
        status: 'ready',
      })
      .where(eq(provisionRooms.roomId, id))
  }

  // =========================================================================
  // Cleanup (replaces DO alarm)
  // =========================================================================

  /**
   * Expire old sessions, challenges, provisioning rooms, and redeemed/expired invites.
   * Intended to be called from a scheduled worker or cron trigger.
   */
  async cleanup(): Promise<{
    expiredSessions: number
    expiredChallenges: number
    expiredProvisionRooms: number
    expiredInvites: number
  }> {
    const now = new Date()

    // Expired sessions
    const deletedSessions = await this.db
      .delete(sessions)
      .where(lt(sessions.expiresAt, now))
      .returning({ token: sessions.token })

    // Expired challenges (5 min TTL)
    const challengeCutoff = new Date(now.getTime() - CHALLENGE_TTL_MS)
    const deletedChallenges = await this.db
      .delete(webauthnChallenges)
      .where(lt(webauthnChallenges.createdAt, challengeCutoff))
      .returning({ challengeId: webauthnChallenges.challengeId })

    // Expired provisioning rooms
    const deletedRooms = await this.db
      .delete(provisionRooms)
      .where(lt(provisionRooms.expiresAt, now))
      .returning({ roomId: provisionRooms.roomId })

    // Redeemed invites (clean up after 24h) and expired-unredeemed invites (clean up after 7 days)
    const redeemedCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const expiredCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    const deletedRedeemedInvites = await this.db
      .delete(inviteCodes)
      .where(
        and(
          sql`${inviteCodes.usedAt} IS NOT NULL`,
          lt(inviteCodes.usedAt, redeemedCutoff),
        ),
      )
      .returning({ code: inviteCodes.code })

    const deletedExpiredInvites = await this.db
      .delete(inviteCodes)
      .where(
        and(
          sql`${inviteCodes.usedAt} IS NULL`,
          lt(inviteCodes.expiresAt, expiredCutoff),
        ),
      )
      .returning({ code: inviteCodes.code })

    return {
      expiredSessions: deletedSessions.length,
      expiredChallenges: deletedChallenges.length,
      expiredProvisionRooms: deletedRooms.length,
      expiredInvites: deletedRedeemedInvites.length + deletedExpiredInvites.length,
    }
  }

  // =========================================================================
  // Test Reset (demo/development only)
  // =========================================================================

  /**
   * Truncate all identity-related tables. Only allowed in demo/development mode.
   */
  async reset(demoMode: boolean, environment: string): Promise<void> {
    if (!demoMode && environment !== 'development') {
      throw new ServiceError(403, 'Reset not allowed outside demo/development mode')
    }

    await this.db.transaction(async (tx) => {
      // Delete in FK-safe order (children first)
      await tx.delete(devices)
      await tx.delete(webauthnCredentials)
      await tx.delete(webauthnChallenges)
      await tx.delete(sessions)
      await tx.delete(provisionRooms)
      await tx.delete(inviteCodes)
      await tx.delete(users)
    })
  }

  /**
   * Skip admin seed on next init (for bootstrap tests).
   * Deletes all volunteers — used only in test setup.
   */
  async testSkipAdminSeed(): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(devices)
      await tx.delete(webauthnCredentials)
      await tx.delete(webauthnChallenges)
      await tx.delete(sessions)
      await tx.delete(users)
    })
  }
}
