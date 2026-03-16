import { z } from 'zod'
import { fileKeyEnvelopeSchema, encryptedMetadataEntrySchema } from './common'

// --- Response schemas ---

export const uploadResponseSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  totalSize: z.number(),
  totalChunks: z.number(),
  completedChunks: z.number().optional(),
  status: z.enum(['pending', 'uploading', 'complete', 'failed']),
  recipientEnvelopes: z.array(fileKeyEnvelopeSchema).optional(),
  encryptedMetadata: z.array(encryptedMetadataEntrySchema).optional(),
  createdAt: z.string().optional(),
  completedAt: z.string().optional(),
})

// --- Input schemas ---

export const uploadInitBodySchema = z.looseObject({
  totalSize: z.number().int().min(1),
  totalChunks: z.number().int().min(1).max(10000),
  conversationId: z.string().min(1, 'conversationId is required'),
  recipientEnvelopes: z.array(fileKeyEnvelopeSchema).optional(),
  encryptedMetadata: z.array(encryptedMetadataEntrySchema).optional(),
})
