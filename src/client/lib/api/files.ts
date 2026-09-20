import { request, getAuthHeaders, notifyAuthExpired, notifyApiActivity, ApiError, NetworkError, isRetryable, MAX_RETRIES, BASE_RETRY_DELAY } from './client'
import { getApiUrl } from '../api-config'
import { netFetch } from '../net'

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
      const res = await netFetch(getApiUrl(`/uploads/${uploadId}/chunks/${chunkIndex}`), {
        method: 'PUT',
        headers,
        body: data,
        signal: controller.signal,
      })
      if (!res.ok) {
        if (res.status === 401 && 'Authorization' in headers) {
          if (attempt < maxRetries) { lastError = new ApiError(res.status, await res.text()); continue }
          notifyAuthExpired()
        }
        const err = new ApiError(res.status, await res.text())
        if (isRetryable(res.status) && attempt < maxRetries) { lastError = err; continue }
        throw err
      }
      notifyApiActivity()
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
      const headers: Record<string, string> = await getAuthHeaders('GET', `/files/${fileId}/content`)
      const res = await netFetch(getApiUrl(`/files/${fileId}/content`), { headers, signal: controller.signal })
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
  throw new Error('Download failed')
}

export async function getFileEnvelopes(fileId: string) {
  return request<{ envelopes: import('@shared/types').FileKeyEnvelope[] }>(`/files/${fileId}/envelopes`)
}

export async function getFileMetadata(fileId: string) {
  return request<{ metadata: Array<{ pubkey: string; encryptedContent: string; enc: string; ct: string }> }>(`/files/${fileId}/metadata`)
}

export async function shareFile(fileId: string, data: {
  envelope: import('@shared/types').FileKeyEnvelope
  encryptedMetadata: { pubkey: string; encryptedContent: string; enc: string; ct: string }
}) {
  return request<{ ok: true }>(`/files/${fileId}/share`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}
