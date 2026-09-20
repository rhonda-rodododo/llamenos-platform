import { request, hp } from './client'
import type { AuditLogEntry } from '@protocol/schemas'

export type { AuditLogEntry }

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
