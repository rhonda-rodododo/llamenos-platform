import { z } from 'zod'
import { paginationSchema, fileKeyEnvelopeSchema, encryptedMetadataEntrySchema } from './common'

// --- Storage/wire types ---

/** Full file record — storage type used by server and client */
export const fileRecordSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  messageId: z.string().optional(),
  uploadedBy: z.string(),
  recipientEnvelopes: z.array(fileKeyEnvelopeSchema),
  encryptedMetadata: z.array(encryptedMetadataEntrySchema),
  totalSize: z.number(),
  totalChunks: z.number(),
  status: z.enum(['uploading', 'complete', 'failed']),
  completedChunks: z.number(),
  createdAt: z.string(),
  completedAt: z.string().optional(),
})
export type FileRecord = z.infer<typeof fileRecordSchema>

/** Upload initialization payload — sent by client to start a chunked upload */
export const uploadInitSchema = z.object({
  totalSize: z.number(),
  totalChunks: z.number(),
  conversationId: z.string(),
  recipientEnvelopes: z.array(fileKeyEnvelopeSchema),
  encryptedMetadata: z.array(encryptedMetadataEntrySchema),
})
export type UploadInit = z.infer<typeof uploadInitSchema>

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
