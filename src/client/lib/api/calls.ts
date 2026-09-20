import { request, hp, getAuthHeaders, notifyAuthExpired, notifyApiActivity, ApiError, NetworkError, isRetryable, MAX_RETRIES, BASE_RETRY_DELAY } from './client'
import { getApiUrl } from '../api-config'
import { netFetch } from '../net'
import type { ActiveCall, CallRecord, UserPresence } from '@protocol/schemas'

export type { ActiveCall, UserPresence }
export type { CallRecord }

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
