import { z } from 'zod'
import { pubkeySchema, recipientEnvelopeSchema, keyEnvelopeSchema } from './common'

// --- Shared envelopes ---

export const paginatedMeta = {
  total: z.number(),
  page: z.number(),
  limit: z.number(),
}

// --- Auth ---

export const loginResponseSchema = z.object({
  ok: z.boolean(),
  roles: z.array(z.string()),
})

export const meResponseSchema = z.object({
  pubkey: pubkeySchema,
  roles: z.array(z.string()),
  permissions: z.array(z.string()),
  primaryRole: z.object({ id: z.string(), name: z.string(), slug: z.string() }).nullable(),
  name: z.string(),
  transcriptionEnabled: z.boolean(),
  spokenLanguages: z.array(z.string()),
  uiLanguage: z.string(),
  profileCompleted: z.boolean(),
  onBreak: z.boolean(),
  callPreference: z.string(),
  webauthnRequired: z.boolean(),
  webauthnRegistered: z.boolean(),
  adminDecryptionPubkey: z.string().optional(),
  serverEventKeyHex: z.string().optional(),
})

// --- Notes ---

export const noteResponseSchema = z.object({
  id: z.string().uuid(),
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

// --- Volunteers ---

export const volunteerResponseSchema = z.object({
  pubkey: pubkeySchema,
  name: z.string(),
  phone: z.string().optional(),
  roles: z.array(z.string()),
  active: z.boolean(),
  transcriptionEnabled: z.boolean().optional(),
  spokenLanguages: z.array(z.string()).optional(),
  uiLanguage: z.string().optional(),
  profileCompleted: z.boolean().optional(),
  onBreak: z.boolean().optional(),
  callPreference: z.string().optional(),
})

// --- Shifts ---

export const shiftResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  days: z.array(z.number()),
  volunteerPubkeys: z.array(z.string()),
  createdAt: z.string(),
})

// --- Calls ---

export const callRecordResponseSchema = z.object({
  id: z.string(),
  callerLast4: z.string().optional(),
  answeredBy: z.string().optional(),
  startedAt: z.string(),
  endedAt: z.string().optional(),
  duration: z.number().optional(),
  status: z.string(),
  hasTranscription: z.boolean().optional(),
  hasVoicemail: z.boolean().optional(),
  hasRecording: z.boolean().optional(),
})

// --- Conversations ---

export const conversationResponseSchema = z.object({
  id: z.string(),
  channelType: z.string(),
  contactIdentifierHash: z.string(),
  contactLast4: z.string().optional(),
  assignedTo: z.string().optional(),
  status: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  lastMessageAt: z.string().optional(),
  messageCount: z.number(),
})

export const messageResponseSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  direction: z.string(),
  authorPubkey: z.string().optional(),
  encryptedContent: z.string(),
  readerEnvelopes: z.array(recipientEnvelopeSchema),
  createdAt: z.string(),
  status: z.string().optional(),
})

// --- Generic success ---

export const okResponseSchema = z.object({ ok: z.boolean() })
