/**
 * Authenticated API test helpers.
 *
 * All helpers create proper Schnorr auth tokens matching the server's auth
 * middleware. The admin nsec is used by default; pass a different nsec for
 * role-specific testing (volunteer, reporter, custom).
 *
 * Use these in step definitions for:
 * - Fast test setup (create volunteers/shifts/bans without UI)
 * - Behavioral verification (check API state after UI actions)
 * - Permission enforcement (verify 403s for restricted roles)
 */

import { type APIRequestContext } from '@playwright/test'
import { schnorr } from '@noble/curves/secp256k1.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { hexToBytes, bytesToHex } from '@noble/hashes/utils.js'
import { utf8ToBytes } from '@noble/ciphers/utils.js'
import { nip19, getPublicKey } from 'nostr-tools'

// Same constant used by the server auth middleware
const AUTH_PREFIX = 'llamenos:auth:'

// Admin credentials from helpers.ts (single source of truth)
export const ADMIN_NSEC = 'nsec174zsa94n3e7t0ugfldh9tgkkzmaxhalr78uxt9phjq3mmn6d6xas5jdffh'

// ── Schnorr Authentication ────────────────────────────────────────

function nsecToSkHex(nsec: string): string {
  const decoded = nip19.decode(nsec)
  if (decoded.type !== 'nsec') throw new Error('Invalid nsec')
  return bytesToHex(decoded.data as Uint8Array)
}

function skHexToPubkey(skHex: string): string {
  return getPublicKey(hexToBytes(skHex))
}

/**
 * Create a Schnorr auth token for API calls.
 * Matches the format expected by apps/worker/lib/auth.ts.
 */
function createSchnorrAuthToken(
  nsec: string,
  method: string,
  path: string,
): { pubkey: string; timestamp: number; token: string } {
  const skHex = nsecToSkHex(nsec)
  const pubkey = skHexToPubkey(skHex)
  const timestamp = Date.now()
  const message = `${AUTH_PREFIX}${pubkey}:${timestamp}:${method}:${path}`
  const messageHash = sha256(utf8ToBytes(message))
  const sig = schnorr.sign(messageHash, hexToBytes(skHex))
  return { pubkey, timestamp, token: bytesToHex(sig) }
}

function authHeaders(nsec: string, method: string, path: string): Record<string, string> {
  const token = createSchnorrAuthToken(nsec, method, path)
  return {
    'Authorization': `Bearer ${JSON.stringify(token)}`,
    'Content-Type': 'application/json',
  }
}

// ── Authenticated Request Primitives ──────────────────────────────

export async function apiGet<T = unknown>(
  request: APIRequestContext,
  path: string,
  nsec: string = ADMIN_NSEC,
): Promise<{ status: number; data: T }> {
  const fullPath = `/api${path}`
  const res = await request.get(fullPath, {
    headers: authHeaders(nsec, 'GET', fullPath),
  })
  const data = res.ok() ? await res.json() : null
  return { status: res.status(), data: data as T }
}

export async function apiPost<T = unknown>(
  request: APIRequestContext,
  path: string,
  body: Record<string, unknown>,
  nsec: string = ADMIN_NSEC,
): Promise<{ status: number; data: T }> {
  const fullPath = `/api${path}`
  const res = await request.post(fullPath, {
    headers: authHeaders(nsec, 'POST', fullPath),
    data: body,
  })
  const data = res.ok() ? await res.json() : null
  return { status: res.status(), data: data as T }
}

export async function apiPatch<T = unknown>(
  request: APIRequestContext,
  path: string,
  body: Record<string, unknown>,
  nsec: string = ADMIN_NSEC,
): Promise<{ status: number; data: T }> {
  const fullPath = `/api${path}`
  const res = await request.patch(fullPath, {
    headers: authHeaders(nsec, 'PATCH', fullPath),
    data: body,
  })
  const data = res.ok() ? await res.json() : null
  return { status: res.status(), data: data as T }
}

export async function apiPut<T = unknown>(
  request: APIRequestContext,
  path: string,
  body: Record<string, unknown>,
  nsec: string = ADMIN_NSEC,
): Promise<{ status: number; data: T }> {
  const fullPath = `/api${path}`
  const res = await request.put(fullPath, {
    headers: authHeaders(nsec, 'PUT', fullPath),
    data: body,
  })
  const data = res.ok() ? await res.json() : null
  return { status: res.status(), data: data as T }
}

export async function apiDelete<T = unknown>(
  request: APIRequestContext,
  path: string,
  nsec: string = ADMIN_NSEC,
): Promise<{ status: number; data: T }> {
  const fullPath = `/api${path}`
  const res = await request.delete(fullPath, {
    headers: authHeaders(nsec, 'DELETE', fullPath),
  })
  const data = res.ok() ? await res.json() : null
  return { status: res.status(), data: data as T }
}

// ── Unique Test Data Generators ───────────────────────────────────

export function uniquePhone(): string {
  const suffix = Date.now().toString().slice(-7)
  return `+1555${suffix}`
}

export function uniqueName(prefix: string): string {
  return `${prefix} ${Date.now()}`
}

// ── Keypair Generation ────────────────────────────────────────────

export function generateTestKeypair(): { nsec: string; pubkey: string; skHex: string } {
  const skBytes = crypto.getRandomValues(new Uint8Array(32))
  const skHex = bytesToHex(skBytes)
  const pubkey = skHexToPubkey(skHex)
  const nsec = nip19.nsecEncode(skBytes)
  return { nsec, pubkey, skHex }
}

// ── Volunteer CRUD ────────────────────────────────────────────────

export interface CreateVolunteerResult {
  pubkey: string
  nsec: string
  name: string
  phone: string
}

export async function createVolunteerViaApi(
  request: APIRequestContext,
  options?: { name?: string; phone?: string; roleIds?: string[] },
): Promise<CreateVolunteerResult> {
  const name = options?.name ?? uniqueName('TestVol')
  const phone = options?.phone ?? uniquePhone()
  const roleIds = options?.roleIds ?? ['role-volunteer']

  const { nsec, pubkey } = generateTestKeypair()

  const { status, data } = await apiPost(request, '/volunteers', {
    name, phone, roleIds, pubkey,
  })

  if (status !== 200 && status !== 201) {
    throw new Error(`Failed to create volunteer: ${status}`)
  }

  return { pubkey, nsec, name, phone }
}

export async function deleteVolunteerViaApi(
  request: APIRequestContext,
  pubkey: string,
): Promise<void> {
  const { status } = await apiDelete(request, `/volunteers/${pubkey}`)
  if (status !== 200) {
    throw new Error(`Failed to delete volunteer: ${status}`)
  }
}

export async function listVolunteersViaApi(
  request: APIRequestContext,
): Promise<Array<{ pubkey: string; name: string; phone: string; roles: string[]; active: boolean }>> {
  const { status, data } = await apiGet<{ volunteers: Array<{ pubkey: string; name: string; phone: string; roles: string[]; active: boolean }> }>(request, '/volunteers')
  if (status !== 200) throw new Error(`Failed to list volunteers: ${status}`)
  return data.volunteers
}

export async function updateVolunteerViaApi(
  request: APIRequestContext,
  pubkey: string,
  updates: { name?: string; phone?: string; roles?: string[]; active?: boolean },
): Promise<void> {
  const { status } = await apiPatch(request, `/volunteers/${pubkey}`, updates)
  if (status !== 200) throw new Error(`Failed to update volunteer: ${status}`)
}

// ── Ban CRUD ──────────────────────────────────────────────────────

export interface CreateBanResult {
  phone: string
  reason: string
}

export async function createBanViaApi(
  request: APIRequestContext,
  options?: { phone?: string; reason?: string },
): Promise<CreateBanResult> {
  const phone = options?.phone ?? uniquePhone()
  const reason = options?.reason ?? 'E2E test ban'

  const { status } = await apiPost(request, '/bans', { phone, reason })
  if (status !== 200 && status !== 201) {
    throw new Error(`Failed to create ban: ${status}`)
  }
  return { phone, reason }
}

export async function removeBanViaApi(
  request: APIRequestContext,
  phone: string,
): Promise<void> {
  const { status } = await apiDelete(request, `/bans/${encodeURIComponent(phone)}`)
  if (status !== 200) throw new Error(`Failed to remove ban: ${status}`)
}

export async function listBansViaApi(
  request: APIRequestContext,
): Promise<Array<{ phone: string; reason: string; bannedBy: string; bannedAt: string }>> {
  const { status, data } = await apiGet<{ bans: Array<{ phone: string; reason: string; bannedBy: string; bannedAt: string }> }>(request, '/bans')
  if (status !== 200) throw new Error(`Failed to list bans: ${status}`)
  return data.bans
}

export async function bulkAddBansViaApi(
  request: APIRequestContext,
  phones: string[],
  reason: string,
): Promise<{ count: number }> {
  const { status, data } = await apiPost<{ count: number }>(request, '/bans/bulk', { phones, reason })
  if (status !== 200) throw new Error(`Failed to bulk add bans: ${status}`)
  return data
}

// ── Shift CRUD ────────────────────────────────────────────────────

export interface CreateShiftResult {
  id: string
  name: string
}

export async function createShiftViaApi(
  request: APIRequestContext,
  options?: {
    name?: string
    startTime?: string
    endTime?: string
    days?: number[]
    volunteerPubkeys?: string[]
  },
): Promise<CreateShiftResult> {
  const name = options?.name ?? uniqueName('TestShift')
  const startTime = options?.startTime ?? '09:00'
  const endTime = options?.endTime ?? '17:00'
  const days = options?.days ?? [1, 2, 3, 4, 5]
  const volunteerPubkeys = options?.volunteerPubkeys ?? []

  const { status, data } = await apiPost<{ shift: { id: string } }>(request, '/shifts', {
    name, startTime, endTime, days, volunteerPubkeys,
  })
  if (status !== 200 && status !== 201) {
    throw new Error(`Failed to create shift: ${status}`)
  }
  return { id: data.shift.id, name }
}

export async function deleteShiftViaApi(
  request: APIRequestContext,
  id: string,
): Promise<void> {
  const { status } = await apiDelete(request, `/shifts/${id}`)
  if (status !== 200) throw new Error(`Failed to delete shift: ${status}`)
}

export async function listShiftsViaApi(
  request: APIRequestContext,
): Promise<Array<{ id: string; name: string; startTime: string; endTime: string; days: number[]; volunteerPubkeys: string[] }>> {
  const { status, data } = await apiGet<{ shifts: Array<{ id: string; name: string; startTime: string; endTime: string; days: number[]; volunteerPubkeys: string[] }> }>(request, '/shifts')
  if (status !== 200) throw new Error(`Failed to list shifts: ${status}`)
  return data.shifts
}

export async function updateShiftViaApi(
  request: APIRequestContext,
  id: string,
  updates: { name?: string; startTime?: string; endTime?: string; days?: number[]; volunteerPubkeys?: string[] },
): Promise<void> {
  const { status } = await apiPatch(request, `/shifts/${id}`, updates)
  if (status !== 200) throw new Error(`Failed to update shift: ${status}`)
}

export async function getFallbackGroupViaApi(
  request: APIRequestContext,
): Promise<{ volunteers: string[] }> {
  const { status, data } = await apiGet<{ volunteers: string[] }>(request, '/shifts/fallback')
  if (status !== 200) throw new Error(`Failed to get fallback group: ${status}`)
  return data
}

export async function setFallbackGroupViaApi(
  request: APIRequestContext,
  volunteers: string[],
): Promise<void> {
  const { status } = await apiPut(request, '/shifts/fallback', { volunteers })
  if (status !== 200) throw new Error(`Failed to set fallback group: ${status}`)
}

// ── Roles CRUD ────────────────────────────────────────────────────

export interface RoleDefinition {
  id: string
  name: string
  slug: string
  permissions: string[]
  isDefault: boolean
  isSystem: boolean
  description: string
}

export async function listRolesViaApi(
  request: APIRequestContext,
): Promise<RoleDefinition[]> {
  const { status, data } = await apiGet<{ roles: RoleDefinition[] }>(request, '/settings/roles')
  if (status !== 200) throw new Error(`Failed to list roles: ${status}`)
  return data.roles
}

export async function createRoleViaApi(
  request: APIRequestContext,
  opts: { name: string; slug: string; permissions: string[]; description?: string },
): Promise<RoleDefinition> {
  const { status, data } = await apiPost<{ role: RoleDefinition }>(request, '/settings/roles', {
    name: opts.name,
    slug: opts.slug,
    permissions: opts.permissions,
    description: opts.description ?? '',
  })
  if (status !== 200 && status !== 201) {
    throw new Error(`Failed to create role: ${status}`)
  }
  return data.role
}

export async function updateRoleViaApi(
  request: APIRequestContext,
  id: string,
  updates: { name?: string; permissions?: string[]; description?: string },
): Promise<void> {
  const { status } = await apiPatch(request, `/settings/roles/${id}`, updates)
  if (status !== 200) throw new Error(`Failed to update role: ${status}`)
}

export async function deleteRoleViaApi(
  request: APIRequestContext,
  id: string,
): Promise<{ status: number }> {
  // Returns status so callers can assert 403 for system roles
  return apiDelete(request, `/settings/roles/${id}`)
}

export async function getPermissionsCatalogViaApi(
  request: APIRequestContext,
): Promise<{ permissions: Record<string, string>; byDomain: Record<string, Array<{ key: string; label: string }>> }> {
  const { status, data } = await apiGet<{ permissions: Record<string, string>; byDomain: Record<string, Array<{ key: string; label: string }>> }>(request, '/settings/permissions')
  if (status !== 200) throw new Error(`Failed to get permissions catalog: ${status}`)
  return data
}

// ── Notes (list/verify — creation requires encryption) ────────────

export interface NoteRecord {
  id: string
  callId?: string
  conversationId?: string
  contactHash?: string
  authorPubkey: string
  encryptedContent: string
  createdAt: string
  updatedAt: string
  replyCount?: number
}

export async function listNotesViaApi(
  request: APIRequestContext,
  params?: { callId?: string; page?: number; limit?: number },
): Promise<{ notes: NoteRecord[]; total: number }> {
  const qs = new URLSearchParams()
  if (params?.callId) qs.set('callId', params.callId)
  if (params?.page) qs.set('page', String(params.page))
  if (params?.limit) qs.set('limit', String(params.limit))
  const qsStr = qs.toString()
  const path = `/notes${qsStr ? `?${qsStr}` : ''}`
  const { status, data } = await apiGet<{ notes: NoteRecord[]; total: number }>(request, path)
  if (status !== 200) throw new Error(`Failed to list notes: ${status}`)
  return data
}

// ── Audit Log ─────────────────────────────────────────────────────

export interface AuditEntry {
  id: string
  event: string
  actorPubkey: string
  details: Record<string, unknown>
  createdAt: string
}

export async function listAuditLogViaApi(
  request: APIRequestContext,
  params?: { eventType?: string; search?: string; page?: number; limit?: number },
): Promise<{ entries: AuditEntry[]; total: number }> {
  const qs = new URLSearchParams()
  if (params?.eventType) qs.set('eventType', params.eventType)
  if (params?.search) qs.set('search', params.search)
  if (params?.page) qs.set('page', String(params.page))
  if (params?.limit) qs.set('limit', String(params.limit))
  const qsStr = qs.toString()
  const path = `/audit${qsStr ? `?${qsStr}` : ''}`
  const { status, data } = await apiGet<{ entries: AuditEntry[]; total: number }>(request, path)
  if (status !== 200) throw new Error(`Failed to list audit log: ${status}`)
  return data
}

// ── Reports ───────────────────────────────────────────────────────

export interface ReportRecord {
  id: string
  channelType: string
  status: string
  assignedTo?: string
  createdAt: string
  metadata?: {
    type?: string
    reportTitle?: string
    reportCategory?: string
  }
}

export async function listReportsViaApi(
  request: APIRequestContext,
  params?: { status?: string },
): Promise<{ conversations: ReportRecord[]; total: number }> {
  const qs = new URLSearchParams()
  if (params?.status) qs.set('status', params.status)
  const qsStr = qs.toString()
  const path = `/reports${qsStr ? `?${qsStr}` : ''}`
  const { status, data } = await apiGet<{ conversations: ReportRecord[]; total: number }>(request, path)
  if (status !== 200) throw new Error(`Failed to list reports: ${status}`)
  return data
}

// ── Custom Fields ─────────────────────────────────────────────────

export interface CustomFieldDefinition {
  id: string
  name: string
  type: 'text' | 'select' | 'number' | 'boolean'
  options?: string[]
  required?: boolean
}

export async function getCustomFieldsViaApi(
  request: APIRequestContext,
): Promise<CustomFieldDefinition[]> {
  const { status, data } = await apiGet<{ fields: CustomFieldDefinition[] }>(request, '/settings/custom-fields')
  if (status !== 200) throw new Error(`Failed to get custom fields: ${status}`)
  return data.fields
}

export async function updateCustomFieldsViaApi(
  request: APIRequestContext,
  fields: CustomFieldDefinition[],
): Promise<CustomFieldDefinition[]> {
  const { status, data } = await apiPut<{ fields: CustomFieldDefinition[] }>(request, '/settings/custom-fields', { fields })
  if (status !== 200) throw new Error(`Failed to update custom fields: ${status}`)
  return data.fields
}

// ── Settings ──────────────────────────────────────────────────────

export async function getSpamSettingsViaApi(
  request: APIRequestContext,
): Promise<{ voiceCaptchaEnabled: boolean; rateLimitEnabled: boolean; maxCallsPerMinute: number; blockDurationMinutes: number }> {
  const { status, data } = await apiGet(request, '/settings/spam')
  if (status !== 200) throw new Error(`Failed to get spam settings: ${status}`)
  return data as { voiceCaptchaEnabled: boolean; rateLimitEnabled: boolean; maxCallsPerMinute: number; blockDurationMinutes: number }
}

export async function getTranscriptionSettingsViaApi(
  request: APIRequestContext,
): Promise<{ globalEnabled: boolean; allowVolunteerOptOut: boolean }> {
  const { status, data } = await apiGet(request, '/settings/transcription')
  if (status !== 200) throw new Error(`Failed to get transcription settings: ${status}`)
  return data as { globalEnabled: boolean; allowVolunteerOptOut: boolean }
}

// ── Auth Verification ─────────────────────────────────────────────

export async function getMeViaApi(
  request: APIRequestContext,
  nsec: string,
): Promise<{ status: number; data: { pubkey: string; roles: string[]; permissions: string[]; name: string } | null }> {
  return apiGet(request, '/auth/me', nsec)
}

/**
 * Test endpoint access with a specific nsec.
 * Returns just the status code — useful for permission enforcement tests.
 */
export async function testEndpointAccess(
  request: APIRequestContext,
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  nsec: string,
  body?: Record<string, unknown>,
): Promise<number> {
  switch (method) {
    case 'GET':
      return (await apiGet(request, path, nsec)).status
    case 'POST':
      return (await apiPost(request, path, body ?? {}, nsec)).status
    case 'PATCH':
      return (await apiPatch(request, path, body ?? {}, nsec)).status
    case 'PUT':
      return (await apiPut(request, path, body ?? {}, nsec)).status
    case 'DELETE':
      return (await apiDelete(request, path, nsec)).status
  }
}

// ── Cleanup ───────────────────────────────────────────────────────

export async function cleanupTestData(
  request: APIRequestContext,
  data: {
    volunteerPubkeys?: string[]
    banPhones?: string[]
    shiftIds?: string[]
    roleIds?: string[]
  },
): Promise<void> {
  const errors: string[] = []

  for (const pubkey of data.volunteerPubkeys ?? []) {
    try { await deleteVolunteerViaApi(request, pubkey) } catch (e) { errors.push(String(e)) }
  }
  for (const phone of data.banPhones ?? []) {
    try { await removeBanViaApi(request, phone) } catch (e) { errors.push(String(e)) }
  }
  for (const id of data.shiftIds ?? []) {
    try { await deleteShiftViaApi(request, id) } catch (e) { errors.push(String(e)) }
  }
  for (const id of data.roleIds ?? []) {
    try { await deleteRoleViaApi(request, id) } catch (e) { errors.push(String(e)) }
  }

  if (errors.length > 0) {
    console.warn('Cleanup errors:', errors.join(', '))
  }
}
