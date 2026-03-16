import { z } from 'zod'
import { paginationSchema } from './common'

// --- Input schemas ---

export const listAuditQuerySchema = paginationSchema.extend({
  actorPubkey: z.string().optional(),
  eventType: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  search: z.string().optional(),
})

// --- Response schemas ---

export const auditEntryResponseSchema = z.object({
  id: z.string(),
  event: z.string(),
  actorPubkey: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.string(),
  previousEntryHash: z.string().optional(),
  entryHash: z.string().optional(),
})
