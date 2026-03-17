import { z } from 'zod'
import { paginationSchema, fileKeyEnvelopeSchema, encryptedMetadataEntrySchema } from './common'

// --- Input schemas ---

export const listFilesQuerySchema = paginationSchema

export const shareFileBodySchema = z.object({
  envelope: fileKeyEnvelopeSchema,
  encryptedMetadata: encryptedMetadataEntrySchema,
})

// --- Response schemas ---

export const fileEnvelopesResponseSchema = z.object({
  envelopes: z.array(z.looseObject({ pubkey: z.string() })),
})

export const fileMetadataResponseSchema = z.object({
  metadata: z.array(z.looseObject({ pubkey: z.string() })),
})

export const fileResponseSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  totalSize: z.number(),
  totalChunks: z.number(),
  completedChunks: z.number().optional(),
  status: z.enum(['pending', 'uploading', 'complete', 'failed']),
  recipientEnvelopes: z.array(fileKeyEnvelopeSchema),
  encryptedMetadata: z.array(encryptedMetadataEntrySchema),
  sharedWith: z.array(z.string()).optional(),
  createdAt: z.string().optional(),
  completedAt: z.string().optional(),
})
