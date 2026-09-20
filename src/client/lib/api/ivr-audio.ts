import { request, getAuthHeaders, notifyAuthExpired, notifyApiActivity, ApiError, NetworkError } from './client'
import { getApiUrl } from '../api-config'
import { netFetch } from '../net'
import type { IvrAudioRecording } from '@protocol/schemas'

export type { IvrAudioRecording }

// --- IVR Audio ---

export async function listIvrAudio() {
  return request<{ recordings: IvrAudioRecording[] }>('/settings/ivr-audio')
}

export async function uploadIvrAudio(promptType: string, language: string, audioBlob: Blob) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30_000)
  try {
    const headers = {
      ...await getAuthHeaders('PUT', `/settings/ivr-audio/${promptType}/${language}`),
      'Content-Type': audioBlob.type || 'audio/webm',
    }
    const res = await netFetch(getApiUrl(`/settings/ivr-audio/${promptType}/${language}`), {
      method: 'PUT',
      headers,
      body: audioBlob,
      signal: controller.signal,
    })
    if (!res.ok) {
      if (res.status === 401 && 'Authorization' in headers) notifyAuthExpired()
      throw new ApiError(res.status, await res.text())
    }
    notifyApiActivity()
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

// NOTE: this returns a literal URL for an <audio>/<img>-style `src`, not a
// fetch() call — it is NOT routed through netFetch. Against a remote backend
// this also needs a CSP `media-src`/`img-src` allowance or a blob-URL rework
// (fetch via netFetch, then `URL.createObjectURL`) — tracked as a follow-up
// to #738/#739; same-origin dev/test playback is unaffected.
export function getIvrAudioUrl(promptType: string, language: string) {
  return getApiUrl(`/ivr-audio/${promptType}/${language}`)
}
