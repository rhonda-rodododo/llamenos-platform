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
