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
  // Strip query params — server verifies against url.pathname (no query string)
  const pathWithoutQuery = path.split('?')[0]
  const token = createSchnorrAuthToken(nsec, method, pathWithoutQuery)
  return {
    'Authorization': `Bearer ${JSON.stringify(token)}`,
    'Content-Type': 'application/json',
  }
}

// ── Safe JSON parsing (handles HTML error pages) ─────────────────

async function safeJson(res: import('@playwright/test').APIResponse): Promise<unknown> {
  const contentType = res.headers()['content-type'] ?? ''
  if (!contentType.includes('application/json')) return null
  try {
    return await res.json()
  } catch {
    return null
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
  const data = res.ok() ? await safeJson(res) : null
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
  const data = res.ok() ? await safeJson(res) : null
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
  const data = res.ok() ? await safeJson(res) : null
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
  const data = res.ok() ? await safeJson(res) : null
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
  const data = res.ok() ? await safeJson(res) : null
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

export async function getVolunteerViaApi(
  request: APIRequestContext,
  pubkey: string,
  nsec = ADMIN_NSEC,
): Promise<Record<string, unknown>> {
  const { status, data } = await apiGet<Record<string, unknown>>(request, `/volunteers/${pubkey}`, nsec)
  if (status !== 200) throw new Error(`Failed to get volunteer: ${status}`)
  return data
}

export async function updateVolunteerViaApi(
  request: APIRequestContext,
  pubkey: string,
  updates: Record<string, unknown>,
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
  const { status } = await apiPut(request, '/shifts/fallback', { volunteerPubkeys: volunteers })
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
  const { status, data } = await apiPost<RoleDefinition>(request, '/settings/roles', {
    name: opts.name,
    slug: opts.slug,
    permissions: opts.permissions,
    description: opts.description || `Custom role: ${opts.name}`,
  })
  if (status === 409) {
    // Role already exists (parallel test created it) — fetch and return it
    const roles = await listRolesViaApi(request)
    const existing = roles.find(r => r.slug === opts.slug)
    if (existing) return existing
    throw new Error(`Role slug "${opts.slug}" conflicts but not found in list`)
  }
  if (status !== 200 && status !== 201) {
    throw new Error(`Failed to create role: ${status}`)
  }
  // API returns the role directly, not wrapped in { role: ... }
  const role = (data as unknown as { role?: RoleDefinition })?.role ?? data
  return role
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
  entryHash?: string
  previousEntryHash?: string
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

/**
 * Create a report via API with dummy encrypted content.
 * Uses placeholder encryption values — suitable for test data seeding only.
 */
export async function createReportViaApi(
  request: APIRequestContext,
  options?: { title?: string; category?: string; status?: string },
): Promise<ReportRecord> {
  const skHex = nsecToSkHex(ADMIN_NSEC)
  const pubkey = skHexToPubkey(skHex)

  // Dummy ECIES envelope — server stores but doesn't validate crypto
  const dummyEnvelope = {
    pubkey,
    wrappedKey: 'a'.repeat(64),
    ephemeralPubkey: pubkey,
  }

  const title = options?.title ?? `Test Report ${Date.now()}`
  const { status, data } = await apiPost<ReportRecord>(request, '/reports', {
    title,
    category: options?.category ?? 'test',
    encryptedContent: 'dGVzdCByZXBvcnQgY29udGVudA==', // base64 "test report content"
    readerEnvelopes: [dummyEnvelope],
  })
  if (status !== 201 && status !== 200) {
    throw new Error(`Failed to create report: ${status} ${JSON.stringify(data)}`)
  }

  const report = data as ReportRecord
  // If caller wants a specific status, update it
  if (options?.status && options.status !== 'waiting') {
    if (options.status === 'active') {
      await assignReportViaApi(request, report.id, pubkey)
    } else if (options.status === 'closed') {
      await assignReportViaApi(request, report.id, pubkey)
      await updateReportStatusViaApi(request, report.id, 'closed')
    }
  }
  return report
}

export async function assignReportViaApi(
  request: APIRequestContext,
  reportId: string,
  pubkey: string,
): Promise<void> {
  const { status } = await apiPost(request, `/reports/${reportId}/assign`, { assignedTo: pubkey })
  if (status !== 200) throw new Error(`Failed to assign report: ${status}`)
}

export async function updateReportStatusViaApi(
  request: APIRequestContext,
  reportId: string,
  newStatus: string,
): Promise<void> {
  const { status } = await apiPatch(request, `/reports/${reportId}`, { status: newStatus })
  if (status !== 200) throw new Error(`Failed to update report status: ${status}`)
}

// ── Custom Fields ─────────────────────────────────────────────────

export interface CustomFieldDefinition {
  id: string
  name: string
  label: string
  type: 'text' | 'select' | 'number' | 'boolean'
  context?: 'call-notes' | 'conversation-notes' | 'reports' | 'all'
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

// ── Case Management: Entity Schema (Epic 315) ──────────────────────

export async function enableCaseManagementViaApi(
  request: APIRequestContext,
  enabled = true,
  nsec = ADMIN_NSEC,
): Promise<{ enabled: boolean }> {
  const { status, data } = await apiPut<{ enabled: boolean }>(request, '/settings/cms/case-management', { enabled }, nsec)
  if (status !== 200) throw new Error(`Failed to toggle case management: ${status}`)
  return data
}

export async function getCaseManagementEnabledViaApi(
  request: APIRequestContext,
  nsec = ADMIN_NSEC,
): Promise<{ enabled: boolean }> {
  const { data } = await apiGet<{ enabled: boolean }>(request, '/settings/cms/case-management', nsec)
  return data
}

export async function createEntityTypeViaApi(
  request: APIRequestContext,
  options?: {
    name?: string
    label?: string
    category?: string
    color?: string
    statuses?: Array<{ value: string; label: string; order: number }>
    fields?: Array<{ name: string; label: string; type: string; required?: boolean; order: number }>
    numberPrefix?: string
  },
  nsec = ADMIN_NSEC,
): Promise<Record<string, unknown>> {
  const name = options?.name ?? `test_type_${Date.now()}`
  const defaultStatuses = [
    { value: 'open', label: 'Open', order: 0 },
    { value: 'closed', label: 'Closed', order: 1, isClosed: true },
  ]
  const { status, data } = await apiPost<Record<string, unknown>>(
    request,
    '/settings/cms/entity-types',
    {
      name,
      label: options?.label ?? name.replace(/_/g, ' '),
      labelPlural: options?.label ? `${options.label}s` : `${name.replace(/_/g, ' ')}s`,
      description: `Test entity type ${name}`,
      category: options?.category ?? 'case',
      color: options?.color,
      statuses: options?.statuses ?? defaultStatuses,
      defaultStatus: (options?.statuses ?? defaultStatuses)[0].value,
      closedStatuses: (options?.statuses ?? defaultStatuses).filter(s => (s as Record<string, unknown>).isClosed).map(s => s.value),
      fields: (options?.fields ?? []).map((f, i) => ({
        ...f,
        label: f.label ?? f.name,
        required: f.required ?? false,
        order: f.order ?? i,
        indexable: false,
        indexType: 'none',
        accessLevel: 'all',
        visibleToVolunteers: true,
        editableByVolunteers: true,
        hubEditable: true,
      })),
      numberPrefix: options?.numberPrefix,
      numberingEnabled: !!options?.numberPrefix,
    },
    nsec,
  )
  if (status !== 201 && status !== 200) throw new Error(`Failed to create entity type: ${status}`)
  return data
}

export async function listEntityTypesViaApi(
  request: APIRequestContext,
  nsec = ADMIN_NSEC,
): Promise<Record<string, unknown>[]> {
  const { data } = await apiGet<{ entityTypes: Record<string, unknown>[] }>(request, '/settings/cms/entity-types', nsec)
  return data?.entityTypes ?? []
}

export async function updateEntityTypeViaApi(
  request: APIRequestContext,
  id: string,
  updates: Record<string, unknown>,
  nsec = ADMIN_NSEC,
): Promise<Record<string, unknown>> {
  const { status, data } = await apiPatch<Record<string, unknown>>(request, `/settings/cms/entity-types/${id}`, updates, nsec)
  if (status !== 200) throw new Error(`Failed to update entity type: ${status}`)
  return data
}

export async function deleteEntityTypeViaApi(
  request: APIRequestContext,
  id: string,
  nsec = ADMIN_NSEC,
): Promise<void> {
  const { status } = await apiDelete(request, `/settings/cms/entity-types/${id}`, nsec)
  if (status !== 200) throw new Error(`Failed to delete entity type: ${status}`)
}

export async function createRelationshipTypeViaApi(
  request: APIRequestContext,
  options: {
    sourceEntityTypeId: string
    targetEntityTypeId: string
    cardinality?: string
    label?: string
    reverseLabel?: string
  },
  nsec = ADMIN_NSEC,
): Promise<Record<string, unknown>> {
  const { status, data } = await apiPost<Record<string, unknown>>(
    request,
    '/settings/cms/relationship-types',
    {
      sourceEntityTypeId: options.sourceEntityTypeId,
      targetEntityTypeId: options.targetEntityTypeId,
      cardinality: options.cardinality ?? 'M:N',
      label: options.label ?? 'Related',
      reverseLabel: options.reverseLabel ?? 'Related',
      sourceLabel: 'has',
      targetLabel: 'belongs to',
    },
    nsec,
  )
  if (status !== 201 && status !== 200) throw new Error(`Failed to create relationship type: ${status}`)
  return data
}

export async function generateCaseNumberViaApi(
  request: APIRequestContext,
  prefix: string,
  nsec = ADMIN_NSEC,
): Promise<{ number: string; sequence: number }> {
  const { status, data } = await apiPost<{ number: string; sequence: number }>(
    request,
    '/settings/cms/case-number',
    { prefix },
    nsec,
  )
  if (status !== 200) throw new Error(`Failed to generate case number: ${status}`)
  return data
}

// ── Case Management: Templates (Epic 317) ──────────────────────────

export interface TemplateSummary {
  id: string
  version: string
  name: string
  description: string
  tags: string[]
  entityTypeCount: number
  extends: string[]
}

export async function listTemplatesViaApi(
  request: APIRequestContext,
  nsec = ADMIN_NSEC,
): Promise<TemplateSummary[]> {
  const { status, data } = await apiGet<{ templates: TemplateSummary[] }>(request, '/settings/cms/templates', nsec)
  if (status !== 200) throw new Error(`Failed to list templates: ${status}`)
  return data.templates
}

export async function getTemplateViaApi(
  request: APIRequestContext,
  templateId: string,
  nsec = ADMIN_NSEC,
): Promise<Record<string, unknown>> {
  const { status, data } = await apiGet<Record<string, unknown>>(request, `/settings/cms/templates/${templateId}`, nsec)
  if (status !== 200) throw new Error(`Failed to get template: ${status}`)
  return data
}

export async function applyTemplateViaApi(
  request: APIRequestContext,
  templateId: string,
  nsec = ADMIN_NSEC,
): Promise<{ status: number; data: Record<string, unknown> }> {
  return apiPost<Record<string, unknown>>(request, '/settings/cms/templates/apply', { templateId }, nsec)
}

// ── Case Management: Contacts (Epic 318) ──────────────────────────

/**
 * Convenience wrapper: create a contact by display name.
 * Uses the /directory/contacts endpoint (same as frontend UI) so contacts
 * appear in the directory listing. Falls back to the encrypted /directory
 * endpoint if the plain-text endpoint fails.
 */
export async function createContactByNameViaApi(
  request: APIRequestContext,
  displayName: string,
  extraOptions?: { contactTypeHash?: string },
  nsec = ADMIN_NSEC,
): Promise<Record<string, unknown>> {
  // Try the plain-text /directory/contacts endpoint first (matches frontend)
  try {
    const { status, data } = await apiPost<Record<string, unknown>>(
      request,
      '/directory/contacts',
      {
        displayName,
        contactType: extraOptions?.contactTypeHash ?? 'individual',
      },
      nsec,
    )
    if (status === 200 || status === 201) return data
  } catch {
    // Fall through to encrypted endpoint
  }
  // Fallback: encrypted /directory endpoint
  return createContactViaApi(request, {
    encryptedSummary: btoa(JSON.stringify({ displayName })),
    identifierHashes: [`name_${Date.now()}_${Math.random().toString(36).slice(2)}`],
    contactTypeHash: extraOptions?.contactTypeHash,
  }, nsec)
}

function dummyEnvelope(nsec = ADMIN_NSEC): { pubkey: string; wrappedKey: string; ephemeralPubkey: string } {
  const skHex = nsecToSkHex(nsec)
  const pubkey = skHexToPubkey(skHex)
  return { pubkey, wrappedKey: 'a'.repeat(64), ephemeralPubkey: pubkey }
}

export async function createContactViaApi(
  request: APIRequestContext,
  options?: {
    identifierHashes?: string[]
    nameHash?: string
    encryptedSummary?: string
    contactTypeHash?: string
  },
  nsec = ADMIN_NSEC,
): Promise<Record<string, unknown>> {
  const envelope = dummyEnvelope(nsec)
  const { status, data } = await apiPost<Record<string, unknown>>(
    request,
    '/directory',
    {
      hubId: '',
      identifierHashes: options?.identifierHashes ?? [`idhash_${Date.now()}_${Math.random().toString(36).slice(2)}`],
      nameHash: options?.nameHash,
      encryptedSummary: options?.encryptedSummary ?? 'dGVzdCBjb250YWN0',
      summaryEnvelopes: [envelope],
      contactTypeHash: options?.contactTypeHash,
      tagHashes: [],
      blindIndexes: {},
    },
    nsec,
  )
  if (status !== 201 && status !== 200) throw new Error(`Failed to create contact: ${status}`)
  return data
}

export async function listContactsViaApi(
  request: APIRequestContext,
  params?: { page?: number; limit?: number; contactTypeHash?: string },
  nsec = ADMIN_NSEC,
): Promise<{ contacts: Record<string, unknown>[]; total: number; hasMore: boolean }> {
  const qs = new URLSearchParams()
  if (params?.page) qs.set('page', String(params.page))
  if (params?.limit) qs.set('limit', String(params.limit))
  if (params?.contactTypeHash) qs.set('contactTypeHash', params.contactTypeHash)
  const qsStr = qs.toString()
  const path = `/directory${qsStr ? `?${qsStr}` : ''}`
  const { status, data } = await apiGet<{ contacts: Record<string, unknown>[]; total: number; hasMore: boolean }>(request, path, nsec)
  if (status !== 200) throw new Error(`Failed to list contacts: ${status}`)
  return data
}

export async function lookupContactViaApi(
  request: APIRequestContext,
  identifierHash: string,
  nsec = ADMIN_NSEC,
): Promise<{ contact: Record<string, unknown> | null }> {
  const { status, data } = await apiGet<{ contact: Record<string, unknown> | null }>(request, `/directory/lookup/${identifierHash}`, nsec)
  if (status !== 200) throw new Error(`Failed to lookup contact: ${status}`)
  return data
}

export async function updateContactViaApi(
  request: APIRequestContext,
  contactId: string,
  updates: Record<string, unknown>,
  nsec = ADMIN_NSEC,
): Promise<Record<string, unknown>> {
  const { status, data } = await apiPatch<Record<string, unknown>>(request, `/directory/${contactId}`, updates, nsec)
  if (status !== 200) throw new Error(`Failed to update contact: ${status}`)
  return data
}

export async function deleteContactViaApi(
  request: APIRequestContext,
  contactId: string,
  nsec = ADMIN_NSEC,
): Promise<void> {
  const { status } = await apiDelete(request, `/directory/${contactId}`, nsec)
  if (status !== 200) throw new Error(`Failed to delete contact: ${status}`)
}

// ── Case Management: Records (Epic 319) ──────────────────────────

export async function createRecordViaApi(
  request: APIRequestContext,
  entityTypeId: string,
  options?: {
    statusHash?: string
    assignedTo?: string[]
    blindIndexes?: Record<string, string>
    parentRecordId?: string
  },
  nsec = ADMIN_NSEC,
): Promise<Record<string, unknown>> {
  const envelope = dummyEnvelope(nsec)
  const { status, data } = await apiPost<Record<string, unknown>>(
    request,
    '/records',
    {
      entityTypeId,
      statusHash: options?.statusHash ?? 'status_open_hash',
      assignedTo: options?.assignedTo ?? [],
      blindIndexes: options?.blindIndexes ?? {},
      encryptedSummary: 'dGVzdCByZWNvcmQ=',
      summaryEnvelopes: [envelope],
      parentRecordId: options?.parentRecordId,
    },
    nsec,
  )
  if (status !== 201 && status !== 200) throw new Error(`Failed to create record: ${status}`)
  return data
}

export async function listRecordsViaApi(
  request: APIRequestContext,
  params?: { entityTypeId?: string; statusHash?: string; assignedTo?: string; page?: number; limit?: number },
  nsec = ADMIN_NSEC,
): Promise<{ records: Record<string, unknown>[]; total: number; hasMore: boolean }> {
  const qs = new URLSearchParams()
  if (params?.page) qs.set('page', String(params.page))
  if (params?.limit) qs.set('limit', String(params.limit))
  if (params?.entityTypeId) qs.set('entityTypeId', params.entityTypeId)
  if (params?.statusHash) qs.set('statusHash', params.statusHash)
  if (params?.assignedTo) qs.set('assignedTo', params.assignedTo)
  const qsStr = qs.toString()
  const path = `/records${qsStr ? `?${qsStr}` : ''}`
  const { status, data } = await apiGet<{ records: Record<string, unknown>[]; total: number; hasMore: boolean }>(request, path, nsec)
  if (status !== 200) throw new Error(`Failed to list records: ${status}`)
  return data
}

export async function getRecordViaApi(
  request: APIRequestContext,
  recordId: string,
  nsec = ADMIN_NSEC,
): Promise<Record<string, unknown>> {
  const { status, data } = await apiGet<Record<string, unknown>>(request, `/records/${recordId}`, nsec)
  if (status !== 200) throw new Error(`Failed to get record: ${status}`)
  return data
}

export async function updateRecordViaApi(
  request: APIRequestContext,
  recordId: string,
  updates: Record<string, unknown>,
  nsec = ADMIN_NSEC,
): Promise<Record<string, unknown>> {
  const { status, data } = await apiPatch<Record<string, unknown>>(request, `/records/${recordId}`, updates, nsec)
  if (status !== 200) throw new Error(`Failed to update record: ${status}`)
  return data
}

export async function linkContactToRecordViaApi(
  request: APIRequestContext,
  recordId: string,
  contactId: string,
  role: string,
  nsec = ADMIN_NSEC,
): Promise<Record<string, unknown>> {
  const { status, data } = await apiPost<Record<string, unknown>>(
    request,
    `/records/${recordId}/contacts`,
    { contactId, role },
    nsec,
  )
  if (status !== 201 && status !== 200) throw new Error(`Failed to link contact to record: ${status}`)
  return data
}

export async function listRecordContactsViaApi(
  request: APIRequestContext,
  recordId: string,
  nsec = ADMIN_NSEC,
): Promise<{ contacts: Record<string, unknown>[] }> {
  const { status, data } = await apiGet<{ contacts: Record<string, unknown>[] }>(request, `/records/${recordId}/contacts`, nsec)
  if (status !== 200) throw new Error(`Failed to list record contacts: ${status}`)
  return data
}

export async function assignRecordViaApi(
  request: APIRequestContext,
  recordId: string,
  pubkeys: string[],
  nsec = ADMIN_NSEC,
): Promise<void> {
  const { status } = await apiPost(request, `/records/${recordId}/assign`, { pubkeys }, nsec)
  if (status !== 200) throw new Error(`Failed to assign record: ${status}`)
}

// ── Case Management: Events (Epic 320) ──────────────────────────

export async function createEventViaApi(
  request: APIRequestContext,
  entityTypeId: string,
  options?: {
    startDate?: string
    endDate?: string
    eventTypeHash?: string
    statusHash?: string
    parentEventId?: string
  },
  nsec = ADMIN_NSEC,
): Promise<Record<string, unknown>> {
  const envelope = dummyEnvelope(nsec)
  const { status, data } = await apiPost<Record<string, unknown>>(
    request,
    '/events',
    {
      entityTypeId,
      startDate: options?.startDate ?? new Date().toISOString(),
      endDate: options?.endDate,
      parentEventId: options?.parentEventId,
      eventTypeHash: options?.eventTypeHash ?? 'event_type_hash',
      statusHash: options?.statusHash ?? 'event_status_hash',
      blindIndexes: {},
      encryptedDetails: 'dGVzdCBldmVudA==',
      detailEnvelopes: [envelope],
      locationPrecision: 'neighborhood',
    },
    nsec,
  )
  if (status !== 201 && status !== 200) throw new Error(`Failed to create event: ${status}`)
  return data
}

export async function linkRecordToEventViaApi(
  request: APIRequestContext,
  eventId: string,
  recordId: string,
  nsec = ADMIN_NSEC,
): Promise<void> {
  const { status } = await apiPost(request, `/events/${eventId}/records`, { recordId }, nsec)
  if (status !== 201 && status !== 200) throw new Error(`Failed to link record to event: ${status}`)
}

export async function linkReportToEventViaApi(
  request: APIRequestContext,
  eventId: string,
  reportId: string,
  nsec = ADMIN_NSEC,
): Promise<void> {
  const { status } = await apiPost(request, `/events/${eventId}/reports`, { reportId }, nsec)
  if (status !== 201 && status !== 200) throw new Error(`Failed to link report to event: ${status}`)
}

export async function listEventRecordsViaApi(
  request: APIRequestContext,
  eventId: string,
  nsec = ADMIN_NSEC,
): Promise<{ links: Record<string, unknown>[] }> {
  const { status, data } = await apiGet<{ links: Record<string, unknown>[] }>(request, `/events/${eventId}/records`, nsec)
  if (status !== 200) throw new Error(`Failed to list event records: ${status}`)
  return data
}

export async function listEventReportsViaApi(
  request: APIRequestContext,
  eventId: string,
  nsec = ADMIN_NSEC,
): Promise<{ links: Record<string, unknown>[] }> {
  const { status, data } = await apiGet<{ links: Record<string, unknown>[] }>(request, `/events/${eventId}/reports`, nsec)
  if (status !== 200) throw new Error(`Failed to list event reports: ${status}`)
  return data
}

// ── Case Management: Interactions (Epic 323) ──────────────────────

export async function createInteractionViaApi(
  request: APIRequestContext,
  caseId: string,
  options: {
    interactionType: string
    sourceId?: string
    encryptedContent?: string
    interactionTypeHash?: string
    previousStatusHash?: string
    newStatusHash?: string
  },
  nsec = ADMIN_NSEC,
): Promise<Record<string, unknown>> {
  const envelope = dummyEnvelope(nsec)
  const body: Record<string, unknown> = {
    interactionType: options.interactionType,
    interactionTypeHash: options.interactionTypeHash ?? `${options.interactionType}_hash`,
  }
  // Schema requires sourceId for note/call/message; encryptedContent for comment
  if (options.interactionType === 'comment' && !options.encryptedContent) {
    body.encryptedContent = 'dGVzdCBjb21tZW50' // base64 "test comment"
    body.contentEnvelopes = [envelope]
  }
  if (['note', 'call', 'message'].includes(options.interactionType) && !options.sourceId) {
    body.sourceId = crypto.randomUUID()
  }
  if (options.sourceId) body.sourceId = options.sourceId
  if (options.encryptedContent) {
    body.encryptedContent = options.encryptedContent
    body.contentEnvelopes = [envelope]
  }
  if (options.previousStatusHash) body.previousStatusHash = options.previousStatusHash
  if (options.newStatusHash) body.newStatusHash = options.newStatusHash

  const { status, data } = await apiPost<Record<string, unknown>>(
    request,
    `/records/${caseId}/interactions`,
    body,
    nsec,
  )
  if (status !== 201 && status !== 200) throw new Error(`Failed to create interaction: ${status}`)
  return data
}

export async function listInteractionsViaApi(
  request: APIRequestContext,
  caseId: string,
  params?: { page?: number; limit?: number; interactionTypeHash?: string },
  nsec = ADMIN_NSEC,
): Promise<{ interactions: Record<string, unknown>[]; total: number }> {
  const qs = new URLSearchParams()
  if (params?.page) qs.set('page', String(params.page))
  if (params?.limit) qs.set('limit', String(params.limit))
  if (params?.interactionTypeHash) qs.set('interactionTypeHash', params.interactionTypeHash)
  const qsStr = qs.toString()
  const path = `/records/${caseId}/interactions${qsStr ? `?${qsStr}` : ''}`
  const { status, data } = await apiGet<{ interactions: Record<string, unknown>[]; total: number }>(request, path, nsec)
  if (status !== 200) throw new Error(`Failed to list interactions: ${status}`)
  return data
}

// ── Case Management: Evidence (Epic 325) ──────────────────────────

export async function uploadEvidenceViaApi(
  request: APIRequestContext,
  caseId: string,
  options?: {
    fileId?: string
    filename?: string
    mimeType?: string
    sizeBytes?: number
    classification?: string
    integrityHash?: string
  },
  nsec = ADMIN_NSEC,
): Promise<Record<string, unknown>> {
  const hash = options?.integrityHash ?? 'a'.repeat(64)
  const { status, data } = await apiPost<Record<string, unknown>>(
    request,
    `/records/${caseId}/evidence`,
    {
      fileId: options?.fileId ?? `file_${Date.now()}`,
      filename: options?.filename ?? `test_evidence_${Date.now()}.jpg`,
      mimeType: options?.mimeType ?? 'image/jpeg',
      sizeBytes: options?.sizeBytes ?? 1024,
      classification: options?.classification ?? 'photo',
      integrityHash: hash,
      source: 'volunteer_upload',
    },
    nsec,
  )
  if (status !== 201 && status !== 200) throw new Error(`Failed to upload evidence: ${status}`)
  return data
}

export async function getEvidenceCustodyViaApi(
  request: APIRequestContext,
  evidenceId: string,
  nsec = ADMIN_NSEC,
): Promise<{ custodyChain: Record<string, unknown>[]; total: number }> {
  const { status, data } = await apiGet<{ custodyChain: Record<string, unknown>[]; total: number }>(
    request,
    `/evidence/${evidenceId}/custody`,
    nsec,
  )
  if (status !== 200) throw new Error(`Failed to get custody chain: ${status}`)
  return data
}

export async function verifyEvidenceIntegrityViaApi(
  request: APIRequestContext,
  evidenceId: string,
  currentHash: string,
  nsec = ADMIN_NSEC,
): Promise<{ valid: boolean; originalHash: string; currentHash: string }> {
  const { status, data } = await apiPost<{ valid: boolean; originalHash: string; currentHash: string }>(
    request,
    `/evidence/${evidenceId}/verify`,
    { currentHash },
    nsec,
  )
  if (status !== 200) throw new Error(`Failed to verify evidence integrity: ${status}`)
  return data
}

// ── Telephony-CRM: Caller Identification (Epic 326) ──────────────────

export interface CallerIdentificationResult {
  contact: Record<string, unknown> | null
  activeCaseCount: number
  recentCases: Array<{ id: string; caseNumber?: string; status: string }>
}

export async function identifyCallerViaApi(
  request: APIRequestContext,
  identifierHash: string,
  nsec = ADMIN_NSEC,
): Promise<CallerIdentificationResult> {
  const { status, data } = await apiGet<CallerIdentificationResult>(
    request,
    `/calls/identify/${identifierHash}`,
    nsec,
  )
  if (status !== 200) throw new Error(`Failed to identify caller: ${status}`)
  return data
}

export async function listRecordsByContactViaApi(
  request: APIRequestContext,
  contactId: string,
  nsec = ADMIN_NSEC,
): Promise<{ records: Record<string, unknown>[]; total: number }> {
  const { status, data } = await apiGet<{ records: Record<string, unknown>[]; total: number }>(
    request,
    `/records/by-contact/${contactId}`,
    nsec,
  )
  if (status !== 200) throw new Error(`Failed to list records by contact: ${status}`)
  return data
}

// ── Case Management: Cross-Hub Sharing (Epic 328) ──────────────────

export async function enableCrossHubSharingViaApi(
  request: APIRequestContext,
  enabled: boolean,
  nsec = ADMIN_NSEC,
): Promise<{ enabled: boolean }> {
  const { status, data } = await apiPut<{ enabled: boolean }>(
    request,
    '/settings/cms/cross-hub',
    { enabled },
    nsec,
  )
  if (status !== 200) throw new Error(`Failed to toggle cross-hub sharing: ${status}`)
  return data
}

export async function getCrossHubSharingViaApi(
  request: APIRequestContext,
  nsec = ADMIN_NSEC,
): Promise<{ enabled: boolean }> {
  const { data } = await apiGet<{ enabled: boolean }>(
    request,
    '/settings/cms/cross-hub',
    nsec,
  )
  return data
}

// ── Case Management: Notifications (Epic 327) ──────────────────

export interface NotifyContactsResult {
  recordId: string
  notified: number
  skipped: number
  results: Array<{
    identifier: string
    channel: string
    success: boolean
    error?: string
  }>
}

/**
 * Send notifications to support contacts for a record.
 * The client pre-renders messages (E2EE constraint).
 */
export async function notifyContactsViaApi(
  request: APIRequestContext,
  recordId: string,
  recipients: Array<{
    identifier: string
    channel: 'sms' | 'signal' | 'whatsapp'
    message: string
  }>,
  statusLabel = 'released',
  nsec = ADMIN_NSEC,
): Promise<{ status: number; data: NotifyContactsResult | null }> {
  return apiPost<NotifyContactsResult>(
    request,
    `/records/${recordId}/notify-contacts`,
    {
      statusLabel,
      recipients,
    },
    nsec,
  )
}

/**
 * Attempt to send notifications with raw body (for validation testing).
 * Does not throw on error -- returns status + data for assertion.
 */
export async function notifyContactsRawViaApi(
  request: APIRequestContext,
  recordId: string,
  body: Record<string, unknown>,
  nsec = ADMIN_NSEC,
): Promise<{ status: number; data: unknown }> {
  return apiPost(
    request,
    `/records/${recordId}/notify-contacts`,
    body,
    nsec,
  )
}

// ── Case Management: Relationships & Affinity Groups (Epic 322) ────

export interface RelationshipResult {
  id: string
  contactIdA: string
  contactIdB: string
  relationshipType: string
  direction: string
  createdAt: string
  createdBy: string
}

export interface RelationshipListResult {
  relationships: RelationshipResult[]
}

export interface GroupResult {
  id: string
  encryptedDetails: string
  memberCount: number
  createdAt: string
  updatedAt: string
  createdBy: string
}

export interface GroupMemberResult {
  contactId: string
  role?: string
  isPrimary: boolean
}

export async function createRelationshipViaApi(
  request: APIRequestContext,
  contactIdA: string,
  contactIdB: string,
  relationshipType: string,
  direction: 'a_to_b' | 'b_to_a' | 'bidirectional' = 'bidirectional',
  nsec = ADMIN_NSEC,
): Promise<RelationshipResult> {
  const { status, data } = await apiPost<RelationshipResult>(
    request,
    `/directory/${contactIdA}/relationships`,
    { contactIdB, relationshipType, direction },
    nsec,
  )
  if (status !== 201 && status !== 200) throw new Error(`Failed to create relationship: ${status}`)
  return data
}

export async function listRelationshipsViaApi(
  request: APIRequestContext,
  contactId: string,
  nsec = ADMIN_NSEC,
): Promise<RelationshipListResult> {
  const { status, data } = await apiGet<RelationshipListResult>(
    request,
    `/directory/${contactId}/relationships`,
    nsec,
  )
  if (status !== 200) throw new Error(`Failed to list relationships: ${status}`)
  return data
}

export async function deleteRelationshipViaApi(
  request: APIRequestContext,
  contactId: string,
  relId: string,
  nsec = ADMIN_NSEC,
): Promise<void> {
  const { status } = await apiDelete(
    request,
    `/directory/${contactId}/relationships/${relId}`,
    nsec,
  )
  if (status !== 200) throw new Error(`Failed to delete relationship: ${status}`)
}

export async function createAffinityGroupViaApi(
  request: APIRequestContext,
  name: string,
  initialMembers: Array<{ contactId: string; role?: string; isPrimary?: boolean }> = [],
  nsec = ADMIN_NSEC,
): Promise<GroupResult> {
  const envelope = dummyEnvelope(nsec)
  // The group body requires at least one member. If none provided, the caller
  // must supply initialMembers. The encryptedDetails is a base64 blob that
  // the client would normally encrypt; for tests we embed the plaintext name.
  const members = initialMembers.map(m => ({
    contactId: m.contactId,
    role: m.role,
    isPrimary: m.isPrimary ?? false,
  }))
  const { status, data } = await apiPost<GroupResult>(
    request,
    '/directory/groups',
    {
      encryptedDetails: btoa(JSON.stringify({ name })),
      detailEnvelopes: [envelope],
      members,
    },
    nsec,
  )
  if (status !== 201 && status !== 200) throw new Error(`Failed to create affinity group: ${status}`)
  return data
}

export async function addGroupMemberViaApi(
  request: APIRequestContext,
  groupId: string,
  contactId: string,
  role?: string,
  nsec = ADMIN_NSEC,
): Promise<{ added: boolean; memberCount: number }> {
  const { status, data } = await apiPost<{ added: boolean; memberCount: number }>(
    request,
    `/directory/groups/${groupId}/members`,
    { contactId, role, isPrimary: false },
    nsec,
  )
  if (status !== 201 && status !== 200) throw new Error(`Failed to add group member: ${status}`)
  return data
}

export async function removeGroupMemberViaApi(
  request: APIRequestContext,
  groupId: string,
  contactId: string,
  nsec = ADMIN_NSEC,
): Promise<void> {
  const { status } = await apiDelete(
    request,
    `/directory/groups/${groupId}/members/${contactId}`,
    nsec,
  )
  if (status !== 200) throw new Error(`Failed to remove group member: ${status}`)
}

export async function listGroupMembersViaApi(
  request: APIRequestContext,
  groupId: string,
  nsec = ADMIN_NSEC,
): Promise<{ members: GroupMemberResult[] }> {
  const { status, data } = await apiGet<{ members: GroupMemberResult[] }>(
    request,
    `/directory/groups/${groupId}/members`,
    nsec,
  )
  if (status !== 200) throw new Error(`Failed to list group members: ${status}`)
  return data
}

export async function getAffinityGroupViaApi(
  request: APIRequestContext,
  groupId: string,
  nsec = ADMIN_NSEC,
): Promise<GroupResult & { members: GroupMemberResult[] }> {
  const { status, data } = await apiGet<GroupResult & { members: GroupMemberResult[] }>(
    request,
    `/directory/groups/${groupId}`,
    nsec,
  )
  if (status !== 200) throw new Error(`Failed to get affinity group: ${status}`)
  return data
}
