import { z } from 'zod'
import { paginationSchema, pubkeySchema, recipientEnvelopeSchema, keyEnvelopeSchema } from './common'

// --- Response schemas ---

export const noteResponseSchema = z.object({
  id: z.uuid(),
  callId: z.string().optional(),
  conversationId: z.string().optional(),
  contactHash: z.string().optional(),
  encryptedContent: z.string(),
  authorPubkey: pubkeySchema,
  authorEnvelope: keyEnvelopeSchema.optional(),
  adminEnvelopes: z.array(recipientEnvelopeSchema).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  replyCount: z.number().optional(),
})

// --- Input schemas ---

export const listNotesQuerySchema = paginationSchema.extend({
  callId: z.string().optional(),
  conversationId: z.string().optional(),
  contactHash: z.string().optional(),
})

export const createNoteBodySchema = z.looseObject({
  callId: z.string().optional(),
  conversationId: z.string().optional(),
  contactHash: z.string().optional(),
  encryptedContent: z.string().min(1, 'encryptedContent is required'),
  authorEnvelope: keyEnvelopeSchema.optional(),
  adminEnvelopes: z.array(recipientEnvelopeSchema).optional(),
}).refine(
  data => data.callId || data.conversationId,
  { message: 'callId or conversationId is required' }
)

export const updateNoteBodySchema = z.looseObject({
  encryptedContent: z.string().min(1).optional(),
  authorEnvelope: keyEnvelopeSchema.optional(),
  adminEnvelopes: z.array(recipientEnvelopeSchema).optional(),
})

export const createReplyBodySchema = z.looseObject({
  encryptedContent: z.string().min(1, 'encryptedContent is required'),
  readerEnvelopes: z.array(recipientEnvelopeSchema).min(1, 'At least one reader envelope required'),
})
