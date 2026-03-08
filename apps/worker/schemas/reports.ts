import { z } from 'zod'
import { pubkeySchema, paginationSchema, recipientEnvelopeSchema } from './common'

export const listReportsQuerySchema = paginationSchema.extend({
  status: z.string().optional(),
  category: z.string().optional(),
})

export const createReportBodySchema = z.object({
  title: z.string().min(1).max(500),
  category: z.string().optional(),
  reportTypeId: z.string().optional(),
  encryptedContent: z.string().min(1, 'Report content is required'),
  readerEnvelopes: z.array(recipientEnvelopeSchema).min(1, 'At least one reader envelope required'),
}).passthrough()

export const reportMessageBodySchema = z.object({
  encryptedContent: z.string().min(1, 'encryptedContent is required'),
  readerEnvelopes: z.array(recipientEnvelopeSchema).min(1, 'At least one reader envelope required'),
  attachmentIds: z.array(z.string()).optional(),
}).passthrough()

export const assignReportBodySchema = z.object({
  assignedTo: pubkeySchema,
}).passthrough()

export const updateReportBodySchema = z.object({
  status: z.enum(['waiting', 'active', 'closed']).optional(),
}).passthrough()
