import { z } from 'zod'
import { recipientEnvelopeSchema, paginationSchema } from './common'

// --- Record (stored in CaseDO) ---

export const recordSchema = z.object({
  id: z.string().uuid(),
  hubId: z.string(),
  entityTypeId: z.string().uuid(),
  caseNumber: z.string().optional(),

  // --- Blind indexes (server-filterable) ---
  statusHash: z.string(),
  severityHash: z.string().optional(),
  categoryHash: z.string().optional(),
  assignedTo: z.array(z.string()),
  blindIndexes: z.record(z.string(), z.union([z.string(), z.array(z.string())])),

  // --- E2EE 3-tier content ---
  encryptedSummary: z.string(),
  summaryEnvelopes: z.array(recipientEnvelopeSchema).min(1),

  encryptedFields: z.string().optional(),
  fieldEnvelopes: z.array(recipientEnvelopeSchema).optional(),

  encryptedPII: z.string().optional(),
  piiEnvelopes: z.array(recipientEnvelopeSchema).optional(),

  // --- Relationships ---
  contactCount: z.number(),
  interactionCount: z.number(),
  fileCount: z.number(),
  eventIds: z.array(z.string()),
  parentRecordId: z.string().uuid().optional(),

  // --- Timestamps ---
  createdAt: z.string(),
  updatedAt: z.string(),
  closedAt: z.string().optional(),
  createdBy: z.string(),
})

export type CaseRecord = z.infer<typeof recordSchema>

// --- Create record body ---

export const createRecordBodySchema = z.object({
  entityTypeId: z.string().uuid(),
  statusHash: z.string(),
  severityHash: z.string().optional(),
  categoryHash: z.string().optional(),
  assignedTo: z.array(z.string()).default([]),
  blindIndexes: z.record(z.string(), z.union([z.string(), z.array(z.string())])).default({}),
  encryptedSummary: z.string().min(1),
  summaryEnvelopes: z.array(recipientEnvelopeSchema).min(1),
  encryptedFields: z.string().optional(),
  fieldEnvelopes: z.array(recipientEnvelopeSchema).optional(),
  encryptedPII: z.string().optional(),
  piiEnvelopes: z.array(recipientEnvelopeSchema).optional(),
  parentRecordId: z.string().uuid().optional(),
  contactLinks: z.array(z.object({
    contactId: z.string().uuid(),
    role: z.string(),
  })).optional(),
})

export type CreateRecordBody = z.infer<typeof createRecordBodySchema>

// --- Update record body (partial, with optional status change interaction metadata) ---

export const updateRecordBodySchema = createRecordBodySchema.partial().extend({
  // Status change interaction metadata (Epic 323) — when statusHash changes,
  // these fields let the client provide encrypted content for the auto-created
  // status_change interaction in the case timeline.
  statusChangeTypeHash: z.string().optional(),
  statusChangeContent: z.string().optional(),
  statusChangeEnvelopes: z.array(recipientEnvelopeSchema).optional(),
})

export type UpdateRecordBody = z.infer<typeof updateRecordBodySchema>

// --- List records query (pagination + filters) ---

export const listRecordsQuerySchema = paginationSchema.extend({
  entityTypeId: z.string().optional(),
  statusHash: z.string().optional(),
  severityHash: z.string().optional(),
  assignedTo: z.string().optional(),
  parentRecordId: z.string().optional(),
})

export type ListRecordsQuery = z.infer<typeof listRecordsQuerySchema>

// --- Record-contact join ---

export const recordContactSchema = z.object({
  recordId: z.string().uuid(),
  contactId: z.string().uuid(),
  role: z.string(),
  addedAt: z.string(),
  addedBy: z.string(),
})

export type RecordContact = z.infer<typeof recordContactSchema>

// --- Link contact to record ---

export const linkContactBodySchema = z.object({
  contactId: z.string().uuid(),
  role: z.string(),
})

export type LinkContactBody = z.infer<typeof linkContactBodySchema>

// --- Assign volunteers ---

export const assignBodySchema = z.object({
  pubkeys: z.array(z.string()).min(1),
})

export type AssignBody = z.infer<typeof assignBodySchema>

// --- Unassign volunteer ---

export const unassignBodySchema = z.object({
  pubkey: z.string().min(1),
})

export type UnassignBody = z.infer<typeof unassignBodySchema>

// --- Encrypted payloads (client-side only, for reference/codegen) ---

/** Summary tier: title, description, status text, severity text, category text */
export const recordSummarySchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  status: z.string(),
  severity: z.string().optional(),
  category: z.string().optional(),
})

export type RecordSummary = z.infer<typeof recordSummarySchema>

/** Custom field values tier */
export const recordFieldValuesSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
)

export type RecordFieldValues = z.infer<typeof recordFieldValuesSchema>

// --- Response schemas for OpenAPI ---

export const recordListResponseSchema = z.object({
  records: z.array(recordSchema),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
  hasMore: z.boolean(),
})

export const recordContactListResponseSchema = z.object({
  contacts: z.array(recordContactSchema),
})
