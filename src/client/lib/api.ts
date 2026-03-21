import { z } from 'zod'
import * as keyManager from './key-manager'
import { createAuthToken } from './platform'
import { APP_API_VERSION, emitUpdateRequired } from './version'
import { offlineQueue, isQueueableMethod, isNetworkError as isOfflineNetworkError } from './offline-queue'

// --- Protocol schema imports (Epic 364) ---
import { createShiftBodySchema } from '@protocol/schemas/shifts'
import { recordSchema, recordContactSchema } from '@protocol/schemas/records'
import { caseInteractionSchema } from '@protocol/schemas/interactions'
import { reportTypeDefinitionSchema } from '@protocol/schemas/report-types'
import { createEntityTypeBodySchema, templateSummarySchema } from '@protocol/schemas/entity-schema'
import { contactRelationshipResponseSchema, contactGroupResponseSchema } from '@protocol/schemas/contact-relationships'

// Protocol types used in function signatures within this file.
// Re-exported to consumers via `export type { ... }` statements inline below.
import type {
  User,
  Shift,
  ShiftStatus,
  BanEntry,
  EncryptedNote,
  Conversation,
  ConversationMessage,
  InviteCode,
  CallRecord,
  ActiveCall,
  UserPresence,
  AuditLogEntry,
  AssignmentSuggestion,
  EvidenceMetadata,
  EvidenceClassification,
  CustodyEntry,
  CustodyAction,
  Hub,
  ContactTimelineSummary,
  ServiceStatus,
  SystemHealth,
  RoleDefinition,
  IvrAudioRecording,
  CreateRecordBody,
  UpdateRecordBody,
  DirectoryContactType,
  IdentifierType,
  ContactIdentifier,
  ContactCaseLink,
} from '@protocol/schemas'

const API_BASE = '/api'

// Auth expiry callback — set by AuthProvider to handle 401s reactively
let onAuthExpired: (() => void) | null = null
export function setOnAuthExpired(cb: (() => void) | null) { onAuthExpired = cb }

async function getAuthHeaders(method: string, apiPath: string): Promise<Record<string, string>> {
  // Prefer session token if available (WebAuthn-based sessions)
  const sessionToken = sessionStorage.getItem('llamenos-session-token')
  if (sessionToken) {
    return { 'Authorization': `Session ${sessionToken}` }
  }
  // Use CryptoState for Schnorr auth if unlocked
  if (keyManager.isUnlocked()) {
    try {
      const token = await createAuthToken(Date.now(), method, `${API_BASE}${apiPath}`)
      return { 'Authorization': `Bearer ${token}` }
    } catch {
      return {}
    }
  }
  return {}
}

/**
 * Get auth headers for offline queue replay.
 * Exported so the replay mechanism can authenticate requests.
 */
export function getAuthHeadersForReplay(method: string, path: string): Promise<Record<string, string>> {
  return getAuthHeaders(method, path)
}

// Activity tracking callback — set by AuthProvider
let onApiActivity: (() => void) | null = null
export function setOnApiActivity(cb: (() => void) | null) { onApiActivity = cb }

/**
 * Paths that should NEVER be queued for offline replay.
 * Auth endpoints, reads, and real-time operations are excluded.
 */
const NON_QUEUEABLE_PATHS = [
  '/auth/',
  '/config',
  '/setup/',
  '/calls/active',
  '/calls/today-count',
  '/calls/presence',
  '/calls/', // Call answer/hangup must be real-time — stale actions are harmful
  '/telephony/',
  '/uploads/', // Chunked uploads have their own retry logic
  '/files/',
]

function isQueueablePath(path: string): boolean {
  return !NON_QUEUEABLE_PATHS.some(prefix => path.startsWith(prefix))
}

const REQUEST_TIMEOUT_MS = 15_000
const MAX_RETRIES = 3
const BASE_RETRY_DELAY = 500

function isRetryable(status: number): boolean {
  return status === 502 || status === 503 || status === 504 || status === 429
}

/** Check response headers for version mismatch and emit update-required if needed. */
function checkVersionHeaders(res: Response): void {
  const minVersion = res.headers.get('X-Min-Version')
  const currentVersion = res.headers.get('X-Current-Version')
  if (minVersion && parseInt(minVersion, 10) > APP_API_VERSION) {
    emitUpdateRequired({
      minVersion: parseInt(minVersion, 10),
      currentVersion: currentVersion ? parseInt(currentVersion, 10) : parseInt(minVersion, 10),
    })
  }
}

async function request<T>(path: string, options: RequestInit & { retries?: number } = {}): Promise<T> {
  const method = ((options.method as string) || 'GET').toUpperCase()
  const isIdempotent = method === 'GET' || method === 'HEAD'
  const maxRetries = options.retries ?? (isIdempotent ? MAX_RETRIES : 0)

  // Strip query params from path for auth token signing (server uses url.pathname)
  const pathOnly = path.split('?')[0]

  let lastError: Error | null = null
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = BASE_RETRY_DELAY * Math.pow(2, attempt - 1) + Math.random() * 200
      await new Promise(r => setTimeout(r, delay))
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    try {
      const headers = {
        'Content-Type': 'application/json',
        'X-API-Version': String(APP_API_VERSION),
        ...await getAuthHeaders(method, pathOnly),
        ...options.headers,
      }
      const res = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers,
        signal: controller.signal,
      })

      // Check version headers on every response (even errors)
      checkVersionHeaders(res)

      if (!res.ok) {
        if (res.status === 426) {
          // Server requires a newer client — update-required already emitted via checkVersionHeaders
          const body = await res.text()
          throw new ApiError(res.status, body)
        }
        if (res.status === 401 && !path.startsWith('/auth/')) {
          onAuthExpired?.()
        }
        const body = await res.text()
        const err = new ApiError(res.status, body)
        if (isRetryable(res.status) && attempt < maxRetries) {
          lastError = err
          continue
        }
        throw err
      }

      onApiActivity?.()

      // On successful request, attempt to replay any queued offline operations
      if (offlineQueue.pendingCount > 0 && navigator.onLine) {
        // Fire-and-forget replay — don't block the current request
        offlineQueue.replay(getAuthHeadersForReplay).catch(() => {})
      }

      return res.json()
    } catch (err) {
      if (err instanceof ApiError) throw err
      if (err instanceof OfflineQueuedError) throw err
      // Network error or timeout — retry if idempotent
      lastError = err instanceof Error ? err : new Error(String(err))
      if (attempt < maxRetries) continue
      // If this is a network error and the operation is queueable, add to offline queue
      if (isOfflineNetworkError(lastError) && isQueueableMethod(method) && isQueueablePath(path)) {
        const body = options.body ? (typeof options.body === 'string' ? options.body : null) : null
        offlineQueue.enqueue(path, method, body)
        throw new OfflineQueuedError(path, method)
      }
      throw new NetworkError(lastError.message, lastError)
    } finally {
      clearTimeout(timeout)
    }
  }

  throw lastError ?? new Error('Request failed')
}

export class ApiError extends Error {
  constructor(public status: number, public body: string) {
    super(`API error ${status}: ${body}`)
    this.name = 'ApiError'
  }
}

export class NetworkError extends Error {
  constructor(message: string, public cause?: Error) {
    super(message)
    this.name = 'NetworkError'
  }
}

/** Returns true if the error is a network/connectivity issue (not a server-side error). */
export function isNetworkError(err: unknown): err is NetworkError {
  return err instanceof NetworkError
}

/**
 * Thrown when a write operation is queued for offline replay instead of failing.
 * Callers can check for this to show "saved for later" UI instead of an error.
 */
export class OfflineQueuedError extends Error {
  constructor(public path: string, public method: string) {
    super(`Operation queued for offline replay: ${method} ${path}`)
    this.name = 'OfflineQueuedError'
  }
}

// --- Hub context for hub-scoped API calls ---

let activeHubId: string | null = null
export function setActiveHub(id: string | null) { activeHubId = id }
export function getActiveHub(): string | null { return activeHubId }

/** Prefix a path with the active hub scope. No-op when no hub is active. */
function hp(path: string): string {
  return activeHubId ? `/hubs/${activeHubId}${path}` : path
}

// --- Public config (no auth) ---

export async function getConfig() {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(`${API_BASE}/config`, {
      headers: { 'X-API-Version': String(APP_API_VERSION), 'Cache-Control': 'no-cache' },
      signal: controller.signal,
    })
    if (!res.ok) return { hotlineName: 'Hotline', hotlineNumber: '', channels: undefined, setupCompleted: undefined }
    checkVersionHeaders(res)
    return res.json() as Promise<{
      hotlineName: string
      hotlineNumber: string
      channels?: import('@shared/types').EnabledChannels
      setupCompleted?: boolean
      adminPubkey?: string
      demoMode?: boolean
      demoResetSchedule?: string | null
      needsBootstrap?: boolean
      hubs?: import('@shared/types').Hub[]
      defaultHubId?: string
      serverNostrPubkey?: string
      nostrRelayUrl?: string
      apiVersion?: number
      minApiVersion?: number
      sentryDsn?: string
    }>
  } catch {
    return { hotlineName: 'Hotline', hotlineNumber: '', channels: undefined, setupCompleted: undefined }
  } finally {
    clearTimeout(timeout)
  }
}

// --- Auth ---

export async function login(pubkey: string, timestamp: number, token: string) {
  return request<{ ok: true; roles: string[] }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ pubkey, timestamp, token }),
  })
}

export async function bootstrapAdmin(pubkey: string, timestamp: number, token: string) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(`${API_BASE}/auth/bootstrap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pubkey, timestamp, token }),
      signal: controller.signal,
    })
    if (!res.ok) {
      const body = await res.text()
      throw new ApiError(res.status, body)
    }
    return res.json() as Promise<{ ok: true; roles: string[] }>
  } catch (err) {
    if (err instanceof ApiError) throw err
    const e = err instanceof Error ? err : new Error(String(err))
    throw new NetworkError(e.message, e)
  } finally {
    clearTimeout(timeout)
  }
}

export async function logout() {
  return request<{ ok: true }>('/auth/me/logout', { method: 'POST' }).catch(() => {})
}

export async function getMe() {
  return request<{ pubkey: string; roles: string[]; permissions: string[]; primaryRole: { id: string; name: string; slug: string } | null; name: string; transcriptionEnabled: boolean; spokenLanguages: string[]; uiLanguage: string; profileCompleted: boolean; onBreak: boolean; callPreference: 'phone' | 'browser' | 'both'; webauthnRequired: boolean; webauthnRegistered: boolean; adminDecryptionPubkey: string; serverEventKeyHex?: string }>('/auth/me')
}

// --- Users (admin only) ---

export async function listUsers() {
  return request<{ users: User[] }>('/users')
}

export async function createUser(data: { name: string; phone: string; roleIds: string[]; pubkey: string }) {
  return request<User>('/users', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateUser(pubkey: string, data: Partial<{
  name: string
  phone: string
  roles: string[]
  active: boolean
  supportedMessagingChannels: string[]
  messagingEnabled: boolean
}>) {
  return request<User>(`/users/${pubkey}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export async function deleteUser(pubkey: string) {
  return request<{ ok: true }>(`/users/${pubkey}`, { method: 'DELETE' })
}


// --- Shift Status (all users) ---

export type { ShiftStatus }

export async function getMyShiftStatus() {
  return request<ShiftStatus>(hp('/shifts/my-status'))
}

// --- Shifts (admin only) ---

export async function listShifts() {
  return request<{ shifts: Shift[] }>(hp('/shifts'))
}

export async function createShift(data: z.infer<typeof createShiftBodySchema>) {
  return request<Shift>(hp('/shifts'), {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateShift(id: string, data: Partial<Shift>) {
  return request<Shift>(hp(`/shifts/${id}`), {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export async function deleteShift(id: string) {
  return request<{ ok: true }>(hp(`/shifts/${id}`), { method: 'DELETE' })
}

export async function getFallbackGroup() {
  return request<{ volunteers: string[] }>(hp('/shifts/fallback'))
}

export async function setFallbackGroup(volunteers: string[]) {
  return request<{ ok: true }>(hp('/shifts/fallback'), {
    method: 'PUT',
    body: JSON.stringify({ volunteers }),
  })
}

// --- Ban List ---

export async function listBans() {
  return request<{ bans: BanEntry[] }>(hp('/bans'))
}

export async function addBan(data: { phone: string; reason: string }) {
  return request<{ ban: BanEntry }>(hp('/bans'), {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function banAndHangup(callId: string, reason?: string) {
  return request<{ banned: boolean; hungUp: boolean }>(
    hp(`/calls/${callId}/ban`),
    { method: 'POST', body: JSON.stringify({ reason }) },
  )
}

export async function removeBan(phone: string) {
  return request<{ ok: true }>(hp(`/bans/${encodeURIComponent(phone)}`), { method: 'DELETE' })
}

export async function bulkAddBans(data: { phones: string[]; reason: string }) {
  return request<{ count: number }>(hp('/bans/bulk'), {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

// --- Notes ---

export async function listNotes(params?: { callId?: string; conversationId?: string; contactHash?: string; page?: number; limit?: number }) {
  const qs = new URLSearchParams()
  if (params?.callId) qs.set('callId', params.callId)
  if (params?.conversationId) qs.set('conversationId', params.conversationId)
  if (params?.contactHash) qs.set('contactHash', params.contactHash)
  if (params?.page) qs.set('page', String(params.page))
  if (params?.limit) qs.set('limit', String(params.limit))
  return request<{ notes: EncryptedNote[]; total: number }>(hp(`/notes?${qs}`))
}

export async function createNote(data: {
  callId?: string
  conversationId?: string
  contactHash?: string
  encryptedContent: string
  authorEnvelope?: import('@shared/types').KeyEnvelope
  adminEnvelopes?: import('@shared/types').RecipientEnvelope[]
}) {
  return request<{ note: EncryptedNote }>(hp('/notes'), {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateNote(id: string, data: {
  encryptedContent: string
  authorEnvelope?: import('@shared/types').KeyEnvelope
  adminEnvelopes?: import('@shared/types').RecipientEnvelope[]
}) {
  return request<{ note: EncryptedNote }>(hp(`/notes/${id}`), {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

// Note replies (Epic 123)
export async function listNoteReplies(noteId: string) {
  return request<{ replies: ConversationMessage[] }>(hp(`/notes/${noteId}/replies`))
}

export async function createNoteReply(noteId: string, data: {
  encryptedContent: string
  readerEnvelopes: import('@shared/types').RecipientEnvelope[]
}) {
  return request<{ reply: ConversationMessage }>(hp(`/notes/${noteId}/replies`), {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

// Contacts (Epic 123)
export type { ContactTimelineSummary }
/** @deprecated Use ContactTimelineSummary instead */
export type ContactSummary = ContactTimelineSummary

// Composed type — no single schema covers this
export type ContactTimeline = {
  contact: ContactTimelineSummary
  calls: CallRecord[]
  conversations: Conversation[]
  notes: EncryptedNote[]
}

export async function listContacts(params?: { page?: number; limit?: number }) {
  const qs = new URLSearchParams()
  if (params?.page) qs.set('page', String(params.page))
  if (params?.limit) qs.set('limit', String(params.limit))
  return request<{ contacts: ContactSummary[]; total: number }>(hp(`/contacts?${qs}`))
}

export async function getContactTimeline(hash: string) {
  return request<ContactTimeline>(hp(`/contacts/${hash}`))
}

// --- Calls ---

export async function listActiveCalls() {
  return request<{ calls: ActiveCall[] }>(hp('/calls/active'))
}

export async function getCallHistory(params?: { page?: number; limit?: number; search?: string; dateFrom?: string; dateTo?: string }) {
  const qs = new URLSearchParams()
  if (params?.page) qs.set('page', String(params.page))
  if (params?.limit) qs.set('limit', String(params.limit))
  if (params?.search) qs.set('search', params.search)
  if (params?.dateFrom) qs.set('dateFrom', params.dateFrom)
  if (params?.dateTo) qs.set('dateTo', params.dateTo)
  return request<{ calls: CallRecord[]; total: number }>(hp(`/calls/history?${qs}`))
}

// --- Call Actions (REST) ---

export async function answerCall(callId: string) {
  return request<{ call: ActiveCall }>(hp(`/calls/${callId}/answer`), { method: 'POST' })
}

export async function hangupCall(callId: string) {
  return request<{ call: ActiveCall }>(hp(`/calls/${callId}/hangup`), { method: 'POST' })
}

export async function reportCallSpam(callId: string) {
  return request<{ callId: string; callerNumber: string | null; reportedBy: string }>(hp(`/calls/${callId}/spam`), { method: 'POST' })
}

// --- Calls Today ---

export async function getCallsTodayCount() {
  return request<{ count: number }>(hp('/calls/today-count'))
}

// --- Call Recording ---

export async function getCallRecording(callId: string): Promise<ArrayBuffer> {
  const pathOnly = hp(`/calls/${callId}/recording`).split('?')[0]
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await new Promise(r => setTimeout(r, BASE_RETRY_DELAY * Math.pow(2, attempt - 1)))
    }
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30_000)
    try {
      const headers = await getAuthHeaders('GET', pathOnly)
      const res = await fetch(`${API_BASE}${hp(`/calls/${callId}/recording`)}`, { headers, signal: controller.signal })
      if (!res.ok) {
        if (res.status === 401) onAuthExpired?.()
        const err = new ApiError(res.status, await res.text())
        if (isRetryable(res.status) && attempt < MAX_RETRIES) continue
        throw err
      }
      onApiActivity?.()
      return res.arrayBuffer()
    } catch (err) {
      if (err instanceof ApiError) throw err
      if (attempt < MAX_RETRIES) continue
      const e = err instanceof Error ? err : new Error(String(err))
      throw new NetworkError(e.message, e)
    } finally {
      clearTimeout(timeout)
    }
  }
  throw new Error('Recording download failed')
}

// --- User Presence (admin only) ---

export async function getUserPresence() {
  return request<{ users: UserPresence[] }>(hp('/calls/presence'))
}

// --- Audit Log (admin only) ---

export async function listAuditLog(params?: {
  page?: number
  limit?: number
  actorPubkey?: string
  eventType?: string
  dateFrom?: string
  dateTo?: string
  search?: string
}) {
  const qs = new URLSearchParams()
  if (params?.page) qs.set('page', String(params.page))
  if (params?.limit) qs.set('limit', String(params.limit))
  if (params?.actorPubkey) qs.set('actorPubkey', params.actorPubkey)
  if (params?.eventType) qs.set('eventType', params.eventType)
  if (params?.dateFrom) qs.set('dateFrom', params.dateFrom)
  if (params?.dateTo) qs.set('dateTo', params.dateTo)
  if (params?.search) qs.set('search', params.search)
  return request<{ entries: AuditLogEntry[]; total: number }>(hp(`/audit?${qs}`))
}

// --- Spam Mitigation ---

export async function getSpamSettings() {
  return request<SpamSettings>('/settings/spam')
}

export async function updateSpamSettings(data: Partial<SpamSettings>) {
  return request<SpamSettings>('/settings/spam', {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

// --- Call Settings ---

// CallSettings response has all fields required (schema uses optional for input)
export type CallSettings = Required<import('@protocol/schemas').CallSettings>

export async function getCallSettings() {
  return request<CallSettings>('/settings/call')
}

export async function updateCallSettings(data: Partial<CallSettings>) {
  return request<CallSettings>('/settings/call', {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

// --- IVR Language Settings ---

export async function getIvrLanguages() {
  return request<{ enabledLanguages: string[] }>('/settings/ivr-languages')
}

export async function updateIvrLanguages(data: { enabledLanguages: string[] }) {
  return request<{ enabledLanguages: string[] }>('/settings/ivr-languages', {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

// --- Transcription Settings ---

export async function getTranscriptionSettings() {
  return request<{ globalEnabled: boolean; allowUserOptOut: boolean }>('/settings/transcription')
}

export async function updateTranscriptionSettings(data: { globalEnabled?: boolean; allowUserOptOut?: boolean }) {
  return request<{ globalEnabled: boolean; allowUserOptOut: boolean }>('/settings/transcription', {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export async function updateMyTranscriptionPreference(enabled: boolean) {
  return request<{ ok: true }>('/auth/me/transcription', {
    method: 'PATCH',
    body: JSON.stringify({ enabled }),
  })
}

export async function updateMyProfile(data: { name?: string; phone?: string; spokenLanguages?: string[]; uiLanguage?: string; profileCompleted?: boolean; callPreference?: 'phone' | 'browser' | 'both' }) {
  return request<{ ok: true }>('/auth/me/profile', {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export async function updateMyAvailability(onBreak: boolean) {
  return request<{ ok: true }>('/auth/me/availability', {
    method: 'PATCH',
    body: JSON.stringify({ onBreak }),
  })
}

// --- Invites ---

export async function listInvites() {
  return request<{ invites: InviteCode[] }>('/invites')
}

export async function createInvite(data: { name: string; phone: string; roleIds: string[] }) {
  return request<{ invite: InviteCode }>('/invites', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function revokeInvite(code: string) {
  return request<{ ok: true }>(`/invites/${code}`, { method: 'DELETE' })
}

export async function validateInvite(code: string) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(`${API_BASE}/invites/validate/${code}`, { signal: controller.signal })
    return res.json() as Promise<{ valid: boolean; name?: string; roleIds?: string[]; error?: string }>
  } finally {
    clearTimeout(timeout)
  }
}

export async function redeemInvite(code: string, pubkey: string, secretKeyHex?: string) {
  // Include Schnorr signature to prove key possession
  let authFields = {}
  if (secretKeyHex) {
    const { createAuthTokenStateless } = await import('./platform')
    const timestamp = Date.now()
    const tokenJson = await createAuthTokenStateless(secretKeyHex, timestamp, 'POST', '/api/invites/redeem')
    const parsed = JSON.parse(tokenJson)
    authFields = { timestamp: parsed.timestamp, token: parsed.token }
  }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(`${API_BASE}/invites/redeem`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, pubkey, ...authFields }),
      signal: controller.signal,
    })
    if (!res.ok) {
      const body = await res.text()
      throw new ApiError(res.status, body)
    }
    return res.json() as Promise<{ user: User }>
  } catch (err) {
    if (err instanceof ApiError) throw err
    const e = err instanceof Error ? err : new Error(String(err))
    throw new NetworkError(e.message, e)
  } finally {
    clearTimeout(timeout)
  }
}

// --- IVR Audio ---

export type { IvrAudioRecording }

export async function listIvrAudio() {
  return request<{ recordings: IvrAudioRecording[] }>('/settings/ivr-audio')
}

export async function uploadIvrAudio(promptType: string, language: string, audioBlob: Blob) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30_000)
  try {
    const res = await fetch(`${API_BASE}/settings/ivr-audio/${promptType}/${language}`, {
      method: 'PUT',
      headers: {
        ...await getAuthHeaders('PUT', `/settings/ivr-audio/${promptType}/${language}`),
        'Content-Type': audioBlob.type || 'audio/webm',
      },
      body: audioBlob,
      signal: controller.signal,
    })
    if (!res.ok) {
      if (res.status === 401) onAuthExpired?.()
      throw new ApiError(res.status, await res.text())
    }
    onApiActivity?.()
    return res.json() as Promise<{ ok: true }>
  } catch (err) {
    if (err instanceof ApiError) throw err
    const e = err instanceof Error ? err : new Error(String(err))
    throw new NetworkError(e.message, e)
  } finally {
    clearTimeout(timeout)
  }
}

export async function deleteIvrAudio(promptType: string, language: string) {
  return request<{ ok: true }>(`/settings/ivr-audio/${promptType}/${language}`, { method: 'DELETE' })
}

export function getIvrAudioUrl(promptType: string, language: string) {
  return `${API_BASE}/ivr-audio/${promptType}/${language}`
}

// --- Custom Fields ---

export type { CustomFieldDefinition } from '@shared/types'
import type { CustomFieldDefinition } from '@shared/types'

export async function getCustomFields() {
  return request<{ fields: CustomFieldDefinition[] }>('/settings/custom-fields')
}

export async function updateCustomFields(fields: CustomFieldDefinition[]) {
  return request<{ fields: CustomFieldDefinition[] }>('/settings/custom-fields', {
    method: 'PUT',
    body: JSON.stringify({ fields }),
  })
}

// --- Telephony Provider Settings ---

export type { TelephonyProviderConfig, TelephonyProviderType } from '@shared/types'
import type { TelephonyProviderConfig } from '@shared/types'

export async function getTelephonyProvider() {
  return request<TelephonyProviderConfig | null>('/settings/telephony-provider')
}

export async function updateTelephonyProvider(config: TelephonyProviderConfig) {
  return request<TelephonyProviderConfig>('/settings/telephony-provider', {
    method: 'PATCH',
    body: JSON.stringify(config),
  })
}

export async function testTelephonyProvider(config: Partial<TelephonyProviderConfig> & { type: string }) {
  return request<{ ok: boolean; error?: string }>('/settings/telephony-provider/test', {
    method: 'POST',
    body: JSON.stringify(config),
  })
}

// --- WebRTC Token ---

export async function getWebRtcToken() {
  return request<{ token: string; provider: string; identity: string }>('/telephony/webrtc-token')
}

export async function getWebRtcStatus() {
  return request<{ available: boolean; provider: string | null }>('/telephony/webrtc-status')
}

// --- WebAuthn Settings ---

// Response has all fields required (schema uses optional for input/looseObject)
export type WebAuthnSettings = Required<import('@protocol/schemas').WebAuthnSettings>

export async function getWebAuthnSettings() {
  return request<WebAuthnSettings>('/settings/webauthn')
}

export async function updateWebAuthnSettings(data: Partial<WebAuthnSettings>) {
  return request<WebAuthnSettings>('/settings/webauthn', {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

// --- Roles (PBAC) ---

export type { RoleDefinition }

export async function listRoles() {
  return request<{ roles: RoleDefinition[] }>('/settings/roles')
}

export async function createRole(data: { name: string; slug: string; permissions: string[]; description: string }) {
  return request<{ role: RoleDefinition }>('/settings/roles', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateRole(id: string, data: Partial<{ name: string; permissions: string[]; description: string }>) {
  return request<{ role: RoleDefinition }>(`/settings/roles/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export async function deleteRole(id: string) {
  return request<{ ok: true }>(`/settings/roles/${id}`, { method: 'DELETE' })
}

export async function getPermissionsCatalog() {
  return request<{
    permissions: Record<string, string>
    byDomain: Record<string, { key: string; label: string }[]>
  }>('/settings/permissions')
}

// --- Migration Status (Epic 286) ---

export async function getMigrationStatus() {
  return request<{
    namespaces: Array<{
      namespace: string
      currentVersion: number
      latestVersion: number
      pending: number
      history: Array<{
        version: number
        name: string
        status: 'applied' | 'pending'
        appliedAt?: string
      }>
      lastRun: string | null
      error?: string
    }>
  }>('/settings/migrations')
}

// --- Types (re-exported from @protocol/schemas) ---

/** @deprecated Use roles array + permissions */
export type UserRole = 'volunteer' | 'admin' | 'reporter'

export type { User, Shift, BanEntry, EncryptedNote, ActiveCall, AuditLogEntry, UserPresence, InviteCode }

export type { CallRecord }

// SpamSettings response has all fields required (schema uses optional for input)
export type SpamSettings = Required<import('@protocol/schemas').SpamSettings>

// --- Conversations ---

export type { Conversation, ConversationMessage }

export type MessageDeliveryStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed'

/** @deprecated Import RecipientEnvelope from @shared/types instead. */
export type { RecipientEnvelope as MessageKeyEnvelope } from '@shared/types'

export async function listConversations(params?: {
  status?: string
  channel?: string
  page?: number
  limit?: number
}) {
  const qs = new URLSearchParams()
  if (params?.status) qs.set('status', params.status)
  if (params?.channel) qs.set('channel', params.channel)
  if (params?.page) qs.set('page', String(params.page))
  if (params?.limit) qs.set('limit', String(params.limit))
  return request<{
    conversations: Conversation[]
    total?: number
    assignedCount?: number
    waitingCount?: number
  }>(hp(`/conversations?${qs}`))
}

export async function getConversation(id: string) {
  return request<Conversation>(hp(`/conversations/${id}`))
}

export async function getConversationMessages(id: string, params?: { page?: number; limit?: number }) {
  const qs = new URLSearchParams()
  if (params?.page) qs.set('page', String(params.page))
  if (params?.limit) qs.set('limit', String(params.limit))
  return request<{ messages: ConversationMessage[]; total: number }>(hp(`/conversations/${id}/messages?${qs}`))
}

export async function sendConversationMessage(id: string, data: {
  encryptedContent: string
  readerEnvelopes: import('@shared/types').RecipientEnvelope[]
  plaintextForSending?: string
}) {
  return request<ConversationMessage>(hp(`/conversations/${id}/messages`), {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function claimConversation(id: string) {
  return request<Conversation>(hp(`/conversations/${id}/claim`), { method: 'POST' })
}

export async function updateConversation(id: string, data: { status?: string; assignedTo?: string }) {
  return request<Conversation>(hp(`/conversations/${id}`), {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export async function getConversationStats() {
  return request<{ waiting: number; active: number; closed: number; today: number; total: number }>(hp('/conversations/stats'))
}

export async function getUserLoads() {
  return request<{ loads: Record<string, number> }>(hp('/conversations/load'))
}

// --- Messaging Config ---

export type { MessagingConfig, EnabledChannels } from '@shared/types'
import type { MessagingConfig } from '@shared/types'

export async function getMessagingConfig() {
  return request<MessagingConfig>('/settings/messaging')
}

export async function updateMessagingConfig(data: Partial<MessagingConfig>) {
  return request<MessagingConfig>('/settings/messaging', {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export async function testMessagingChannel(channel: string) {
  return request<{ connected: boolean }>('/settings/messaging/test', {
    method: 'POST',
    body: JSON.stringify({ channel }),
  })
}

// --- Setup State ---

export type { SetupState } from '@shared/types'
import type { SetupState } from '@shared/types'

export async function getSetupState() {
  return request<SetupState>('/setup/state')
}

export async function updateSetupState(data: Partial<SetupState>) {
  return request<SetupState>('/setup/state', {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export async function completeSetup(demoMode = false) {
  return request<SetupState>('/setup/complete', {
    method: 'POST',
    body: JSON.stringify({ demoMode }),
  })
}

export async function testSignalBridge(data: { bridgeUrl: string; bridgeApiKey: string }) {
  return request<{ ok: boolean; error?: string }>('/setup/test/signal', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function testWhatsAppConnection(data: { phoneNumberId: string; accessToken: string }) {
  return request<{ ok: boolean; error?: string }>('/setup/test/whatsapp', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

// --- Reports ---

export type ConversionStatus = 'pending' | 'in_progress' | 'completed'

export type Report = Conversation & {
  metadata: {
    type: 'report'
    reportTitle?: string
    reportCategory?: string
    reportTypeId?: string
    customFieldValues?: string
    linkedCallId?: string
    reportId?: string
    conversionStatus?: ConversionStatus
  }
}

export async function listReports(params?: { status?: string; category?: string; page?: number; limit?: number }) {
  const qs = new URLSearchParams()
  if (params?.status) qs.set('status', params.status)
  if (params?.category) qs.set('category', params.category)
  if (params?.page) qs.set('page', String(params.page))
  if (params?.limit) qs.set('limit', String(params.limit))
  return request<{ conversations: Report[]; total: number }>(hp(`/reports?${qs}`))
}

export async function createReport(data: {
  title: string
  category?: string
  reportTypeId?: string
  encryptedContent: string
  readerEnvelopes: import('@shared/types').RecipientEnvelope[]
}) {
  return request<Report>(hp('/reports'), {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function getReport(id: string) {
  return request<Report>(hp(`/reports/${id}`))
}

export async function getReportMessages(id: string, params?: { page?: number; limit?: number }) {
  const qs = new URLSearchParams()
  if (params?.page) qs.set('page', String(params.page))
  if (params?.limit) qs.set('limit', String(params.limit))
  return request<{ messages: ConversationMessage[]; total: number }>(hp(`/reports/${id}/messages?${qs}`))
}

export async function sendReportMessage(id: string, data: {
  encryptedContent: string
  readerEnvelopes: import('@shared/types').RecipientEnvelope[]
  attachmentIds?: string[]
}) {
  return request<ConversationMessage>(hp(`/reports/${id}/messages`), {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function assignReport(id: string, assignedTo: string) {
  return request<Report>(hp(`/reports/${id}/assign`), {
    method: 'POST',
    body: JSON.stringify({ assignedTo }),
  })
}

export async function updateReport(id: string, data: { status?: string }) {
  return request<Report>(hp(`/reports/${id}`), {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export async function getReportCategories() {
  return request<{ categories: string[] }>(hp('/reports/categories'))
}

// --- Report Types ---

export async function getReportTypes() {
  return request<{ reportTypes: import('@shared/types').ReportType[] }>(hp('/reports/types'))
}

export async function getReportTypesAdmin() {
  return request<{ reportTypes: import('@shared/types').ReportType[] }>(hp('/settings/report-types'))
}

export async function createReportType(data: {
  name: string
  description?: string
  icon?: string
  fields?: import('@shared/types').CustomFieldDefinition[]
  isDefault?: boolean
}) {
  return request<import('@shared/types').ReportType>(hp('/settings/report-types'), {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateReportType(id: string, data: Partial<import('@shared/types').ReportType>) {
  return request<import('@shared/types').ReportType>(hp(`/settings/report-types/${id}`), {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export async function archiveReportType(id: string) {
  return request<{ ok: boolean }>(hp(`/settings/report-types/${id}`), {
    method: 'DELETE',
  })
}

export async function getReportFiles(id: string) {
  return request<{ files: import('@shared/types').FileRecord[] }>(hp(`/reports/${id}/files`))
}

// --- Triage Queue (Epic 342) ---

export async function listTriageQueue(params?: { conversionStatus?: ConversionStatus; page?: number; limit?: number }) {
  const qs = new URLSearchParams({ conversionEnabled: 'true' })
  if (params?.conversionStatus) qs.set('conversionStatus', params.conversionStatus)
  if (params?.page) qs.set('page', String(params.page))
  if (params?.limit) qs.set('limit', String(params.limit))
  return request<{ conversations: Report[]; total: number }>(hp(`/reports?${qs}`))
}

export async function updateReportConversionStatus(reportId: string, conversionStatus: ConversionStatus) {
  return request<Report>(hp(`/reports/${reportId}`), {
    method: 'PATCH',
    body: JSON.stringify({ conversionStatus }),
  })
}

export async function getLinkedCasesForReport(reportId: string) {
  return request<{ records: Array<{ reportId: string; caseId: string; linkedAt: string; linkedBy: string }>; total: number }>(hp(`/reports/${reportId}/records`))
}

export async function createCaseFromReport(
  reportId: string,
  recordBody: CreateRecordBody,
) {
  const record = await createRecord(recordBody)
  // Link the newly-created case to the report
  await request(hp(`/reports/${reportId}/records`), {
    method: 'POST',
    body: JSON.stringify({ caseId: record.id }),
  })
  return record
}

// --- File Uploads ---

export async function initUpload(data: import('@shared/types').UploadInit) {
  return request<{ uploadId: string; totalChunks: number }>('/uploads/init', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function uploadChunk(uploadId: string, chunkIndex: number, data: ArrayBuffer) {
  const maxRetries = 2
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      await new Promise(r => setTimeout(r, BASE_RETRY_DELAY * Math.pow(2, attempt - 1)))
    }
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30_000)
    try {
      const headers = {
        ...await getAuthHeaders('PUT', `/uploads/${uploadId}/chunks/${chunkIndex}`),
        'Content-Type': 'application/octet-stream',
      }
      const res = await fetch(`${API_BASE}/uploads/${uploadId}/chunks/${chunkIndex}`, {
        method: 'PUT',
        headers,
        body: data,
        signal: controller.signal,
      })
      if (!res.ok) {
        if (res.status === 401) onAuthExpired?.()
        const err = new ApiError(res.status, await res.text())
        if (isRetryable(res.status) && attempt < maxRetries) { lastError = err; continue }
        throw err
      }
      onApiActivity?.()
      return res.json() as Promise<{ chunkIndex: number; completedChunks: number; totalChunks: number }>
    } catch (err) {
      if (err instanceof ApiError) throw err
      lastError = err instanceof Error ? err : new Error(String(err))
      if (attempt < maxRetries) continue
      throw new NetworkError(lastError.message, lastError)
    } finally {
      clearTimeout(timeout)
    }
  }
  throw lastError ?? new Error('Upload chunk failed')
}

export async function completeUpload(uploadId: string) {
  return request<{ fileId: string; status: string }>(`/uploads/${uploadId}/complete`, { method: 'POST' })
}

export async function getUploadStatus(uploadId: string) {
  return request<{ uploadId: string; status: string; completedChunks: number; totalChunks: number }>(`/uploads/${uploadId}/status`)
}

export async function downloadFile(fileId: string): Promise<ArrayBuffer> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await new Promise(r => setTimeout(r, BASE_RETRY_DELAY * Math.pow(2, attempt - 1)))
    }
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30_000)
    try {
      const headers = await getAuthHeaders('GET', `/files/${fileId}/content`)
      const res = await fetch(`${API_BASE}/files/${fileId}/content`, { headers, signal: controller.signal })
      if (!res.ok) {
        if (res.status === 401) onAuthExpired?.()
        const err = new ApiError(res.status, await res.text())
        if (isRetryable(res.status) && attempt < MAX_RETRIES) continue
        throw err
      }
      onApiActivity?.()
      return res.arrayBuffer()
    } catch (err) {
      if (err instanceof ApiError) throw err
      if (attempt < MAX_RETRIES) continue
      const e = err instanceof Error ? err : new Error(String(err))
      throw new NetworkError(e.message, e)
    } finally {
      clearTimeout(timeout)
    }
  }
  throw new Error('Download failed')
}

export async function getFileEnvelopes(fileId: string) {
  return request<{ envelopes: import('@shared/types').FileKeyEnvelope[] }>(`/files/${fileId}/envelopes`)
}

export async function getFileMetadata(fileId: string) {
  return request<{ metadata: Array<{ pubkey: string; encryptedContent: string; ephemeralPubkey: string }> }>(`/files/${fileId}/metadata`)
}

export async function shareFile(fileId: string, data: {
  envelope: import('@shared/types').FileKeyEnvelope
  encryptedMetadata: { pubkey: string; encryptedContent: string; ephemeralPubkey: string }
}) {
  return request<{ ok: true }>(`/files/${fileId}/share`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

// --- Demo Seed ---

export async function seedDemoData() {
  const { DEMO_ACCOUNTS } = await import('@shared/demo-accounts')

  // Create demo users (admin is already created via ADMIN_PUBKEY)
  const nonAdminAccounts = DEMO_ACCOUNTS.filter(a => !a.roleIds.includes('role-super-admin'))
  for (const account of nonAdminAccounts) {
    try {
      await createUser({
        name: account.name,
        phone: account.phone,
        roleIds: account.roleIds,
        pubkey: account.pubkey,
      })
    } catch { /* may already exist */ }
  }

  // Deactivate Fatima (inactive user demo)
  const fatima = DEMO_ACCOUNTS.find(a => a.name === 'Fatima Al-Rashid')
  if (fatima) {
    try {
      await request(`/users/${fatima.pubkey}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: false }),
      })
    } catch { /* ignore */ }
  }

  // Mark all demo profiles as completed and set browser call preference
  for (const account of nonAdminAccounts) {
    try {
      await request(`/users/${account.pubkey}`, {
        method: 'PATCH',
        body: JSON.stringify({
          profileCompleted: true,
          callPreference: 'browser',
          spokenLanguages: account.spokenLanguages,
        }),
      })
    } catch { /* ignore */ }
  }

  // Create shifts
  const maria = DEMO_ACCOUNTS.find(a => a.name === 'Maria Santos')!
  const james = DEMO_ACCOUNTS.find(a => a.name === 'James Chen')!
  const shifts = [
    { name: 'Morning Team', startTime: '08:00', endTime: '16:00', days: [1, 2, 3, 4, 5], userPubkeys: [maria.pubkey, james.pubkey] },
    { name: 'Evening Team', startTime: '16:00', endTime: '23:59', days: [1, 2, 3, 4, 5], userPubkeys: [maria.pubkey] },
    { name: 'Weekend Coverage', startTime: '10:00', endTime: '18:00', days: [0, 6], userPubkeys: [james.pubkey] },
  ]
  for (const shift of shifts) {
    try {
      await createShift(shift)
    } catch { /* ignore */ }
  }

  // Add sample bans
  const bans = [
    { phone: '+15559999001', reason: 'Repeated prank calls' },
    { phone: '+15559999002', reason: 'Threatening language towards volunteers' },
  ]
  for (const ban of bans) {
    try {
      await addBan(ban)
    } catch { /* ignore */ }
  }
}

// --- Blasts ---

import type { Subscriber, Blast, BlastContent, BlastSettings } from '@shared/types'
export type { Subscriber, Blast, BlastContent, BlastSettings }

export async function listSubscribers(params?: { tag?: string; channel?: string; status?: string }) {
  const searchParams = new URLSearchParams()
  if (params?.tag) searchParams.set('tag', params.tag)
  if (params?.channel) searchParams.set('channel', params.channel)
  if (params?.status) searchParams.set('status', params.status)
  const qs = searchParams.toString()
  return request<{ subscribers: Subscriber[] }>(hp(`/blasts/subscribers${qs ? `?${qs}` : ''}`))
}

export async function importSubscribers(data: { subscribers: Array<{ identifier: string; channel: string; tags?: string[]; language?: string }> }) {
  return request<{ imported: number; skipped: number }>(hp('/blasts/subscribers/import'), {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function removeSubscriber(id: string) {
  return request<{ ok: boolean }>(hp(`/blasts/subscribers/${id}`), { method: 'DELETE' })
}

export async function getSubscriberStats() {
  return request<{ total: number; active: number; paused: number; byChannel: Record<string, number> }>(hp('/blasts/subscribers/stats'))
}

export async function listBlasts() {
  return request<{ blasts: Blast[] }>(hp('/blasts'))
}

export async function createBlast(data: { name: string; content: BlastContent; targetChannels: string[]; targetTags?: string[]; targetLanguages?: string[] }) {
  return request<{ blast: Blast }>(hp('/blasts'), {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateBlast(id: string, data: Partial<Blast>) {
  return request<{ blast: Blast }>(hp(`/blasts/${id}`), {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export async function deleteBlast(id: string) {
  return request<{ ok: boolean }>(hp(`/blasts/${id}`), { method: 'DELETE' })
}

export async function sendBlast(id: string) {
  return request<{ blast: Blast }>(hp(`/blasts/${id}/send`), { method: 'POST' })
}

export async function scheduleBlast(id: string, scheduledAt: string) {
  return request<{ blast: Blast }>(hp(`/blasts/${id}/schedule`), {
    method: 'POST',
    body: JSON.stringify({ scheduledAt }),
  })
}

export async function cancelBlast(id: string) {
  return request<{ blast: Blast }>(hp(`/blasts/${id}/cancel`), { method: 'POST' })
}

export async function getBlastSettings() {
  return request<BlastSettings>(hp('/blasts/settings'))
}

export async function updateBlastSettings(data: Partial<BlastSettings>) {
  return request<BlastSettings>(hp('/blasts/settings'), {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

// --- Hub Management ---

export type { Hub }

export async function listHubs() {
  return request<{ hubs: Hub[] }>('/hubs')
}

export async function createHub(data: { name: string; slug?: string; description?: string; phoneNumber?: string }) {
  return request<{ hub: Hub }>('/hubs', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function getHub(hubId: string) {
  return request<{ hub: Hub }>(`/hubs/${hubId}`)
}

export async function updateHub(hubId: string, data: Partial<Hub>) {
  return request<{ hub: Hub }>(`/hubs/${hubId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export async function deleteHub(hubId: string) {
  return request<{ ok: true }>(`/hubs/${hubId}`, {
    method: 'DELETE',
  })
}

export async function addHubMember(hubId: string, pubkey: string, roleIds: string[]) {
  return request<{ ok: true }>(`/hubs/${hubId}/members`, {
    method: 'POST',
    body: JSON.stringify({ pubkey, roleIds }),
  })
}

export async function removeHubMember(hubId: string, pubkey: string) {
  return request<{ ok: true }>(`/hubs/${hubId}/members/${pubkey}`, { method: 'DELETE' })
}

// --- System Health (admin only) ---

export type { ServiceStatus, SystemHealth }

export async function fetchSystemHealth() {
  return request<SystemHealth>('/system/health')
}

// --- Case Management (CMS) ---

import type { EntityTypeDefinition, EntityFieldDefinition, EnumOption, EntityCategory } from '@shared/types'
export type { EntityTypeDefinition, EntityFieldDefinition, EnumOption, EntityCategory }

export async function getCaseManagementEnabled() {
  return request<{ enabled: boolean }>(hp('/settings/cms/case-management'))
}

export async function setCaseManagementEnabled(enabled: boolean) {
  return request<{ enabled: boolean }>(hp('/settings/cms/case-management'), {
    method: 'PUT',
    body: JSON.stringify({ enabled }),
  })
}

export async function listEntityTypes() {
  return request<{ entityTypes: EntityTypeDefinition[] }>(hp('/settings/cms/entity-types'))
}

export type CreateEntityTypeBody = z.input<typeof createEntityTypeBodySchema>

export async function createEntityType(body: CreateEntityTypeBody) {
  return request<EntityTypeDefinition>(hp('/settings/cms/entity-types'), {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function updateEntityType(id: string, body: Partial<CreateEntityTypeBody> & { isArchived?: boolean }) {
  return request<EntityTypeDefinition>(hp(`/settings/cms/entity-types/${id}`), {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export async function deleteEntityType(id: string) {
  return request<{ ok: boolean }>(hp(`/settings/cms/entity-types/${id}`), {
    method: 'DELETE',
  })
}

export type TemplateSummary = z.infer<typeof templateSummarySchema>

export async function listTemplates() {
  return request<{ templates: TemplateSummary[]; appliedTemplateIds?: string[] }>(hp('/settings/cms/templates'))
}

export async function applyTemplate(templateId: string) {
  return request<{ applied: boolean; entityTypes: number }>(hp('/settings/cms/templates/apply'), {
    method: 'POST',
    body: JSON.stringify({ templateId }),
    headers: { 'Content-Type': 'application/json' },
  })
}

// --- CMS Report Type Definitions (Epic 343) ---

export type ReportTypeDefinition = z.infer<typeof reportTypeDefinitionSchema>

export async function listCmsReportTypes() {
  return request<{ reportTypes: ReportTypeDefinition[] }>(hp('/settings/cms/report-types'))
}

export async function getCmsReportType(id: string) {
  return request<ReportTypeDefinition>(hp(`/settings/cms/report-types/${id}`))
}

export async function createCmsReportType(body: {
  name: string
  label: string
  labelPlural: string
  description?: string
  icon?: string
  color?: string
  fields?: Array<Partial<EntityFieldDefinition> & { supportAudioInput?: boolean }>
  statuses: EnumOption[]
  defaultStatus: string
  closedStatuses?: string[]
  numberPrefix?: string
  numberingEnabled?: boolean
  allowFileAttachments?: boolean
  allowCaseConversion?: boolean
  mobileOptimized?: boolean
}) {
  return request<ReportTypeDefinition>(hp('/settings/cms/report-types'), {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function updateCmsReportType(id: string, body: Partial<{
  label: string
  labelPlural: string
  description: string
  icon: string
  color: string
  fields: Array<Partial<EntityFieldDefinition> & { supportAudioInput?: boolean }>
  statuses: EnumOption[]
  defaultStatus: string
  closedStatuses: string[]
  numberPrefix: string
  numberingEnabled: boolean
  allowFileAttachments: boolean
  allowCaseConversion: boolean
  mobileOptimized: boolean
  isArchived: boolean
}>) {
  return request<ReportTypeDefinition>(hp(`/settings/cms/report-types/${id}`), {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export async function deleteCmsReportType(id: string) {
  return request<{ archived: boolean; id: string }>(hp(`/settings/cms/report-types/${id}`), {
    method: 'DELETE',
  })
}

// --- Case Records (Epic 330) ---

export type CaseRecord = z.infer<typeof recordSchema>

export type RecordContact = z.infer<typeof recordContactSchema>

export type { CreateRecordBody, UpdateRecordBody }

export async function listRecords(params?: {
  entityTypeId?: string
  statusHash?: string
  severityHash?: string
  assignedTo?: string
  page?: number
  limit?: number
}) {
  const qs = new URLSearchParams()
  if (params?.entityTypeId) qs.set('entityTypeId', params.entityTypeId)
  if (params?.statusHash) qs.set('statusHash', params.statusHash)
  if (params?.severityHash) qs.set('severityHash', params.severityHash)
  if (params?.assignedTo) qs.set('assignedTo', params.assignedTo)
  if (params?.page) qs.set('page', String(params.page))
  qs.set('limit', String(params?.limit ?? 50))
  return request<{ records: CaseRecord[]; total: number; page: number; limit: number; hasMore: boolean }>(hp(`/records?${qs}`))
}

export async function getRecord(id: string) {
  return request<CaseRecord>(hp(`/records/${id}`))
}

export async function createRecord(body: CreateRecordBody) {
  return request<CaseRecord>(hp('/records'), {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function updateRecord(id: string, body: UpdateRecordBody) {
  return request<CaseRecord>(hp(`/records/${id}`), {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export async function deleteRecord(id: string) {
  return request<{ ok: boolean }>(hp(`/records/${id}`), { method: 'DELETE' })
}

export async function listRecordContacts(id: string) {
  return request<{ contacts: RecordContact[] }>(hp(`/records/${id}/contacts`))
}

export async function linkContactToRecord(id: string, contactId: string, role: string) {
  return request<RecordContact>(hp(`/records/${id}/contacts`), {
    method: 'POST',
    body: JSON.stringify({ contactId, role }),
  })
}

export async function unlinkContactFromRecord(id: string, contactId: string) {
  return request<{ ok: boolean }>(hp(`/records/${id}/contacts/${contactId}`), { method: 'DELETE' })
}

// --- Contact Directory (Epic 331) ---

export type { DirectoryContactType, IdentifierType, ContactIdentifier, ContactCaseLink }
import type { Contact as RawContactBase } from '@protocol/schemas/contacts-v2'
export type { ContactSummary as DirectoryContactSummary } from '@protocol/schemas/contacts-v2'
export type { ContactPII } from '@protocol/schemas/contacts-v2'

/** Raw encrypted contact from the backend (alias for protocol Contact) */
export type RawContact = RawContactBase

/** Client-side decrypted contact for UI rendering (extends protocol DirectoryContact with _raw) */
export type DirectoryContact = import('@protocol/schemas').DirectoryContact & {
  _raw?: RawContact
}

export type ContactRelationship = z.infer<typeof contactRelationshipResponseSchema>

export type ContactGroup = z.infer<typeof contactGroupResponseSchema>

/** Fetch raw encrypted contacts from /directory (backend returns encrypted data) */
export async function listRawContacts(params?: {
  page?: number
  limit?: number
  contactTypeHash?: string
  statusHash?: string
  nameToken?: string
}) {
  const qs = new URLSearchParams()
  if (params?.page) qs.set('page', String(params.page))
  qs.set('limit', String(params?.limit ?? 50))
  if (params?.contactTypeHash) qs.set('contactTypeHash', params.contactTypeHash)
  if (params?.statusHash) qs.set('statusHash', params.statusHash)
  if (params?.nameToken) qs.set('nameToken', params.nameToken)
  return request<{ contacts: RawContact[]; total: number; page: number; limit: number; hasMore: boolean }>(hp(`/directory?${qs}`))
}

/** Search contacts by trigram tokens */
export async function searchRawContacts(tokens: string) {
  return request<{ contacts: RawContact[] }>(hp(`/directory/search?tokens=${encodeURIComponent(tokens)}`))
}

/** Get a single raw contact by ID */
export async function getRawContact(id: string) {
  return request<RawContact>(hp(`/directory/${id}`))
}

/** Encrypted body for creating a contact via POST /directory */
import type { CreateContactBody as CreateRawContactBody } from '@protocol/schemas/contacts-v2'
export type { CreateRawContactBody }

/** Create an encrypted contact record */
export async function createRawContact(body: CreateRawContactBody) {
  return request<RawContact>(hp('/directory'), {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

/** Legacy aliases for backwards compatibility with existing UI code */
export async function listDirectoryContacts(params?: {
  page?: number
  limit?: number
  contactType?: DirectoryContactType
}) {
  return listRawContacts({
    page: params?.page,
    limit: params?.limit,
    contactTypeHash: params?.contactType,
  })
}

export async function searchDirectoryContacts(tokens: string) {
  return searchRawContacts(tokens)
}

export async function getDirectoryContact(id: string) {
  return getRawContact(id)
}

export async function updateDirectoryContact(id: string, body: Partial<CreateRawContactBody>) {
  return request<RawContact>(hp(`/directory/${id}`), {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

export async function deleteDirectoryContact(id: string) {
  return request<{ ok: boolean }>(hp(`/directory/${id}`), { method: 'DELETE' })
}

export async function listDirectoryContactRelationships(id: string) {
  return request<{ relationships: ContactRelationship[] }>(hp(`/directory/${id}/relationships`))
}

export async function listDirectoryContactGroups(id: string) {
  return request<{ groups: ContactGroup[] }>(hp(`/directory/${id}/groups`))
}

export async function listDirectoryContactCases(id: string) {
  return request<{ cases: ContactCaseLink[] }>(hp(`/directory/${id}/cases`))
}

// Keep legacy type alias for create dialog (now encrypts client-side)
export type CreateDirectoryContactBody = {
  displayName: string
  contactType: DirectoryContactType
  tags?: string[]
  identifiers?: Array<{ type: IdentifierType; value: string; isPrimary: boolean }>
}

export async function assignRecord(id: string, pubkeys: string[]) {
  return request<CaseRecord>(hp(`/records/${id}/assign`), {
    method: 'POST',
    body: JSON.stringify({ pubkeys }),
  })
}

export async function unassignRecord(id: string, pubkey: string) {
  return request<CaseRecord>(hp(`/records/${id}/unassign`), {
    method: 'POST',
    body: JSON.stringify({ pubkey }),
  })
}

// --- Assignment Suggestions (Epic 342) ---

export type { AssignmentSuggestion }

export async function getAssignmentSuggestions(recordId: string) {
  return request<{ suggestions: AssignmentSuggestion[] }>(hp(`/records/${recordId}/suggest-assignees`))
}

export async function getAutoAssignmentStatus() {
  return request<{ enabled: boolean }>(hp('/settings/cms/auto-assignment'))
}

export async function setAutoAssignment(enabled: boolean) {
  return request<{ enabled: boolean }>(hp('/settings/cms/auto-assignment'), {
    method: 'PUT',
    body: JSON.stringify({ enabled }),
  })
}

export async function getRecordEnvelopeRecipients(params: {
  entityTypeId: string
  assignedTo?: string[]
  recordId?: string
}) {
  if (params.recordId) {
    return request<{
      summary: string[]
      fields: string[]
      pii: string[]
    }>(hp(`/records/${params.recordId}/envelope-recipients`))
  }
  const qs = new URLSearchParams({ entityTypeId: params.entityTypeId })
  if (params.assignedTo?.length) qs.set('assignedTo', params.assignedTo.join(','))
  return request<{
    summary: string[]
    fields: string[]
    pii: string[]
  }>(hp(`/records/envelope-recipients?${qs}`))
}

// --- Case Interactions (Epic 332 — Timeline) ---

export type InteractionType = CaseInteraction['interactionType']

export type CaseInteraction = z.infer<typeof caseInteractionSchema>

export async function listInteractions(recordId: string, params?: {
  interactionTypeHash?: string
  after?: string
  before?: string
  page?: number
  limit?: number
}) {
  const qs = new URLSearchParams()
  if (params?.interactionTypeHash) qs.set('interactionTypeHash', params.interactionTypeHash)
  if (params?.after) qs.set('after', params.after)
  if (params?.before) qs.set('before', params.before)
  qs.set('page', String(params?.page ?? 1))
  qs.set('limit', String(params?.limit ?? 50))
  return request<{
    interactions: CaseInteraction[]
    total: number
    page: number
    limit: number
    hasMore: boolean
  }>(hp(`/records/${recordId}/interactions?${qs}`))
}

export async function createInteraction(recordId: string, body: {
  interactionType: InteractionType
  sourceId?: string
  encryptedContent?: string
  contentEnvelopes?: import('@shared/types').RecipientEnvelope[]
  interactionTypeHash: string
  previousStatusHash?: string
  newStatusHash?: string
}) {
  return request<CaseInteraction>(hp(`/records/${recordId}/interactions`), {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

// --- Case Evidence (Epic 332 — Evidence Viewer) ---

export type { EvidenceClassification, CustodyAction, EvidenceMetadata, CustodyEntry }

export async function listEvidence(recordId: string, params?: {
  classification?: EvidenceClassification
  page?: number
  limit?: number
}) {
  const qs = new URLSearchParams()
  if (params?.classification) qs.set('classification', params.classification)
  qs.set('page', String(params?.page ?? 1))
  qs.set('limit', String(params?.limit ?? 50))
  return request<{
    evidence: EvidenceMetadata[]
    total: number
    page: number
    limit: number
    hasMore: boolean
  }>(hp(`/records/${recordId}/evidence?${qs}`))
}

export async function uploadEvidence(recordId: string, body: {
  fileId: string
  filename: string
  mimeType: string
  sizeBytes: number
  classification: EvidenceClassification
  integrityHash: string
  source?: string
  sourceDescription?: string
  encryptedDescription?: string
  descriptionEnvelopes?: import('@shared/types').RecipientEnvelope[]
  interactionTypeHash?: string
}) {
  return request<EvidenceMetadata>(hp(`/records/${recordId}/evidence`), {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function getEvidenceMetadata(evidenceId: string) {
  return request<EvidenceMetadata>(hp(`/evidence/${evidenceId}`))
}

export async function getEvidenceCustody(evidenceId: string) {
  return request<{
    custodyChain: CustodyEntry[]
    total: number
  }>(hp(`/evidence/${evidenceId}/custody`))
}

export async function logEvidenceAccess(evidenceId: string, body: {
  action: CustodyAction
  integrityHash: string
  notes?: string
}) {
  return request<CustodyEntry>(hp(`/evidence/${evidenceId}/access`), {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function verifyEvidenceIntegrity(evidenceId: string, currentHash: string) {
  return request<{
    valid: boolean
    originalHash: string
    currentHash: string
  }>(hp(`/evidence/${evidenceId}/verify`), {
    method: 'POST',
    body: JSON.stringify({ currentHash }),
  })
}
