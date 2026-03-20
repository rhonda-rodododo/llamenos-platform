import { z } from 'zod'
import { pubkeySchema, paginationSchema, recipientEnvelopeSchema } from './common'

// --- Response schemas ---

export const reportResponseSchema = z.object({
  id: z.string(),
  title: z.string(),
  category: z.string().optional(),
  reportTypeId: z.string().optional(),
  status: z.enum(['waiting', 'active', 'closed']),
  encryptedContent: z.string(),
  readerEnvelopes: z.array(recipientEnvelopeSchema),
  createdBy: z.string(),
  assignedTo: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  messageCount: z.number().optional(),
})

export const reportMessageResponseSchema = z.object({
  id: z.string(),
  reportId: z.string(),
  encryptedContent: z.string(),
  readerEnvelopes: z.array(recipientEnvelopeSchema),
  authorPubkey: z.string(),
  attachmentIds: z.array(z.string()).optional(),
  createdAt: z.string(),
})

export const conversionStatusEnum = z.enum(['pending', 'in_progress', 'completed'])

// --- List/wrapper response schemas ---

export const reportListResponseSchema = z.object({
  conversations: z.array(z.object({
    id: z.string(),
    createdAt: z.string(),
  })),
  total: z.number(),
})

export const reportCategoriesResponseSchema = z.object({
  categories: z.array(z.string()),
})

export const reportFilesResponseSchema = z.object({
  files: z.array(z.object({
    id: z.string(),
    name: z.string(),
    size: z.number().optional(),
    mimeType: z.string().optional(),
  })),
})

export const reportLinkedCasesResponseSchema = z.object({
  records: z.array(z.object({
    reportId: z.string(),
    caseId: z.string(),
    linkedAt: z.string(),
    linkedBy: z.string(),
    encryptedNotes: z.string().optional(),
  })),
  total: z.number(),
})

// --- Input schemas ---

export const listReportsQuerySchema = paginationSchema.extend({
  status: z.string().optional(),
  category: z.string().optional(),
  conversionEnabled: z.coerce.boolean().optional(),
  conversionStatus: conversionStatusEnum.optional(),
})

export const createReportBodySchema = z.looseObject({
  title: z.string().min(1).max(500),
  category: z.string().optional(),
  reportTypeId: z.string().optional(),
  encryptedContent: z.string().min(1, 'Report content is required'),
  readerEnvelopes: z.array(recipientEnvelopeSchema).min(1, 'At least one reader envelope required'),
})

export const reportMessageBodySchema = z.looseObject({
  encryptedContent: z.string().min(1, 'encryptedContent is required'),
  readerEnvelopes: z.array(recipientEnvelopeSchema).min(1, 'At least one reader envelope required'),
  attachmentIds: z.array(z.string()).optional(),
})

export const assignReportBodySchema = z.looseObject({
  assignedTo: pubkeySchema,
})

export const updateReportBodySchema = z.looseObject({
  status: z.enum(['waiting', 'active', 'closed']).optional(),
  conversionStatus: conversionStatusEnum.optional(),
})
