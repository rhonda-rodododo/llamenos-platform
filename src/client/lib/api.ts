import * as keyManager from './key-manager'

const API_BASE = '/api'

// Auth expiry callback — set by AuthProvider to handle 401s reactively
let onAuthExpired: (() => void) | null = null
export function setOnAuthExpired(cb: (() => void) | null) { onAuthExpired = cb }

function getAuthHeaders(method: string, apiPath: string): Record<string, string> {
  // Prefer session token if available (WebAuthn-based sessions)
  const sessionToken = sessionStorage.getItem('llamenos-session-token')
  if (sessionToken) {
    return { 'Authorization': `Session ${sessionToken}` }
  }
  // Use key manager for Schnorr auth if unlocked
  if (keyManager.isUnlocked()) {
    try {
      const token = keyManager.createAuthToken(Date.now(), method, `${API_BASE}${apiPath}`)
      return { 'Authorization': `Bearer ${token}` }
    } catch {
      return {}
    }
  }
  return {}
}

// Activity tracking callback — set by AuthProvider
let onApiActivity: (() => void) | null = null
export function setOnApiActivity(cb: (() => void) | null) { onApiActivity = cb }

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = ((options.method as string) || 'GET').toUpperCase()
  // Strip query params from path for auth token signing (server uses url.pathname)
  const pathOnly = path.split('?')[0]
  const headers = {
    'Content-Type': 'application/json',
    ...getAuthHeaders(method, pathOnly),
    ...options.headers,
  }
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers })
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/')) {
      // Session expired — notify auth provider (don't clear nsec for reconnect)
      onAuthExpired?.()
    }
    const body = await res.text()
    throw new ApiError(res.status, body)
  }
  // Track successful API activity for session expiry warning
  onApiActivity?.()
  return res.json()
}

export class ApiError extends Error {
  constructor(public status: number, public body: string) {
    super(`API error ${status}: ${body}`)
    this.name = 'ApiError'
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
  const res = await fetch(`${API_BASE}/config`)
  if (!res.ok) return { hotlineName: 'Hotline', hotlineNumber: '', channels: undefined, setupCompleted: undefined }
  return res.json() as Promise<{
    hotlineName: string
    hotlineNumber: string
    channels?: import('@shared/types').EnabledChannels
    setupCompleted?: boolean
    adminPubkey?: string
    demoMode?: boolean
    needsBootstrap?: boolean
    hubs?: import('@shared/types').Hub[]
    defaultHubId?: string
  }>
}

// --- Auth ---

export async function login(pubkey: string, timestamp: number, token: string) {
  return request<{ ok: true; roles: string[] }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ pubkey, timestamp, token }),
  })
}

export async function bootstrapAdmin(pubkey: string, timestamp: number, token: string) {
  const res = await fetch(`${API_BASE}/auth/bootstrap`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pubkey, timestamp, token }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new ApiError(res.status, body)
  }
  return res.json() as Promise<{ ok: true; roles: string[] }>
}

export async function logout() {
  return request<{ ok: true }>('/auth/me/logout', { method: 'POST' }).catch(() => {})
}

export async function getMe() {
  return request<{ pubkey: string; roles: string[]; permissions: string[]; primaryRole: { id: string; name: string; slug: string } | null; name: string; transcriptionEnabled: boolean; spokenLanguages: string[]; uiLanguage: string; profileCompleted: boolean; onBreak: boolean; callPreference: 'phone' | 'browser' | 'both'; webauthnRequired: boolean; webauthnRegistered: boolean; adminPubkey: string }>('/auth/me')
}

// --- Volunteers (admin only) ---

export async function listVolunteers() {
  return request<{ volunteers: Volunteer[] }>('/volunteers')
}

export async function createVolunteer(data: { name: string; phone: string; roleIds: string[]; pubkey: string }) {
  return request<{ volunteer: Volunteer }>('/volunteers', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateVolunteer(pubkey: string, data: Partial<{
  name: string
  phone: string
  roles: string[]
  active: boolean
  supportedMessagingChannels: string[]
  messagingEnabled: boolean
}>) {
  return request<{ volunteer: Volunteer }>(`/volunteers/${pubkey}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export async function deleteVolunteer(pubkey: string) {
  return request<{ ok: true }>(`/volunteers/${pubkey}`, { method: 'DELETE' })
}

// --- Shift Status (all users) ---

export interface ShiftStatus {
  onShift: boolean
  currentShift: { name: string; startTime: string; endTime: string } | null
  nextShift: { name: string; startTime: string; endTime: string; day: number } | null
}

export async function getMyShiftStatus() {
  return request<ShiftStatus>(hp('/shifts/my-status'))
}

// --- Shifts (admin only) ---

export async function listShifts() {
  return request<{ shifts: Shift[] }>(hp('/shifts'))
}

export async function createShift(data: Omit<Shift, 'id'>) {
  return request<{ shift: Shift }>(hp('/shifts'), {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateShift(id: string, data: Partial<Shift>) {
  return request<{ shift: Shift }>(hp(`/shifts/${id}`), {
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

export async function listNotes(params?: { callId?: string; page?: number; limit?: number }) {
  const qs = new URLSearchParams()
  if (params?.callId) qs.set('callId', params.callId)
  if (params?.page) qs.set('page', String(params.page))
  if (params?.limit) qs.set('limit', String(params.limit))
  return request<{ notes: EncryptedNote[]; total: number }>(hp(`/notes?${qs}`))
}

export async function createNote(data: {
  callId: string
  encryptedContent: string
  authorEnvelope?: { encryptedNoteKey: string; ephemeralPubkey: string }
  adminEnvelope?: { encryptedNoteKey: string; ephemeralPubkey: string }
}) {
  return request<{ note: EncryptedNote }>(hp('/notes'), {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateNote(id: string, data: {
  encryptedContent: string
  authorEnvelope?: { encryptedNoteKey: string; ephemeralPubkey: string }
  adminEnvelope?: { encryptedNoteKey: string; ephemeralPubkey: string }
}) {
  return request<{ note: EncryptedNote }>(hp(`/notes/${id}`), {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
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

// --- Calls Today ---

export async function getCallsTodayCount() {
  return request<{ count: number }>(hp('/calls/today-count'))
}

// --- Call Recording ---

export async function getCallRecording(callId: string): Promise<ArrayBuffer> {
  const pathOnly = hp(`/calls/${callId}/recording`).split('?')[0]
  const method = 'GET'
  const headers = {
    ...getAuthHeaders(method, pathOnly),
  }
  const res = await fetch(`${API_BASE}${hp(`/calls/${callId}/recording`)}`, { headers })
  if (!res.ok) {
    if (res.status === 401) onAuthExpired?.()
    throw new ApiError(res.status, await res.text())
  }
  onApiActivity?.()
  return res.arrayBuffer()
}

// --- Volunteer Presence (admin only) ---

export async function getVolunteerPresence() {
  return request<{ volunteers: VolunteerPresence[] }>(hp('/calls/presence'))
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

export interface CallSettings {
  queueTimeoutSeconds: number
  voicemailMaxSeconds: number
}

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
  return request<{ globalEnabled: boolean; allowVolunteerOptOut: boolean }>('/settings/transcription')
}

export async function updateTranscriptionSettings(data: { globalEnabled?: boolean; allowVolunteerOptOut?: boolean }) {
  return request<{ globalEnabled: boolean; allowVolunteerOptOut: boolean }>('/settings/transcription', {
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
  const res = await fetch(`${API_BASE}/invites/validate/${code}`)
  return res.json() as Promise<{ valid: boolean; name?: string; roleIds?: string[]; error?: string }>
}

export async function redeemInvite(code: string, pubkey: string, secretKey?: Uint8Array) {
  // Include Schnorr signature to prove key possession
  let authFields = {}
  if (secretKey) {
    const { createAuthToken } = await import('./crypto')
    const timestamp = Date.now()
    const tokenJson = createAuthToken(secretKey, timestamp, 'POST', '/api/invites/redeem')
    const parsed = JSON.parse(tokenJson)
    authFields = { timestamp: parsed.timestamp, token: parsed.token }
  }
  const res = await fetch(`${API_BASE}/invites/redeem`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, pubkey, ...authFields }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new ApiError(res.status, body)
  }
  return res.json() as Promise<{ volunteer: Volunteer }>
}

// --- IVR Audio ---

export interface IvrAudioRecording {
  promptType: string
  language: string
  size: number
  uploadedAt: string
}

export async function listIvrAudio() {
  return request<{ recordings: IvrAudioRecording[] }>('/settings/ivr-audio')
}

export async function uploadIvrAudio(promptType: string, language: string, audioBlob: Blob) {
  const res = await fetch(`${API_BASE}/settings/ivr-audio/${promptType}/${language}`, {
    method: 'PUT',
    headers: {
      ...getAuthHeaders('PUT', `/settings/ivr-audio/${promptType}/${language}`),
      'Content-Type': audioBlob.type || 'audio/webm',
    },
    body: audioBlob,
  })
  if (!res.ok) {
    if (res.status === 401) {
      onAuthExpired?.()
    }
    const body = await res.text()
    throw new ApiError(res.status, body)
  }
  return res.json() as Promise<{ ok: true }>
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

export interface WebAuthnSettings {
  requireForAdmins: boolean
  requireForVolunteers: boolean
}

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

export interface RoleDefinition {
  id: string
  name: string
  slug: string
  permissions: string[]
  isDefault: boolean
  isSystem: boolean
  description: string
  createdAt: string
  updatedAt: string
}

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

// --- Types ---

/** @deprecated Use roles array + permissions */
export type UserRole = 'volunteer' | 'admin' | 'reporter'

export interface Volunteer {
  pubkey: string
  name: string
  phone: string
  roles: string[]
  active: boolean
  createdAt: string
  transcriptionEnabled: boolean
  onBreak: boolean
  callPreference: 'phone' | 'browser' | 'both'
  // Messaging capabilities (Epic 68)
  supportedMessagingChannels?: string[]  // SMS, WhatsApp, Signal, RCS (empty = all)
  messagingEnabled?: boolean  // Whether volunteer can handle messaging conversations
}

export interface Shift {
  id: string
  name: string
  startTime: string   // HH:mm
  endTime: string     // HH:mm
  days: number[]      // 0=Sunday, 1=Monday, ..., 6=Saturday
  volunteerPubkeys: string[]
  createdAt: string
}

export interface BanEntry {
  phone: string
  reason: string
  bannedBy: string
  bannedAt: string
}

export interface EncryptedNote {
  id: string
  callId: string
  authorPubkey: string
  encryptedContent: string
  createdAt: string
  updatedAt: string
  ephemeralPubkey?: string
  // V2 per-note ECIES envelopes (forward secrecy)
  authorEnvelope?: { encryptedNoteKey: string; ephemeralPubkey: string }
  adminEnvelope?: { encryptedNoteKey: string; ephemeralPubkey: string }
}

export interface ActiveCall {
  id: string
  callerNumber: string
  answeredBy: string | null
  startedAt: string
  status: 'ringing' | 'in-progress' | 'completed' | 'unanswered'
}

export interface CallRecord {
  id: string
  callerNumber: string
  callerLast4?: string
  answeredBy: string
  startedAt: string
  endedAt: string
  duration: number
  hasTranscription: boolean
  hasVoicemail: boolean
  hasRecording?: boolean
  status: 'completed' | 'unanswered'
}

export interface AuditLogEntry {
  id: string
  event: string
  actorPubkey: string
  details: Record<string, unknown>
  createdAt: string
}

export interface VolunteerPresence {
  pubkey: string
  status: 'available' | 'on-call' | 'online'
}

export interface SpamSettings {
  voiceCaptchaEnabled: boolean
  rateLimitEnabled: boolean
  maxCallsPerMinute: number
  blockDurationMinutes: number
}

export interface InviteCode {
  code: string
  name: string
  phone: string
  roleIds: string[]
  createdBy: string
  createdAt: string
  expiresAt: string
  usedAt?: string
}

// --- Conversations ---

export interface Conversation {
  id: string
  channelType: string
  contactIdentifierHash: string
  contactLast4?: string
  assignedTo?: string
  status: 'active' | 'waiting' | 'closed'
  createdAt: string
  updatedAt: string
  lastMessageAt: string
  messageCount: number
  metadata?: {
    linkedCallId?: string
    reportId?: string
    type?: 'report'
    reportTitle?: string
    reportCategory?: string
  }
}

export type MessageDeliveryStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed'

export interface ConversationMessage {
  id: string
  conversationId: string
  direction: 'inbound' | 'outbound'
  authorPubkey: string
  encryptedContent: string
  ephemeralPubkey: string
  encryptedContentAdmin: string
  ephemeralPubkeyAdmin: string
  hasAttachments: boolean
  attachmentIds?: string[]
  // Delivery status tracking (Epic 71)
  status?: MessageDeliveryStatus
  deliveredAt?: string
  readAt?: string
  failureReason?: string
  retryCount?: number
  createdAt: string
  externalId?: string
}

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
  ephemeralPubkey: string
  encryptedContentAdmin: string
  ephemeralPubkeyAdmin: string
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

export async function getVolunteerLoads() {
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

export interface Report extends Conversation {
  metadata: {
    type: 'report'
    reportTitle?: string
    reportCategory?: string
    customFieldValues?: string
    linkedCallId?: string
    reportId?: string
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
  encryptedContent: string
  ephemeralPubkey: string
  encryptedContentAdmin: string
  ephemeralPubkeyAdmin: string
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
  ephemeralPubkey: string
  encryptedContentAdmin: string
  ephemeralPubkeyAdmin: string
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

export async function getReportFiles(id: string) {
  return request<{ files: import('@shared/types').FileRecord[] }>(hp(`/reports/${id}/files`))
}

// --- File Uploads ---

export async function initUpload(data: import('@shared/types').UploadInit) {
  return request<{ uploadId: string; totalChunks: number }>('/uploads/init', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function uploadChunk(uploadId: string, chunkIndex: number, data: ArrayBuffer) {
  const headers = {
    ...getAuthHeaders('PUT', `/uploads/${uploadId}/chunks/${chunkIndex}`),
    'Content-Type': 'application/octet-stream',
  }
  const res = await fetch(`${API_BASE}/uploads/${uploadId}/chunks/${chunkIndex}`, {
    method: 'PUT',
    headers,
    body: data,
  })
  if (!res.ok) {
    if (res.status === 401) onAuthExpired?.()
    throw new ApiError(res.status, await res.text())
  }
  onApiActivity?.()
  return res.json() as Promise<{ chunkIndex: number; completedChunks: number; totalChunks: number }>
}

export async function completeUpload(uploadId: string) {
  return request<{ fileId: string; status: string }>(`/uploads/${uploadId}/complete`, { method: 'POST' })
}

export async function getUploadStatus(uploadId: string) {
  return request<{ uploadId: string; status: string; completedChunks: number; totalChunks: number }>(`/uploads/${uploadId}/status`)
}

export async function downloadFile(fileId: string): Promise<ArrayBuffer> {
  const headers = getAuthHeaders('GET', `/files/${fileId}/content`)
  const res = await fetch(`${API_BASE}/files/${fileId}/content`, { headers })
  if (!res.ok) {
    if (res.status === 401) onAuthExpired?.()
    throw new ApiError(res.status, await res.text())
  }
  onApiActivity?.()
  return res.arrayBuffer()
}

export async function getFileEnvelopes(fileId: string) {
  return request<{ envelopes: import('@shared/types').RecipientEnvelope[] }>(`/files/${fileId}/envelopes`)
}

export async function getFileMetadata(fileId: string) {
  return request<{ metadata: Array<{ pubkey: string; encryptedContent: string; ephemeralPubkey: string }> }>(`/files/${fileId}/metadata`)
}

export async function shareFile(fileId: string, data: {
  envelope: import('@shared/types').RecipientEnvelope
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

  // Create demo volunteers (admin is already created via ADMIN_PUBKEY)
  const nonAdminAccounts = DEMO_ACCOUNTS.filter(a => !a.roleIds.includes('role-super-admin'))
  for (const account of nonAdminAccounts) {
    try {
      await createVolunteer({
        name: account.name,
        phone: account.phone,
        roleIds: account.roleIds,
        pubkey: account.pubkey,
      })
    } catch { /* may already exist */ }
  }

  // Deactivate Fatima (inactive volunteer demo)
  const fatima = DEMO_ACCOUNTS.find(a => a.name === 'Fatima Al-Rashid')
  if (fatima) {
    try {
      await request(`/volunteers/${fatima.pubkey}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: false }),
      })
    } catch { /* ignore */ }
  }

  // Mark all demo profiles as completed and set browser call preference
  for (const account of nonAdminAccounts) {
    try {
      await request(`/volunteers/${account.pubkey}`, {
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
    { name: 'Morning Team', startTime: '08:00', endTime: '16:00', days: [1, 2, 3, 4, 5], volunteerPubkeys: [maria.pubkey, james.pubkey], createdAt: new Date().toISOString() },
    { name: 'Evening Team', startTime: '16:00', endTime: '23:59', days: [1, 2, 3, 4, 5], volunteerPubkeys: [maria.pubkey], createdAt: new Date().toISOString() },
    { name: 'Weekend Coverage', startTime: '10:00', endTime: '18:00', days: [0, 6], volunteerPubkeys: [james.pubkey], createdAt: new Date().toISOString() },
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

export type { Hub } from '@shared/types'
import type { Hub } from '@shared/types'

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

export async function addHubMember(hubId: string, pubkey: string, roleIds: string[]) {
  return request<{ ok: true }>(`/hubs/${hubId}/members`, {
    method: 'POST',
    body: JSON.stringify({ pubkey, roleIds }),
  })
}

export async function removeHubMember(hubId: string, pubkey: string) {
  return request<{ ok: true }>(`/hubs/${hubId}/members/${pubkey}`, { method: 'DELETE' })
}
