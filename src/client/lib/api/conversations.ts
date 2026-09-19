import { request, hp } from './client'
import type { Conversation, ConversationMessage } from '@protocol/schemas'

export type { Conversation, ConversationMessage }

export type MessageDeliveryStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed'

/** @deprecated Import RecipientEnvelope from @shared/types instead. */
export type { RecipientEnvelope as MessageKeyEnvelope } from '@shared/types'

// --- Conversations ---

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
