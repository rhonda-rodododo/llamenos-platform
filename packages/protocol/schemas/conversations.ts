import { z } from 'zod'
import { pubkeySchema, paginationSchema, paginatedMeta, recipientEnvelopeSchema } from './common'

// --- Response schemas ---

export const conversationResponseSchema = z.object({
  id: z.string(),
  channelType: z.string(),
  contactIdentifierHash: z.string(),
  contactLast4: z.string().optional(),
  assignedTo: z.string().optional(),
  status: z.enum(['active', 'waiting', 'closed']).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  lastMessageAt: z.string().optional(),
  messageCount: z.number(),
  metadata: z.object({
    linkedCallId: z.string().optional(),
    reportId: z.string().optional(),
    type: z.literal('report').optional(),
    reportTitle: z.string().optional(),
    reportCategory: z.string().optional(),
    reportTypeId: z.string().optional(),
    customFieldValues: z.string().optional(),
    conversionStatus: z.enum(['pending', 'in_progress', 'completed']).optional(),
  }).optional(),
})

export const messageResponseSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  direction: z.enum(['inbound', 'outbound']).optional(),
  authorPubkey: z.string().optional(),
  encryptedContent: z.string(),
  readerEnvelopes: z.array(recipientEnvelopeSchema),
  createdAt: z.string(),
  status: z.string().optional(),
  hasAttachments: z.boolean().optional(),
  attachmentIds: z.array(z.string()).optional(),
  deliveredAt: z.string().optional(),
  readAt: z.string().optional(),
  failureReason: z.string().optional(),
  retryCount: z.number().optional(),
  externalId: z.string().optional(),
})

// --- List/wrapper response schemas ---

export const conversationListResponseSchema = z.object({
  conversations: z.array(conversationResponseSchema),
  ...paginatedMeta,
})

export const messageListResponseSchema = z.object({
  messages: z.array(messageResponseSchema),
  ...paginatedMeta,
})

// --- Input schemas ---

export const listConversationsQuerySchema = paginationSchema.extend({
  status: z.enum(['waiting', 'active', 'closed']).optional(),
  assignedTo: pubkeySchema.optional(),
  channel: z.enum(['sms', 'whatsapp', 'signal', 'rcs', 'web']).optional(),
  type: z.enum(['report', 'conversation']).optional(),
  contactHash: z.string().optional(),
})

export const sendMessageBodySchema = z.looseObject({
  encryptedContent: z.string().min(1, 'encryptedContent is required'),
  readerEnvelopes: z.array(recipientEnvelopeSchema).min(1, 'At least one reader envelope required'),
  plaintextForSending: z.string().optional(),
})

export const updateConversationBodySchema = z.looseObject({
  status: z.enum(['waiting', 'active', 'closed']).optional(),
  assignedTo: pubkeySchema.optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export const claimConversationBodySchema = z.looseObject({
  pubkey: pubkeySchema,
})

export const createConversationBodySchema = z.looseObject({
  channelType: z.enum(['sms', 'whatsapp', 'signal', 'rcs', 'web']).optional().default('web'),
  contactIdentifierHash: z.string().optional().default(''),
  contactLast4: z.string().max(4).optional(),
  assignedTo: pubkeySchema.optional(),
  status: z.enum(['waiting', 'active', 'closed']).optional().default('waiting'),
  metadata: z.record(z.string(), z.unknown()).optional(),
})
