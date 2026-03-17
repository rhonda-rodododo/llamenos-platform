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

export const uploadInitResponseSchema = z.object({
  uploadId: z.string(),
  totalChunks: z.number(),
})

export const chunkUploadResponseSchema = z.object({
  chunkIndex: z.number(),
  completedChunks: z.number(),
  totalChunks: z.number(),
})

export const uploadCompleteResponseSchema = z.object({
  fileId: z.string(),
  status: z.string(),
})

export const uploadStatusResponseSchema = z.object({
  uploadId: z.string(),
  status: z.string(),
  completedChunks: z.number(),
  totalChunks: z.number(),
  totalSize: z.number(),
})
