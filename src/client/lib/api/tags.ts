import { request, hp } from './client'
import type { TagResponse } from '@protocol/schemas'

// ---------------------------------------------------------------------------
// Tags API
// ---------------------------------------------------------------------------

export async function listTags(): Promise<{ tags: TagResponse[] }> {
  return request<{ tags: TagResponse[] }>(hp('/tags'))
}

export async function createTag(body: {
  id: string
  name: string
  encryptedLabel: string
  color?: string
  encryptedCategory?: string
}): Promise<TagResponse> {
  return request<TagResponse>(hp('/tags'), { method: 'POST', body: JSON.stringify(body) })
}

export async function updateTag(tagId: string, body: {
  encryptedLabel?: string
  color?: string
  encryptedCategory?: string | null
}): Promise<TagResponse> {
  return request<TagResponse>(hp(`/tags/${tagId}`), { method: 'PATCH', body: JSON.stringify(body) })
}

export async function deleteTag(tagId: string): Promise<{ removedFromContacts: number }> {
  return request<{ removedFromContacts: number }>(hp(`/tags/${tagId}`), { method: 'DELETE' })
}
