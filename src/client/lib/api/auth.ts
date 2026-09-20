import { request, ApiError, NetworkError, REQUEST_TIMEOUT_MS } from './client'
import { getApiUrl } from '../api-config'
import { netFetch } from '../net'

// --- Auth ---

export async function login(pubkey: string, timestamp: number, token: string) {
  return request<{ ok: true; roles: string[] }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ pubkey, timestamp, token }),
  })
}

export async function bootstrapAdmin(pubkey: string, timestamp: number, token: string, nonce?: string) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await netFetch(getApiUrl('/auth/bootstrap'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pubkey, timestamp, token, ...(nonce ? { nonce } : {}) }),
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
  return request<{ pubkey: string; roles: string[]; permissions: string[]; primaryRole: { id: string; name: string; slug: string } | null; name: string; transcriptionEnabled: boolean; spokenLanguages: string[]; uiLanguage: string; profileCompleted: boolean; onBreak: boolean; callPreference: 'phone' | 'browser' | 'both'; webauthnRequired: boolean; webauthnRegistered: boolean; adminDecryptionPubkey: string; serverEventKeyHex?: string; serverEventKeyPrevHex?: string; eventKeyEpoch?: number; eventKeyEpochDuration?: number }>('/auth/me')
}
