import { request, hp, hubPath, getAuthHeaders, notifyAuthExpired, notifyApiActivity, ApiError, NetworkError, isRetryable, MAX_RETRIES, BASE_RETRY_DELAY } from './client'
import { getApiUrl } from '../api-config'
import { netFetch } from '../net'
import type { ActiveCall, CallRecord, UserPresence } from '@protocol/schemas'

export type { ActiveCall, UserPresence }
export type { CallRecord }

// --- Calls ---

/** A call together with the hub it belongs to — every hub action is scoped by it. */
export type HubCall = ActiveCall & { hubId: string }

/**
 * List the active calls of ONE hub, tagging each with that hub. Callers that
 * cover every member hub fan this out per hub; the active hub is irrelevant.
 */
export async function listActiveCalls(hubId: string): Promise<{ calls: HubCall[] }> {
  const { calls } = await request<{ calls: ActiveCall[] }>(hubPath(hubId, '/calls/active'))
  return { calls: calls.map(call => ({ ...call, hubId })) }
}

export async function getCallHistory(params?: { page?: number; limit?: number; search?: string; dateFrom?: string; dateTo?: string; status?: 'completed' | 'unanswered' }) {
  const qs = new URLSearchParams()
  if (params?.page) qs.set('page', String(params.page))
  if (params?.limit) qs.set('limit', String(params.limit))
  if (params?.search) qs.set('search', params.search)
  if (params?.dateFrom) qs.set('dateFrom', params.dateFrom)
  if (params?.dateTo) qs.set('dateTo', params.dateTo)
  if (params?.status) qs.set('status', params.status)
  return request<{ calls: CallRecord[]; total: number }>(hp(`/calls/history?${qs}`))
}

// --- Call Actions (REST) ---
// Always scoped to the call's own hub (never the active hub): the server matches
// callId AND hubId, so acting on hub B's call through hub A's path 404s.

export async function answerCall(callId: string, hubId: string) {
  return request<{ call: ActiveCall }>(hubPath(hubId, `/calls/${callId}/answer`), { method: 'POST' })
}

export async function hangupCall(callId: string, hubId: string) {
  return request<{ call: ActiveCall }>(hubPath(hubId, `/calls/${callId}/hangup`), { method: 'POST' })
}

export async function reportCallSpam(callId: string, hubId: string) {
  return request<{ callId: string; callerNumber: string | null; reportedBy: string }>(hubPath(hubId, `/calls/${callId}/spam`), { method: 'POST' })
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
      const res = await netFetch(getApiUrl(hp(`/calls/${callId}/recording`)), { headers, signal: controller.signal })
      if (!res.ok) {
        if (res.status === 401 && 'Authorization' in headers) {
          if (attempt < MAX_RETRIES) continue
          notifyAuthExpired()
        }
        const err = new ApiError(res.status, await res.text())
        if (isRetryable(res.status) && attempt < MAX_RETRIES) continue
        throw err
      }
      notifyApiActivity()
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
