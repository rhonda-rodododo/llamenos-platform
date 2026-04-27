import { z } from 'zod'
import { recipientEnvelopeSchema } from './common'

// --- Firehose Connection Status ---

export const firehoseConnectionStatusSchema = z.enum(['pending', 'active', 'paused', 'disabled'])
export type FirehoseConnectionStatus = z.infer<typeof firehoseConnectionStatusSchema>

// --- Firehose Connection Response ---

export const firehoseConnectionSchema = z.object({
  id: z.string(),
  hubId: z.string(),
  signalGroupId: z.string().nullable(),
  displayName: z.string(),
  encryptedDisplayName: z.string().optional(),
  reportTypeId: z.string(),
  agentPubkey: z.string(),
  geoContext: z.string().nullable(),
  geoContextCountryCodes: z.array(z.string()).nullable(),
  inferenceEndpoint: z.string().nullable(),
  extractionIntervalSec: z.number(),
  systemPromptSuffix: z.string().nullable(),
  bufferTtlDays: z.number(),
  notifyViaSignal: z.boolean(),
  status: firehoseConnectionStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type FirehoseConnection = z.infer<typeof firehoseConnectionSchema>

// --- Create Firehose Connection ---

export const createFirehoseConnectionSchema = z.object({
  id: z.uuid().optional(),
  displayName: z.string().optional(),
  encryptedDisplayName: z.string().optional(),
  reportTypeId: z.string(),
  geoContext: z.string().optional(),
  geoContextCountryCodes: z.array(z.string().length(2)).optional(),
  inferenceEndpoint: z.string().url().optional(),
  extractionIntervalSec: z.number().int().min(30).max(300).optional(),
  systemPromptSuffix: z.string().max(2000).optional(),
  bufferTtlDays: z.number().int().min(1).max(30).optional(),
  notifyViaSignal: z.boolean().optional(),
})
export type CreateFirehoseConnectionInput = z.infer<typeof createFirehoseConnectionSchema>

// --- Update Firehose Connection ---

export const updateFirehoseConnectionSchema = z.object({
  displayName: z.string().optional(),
  encryptedDisplayName: z.string().optional(),
  reportTypeId: z.string().optional(),
  geoContext: z.string().nullable().optional(),
  geoContextCountryCodes: z.array(z.string().length(2)).nullable().optional(),
  inferenceEndpoint: z.string().url().nullable().optional(),
  extractionIntervalSec: z.number().int().min(30).max(300).optional(),
  systemPromptSuffix: z.string().max(2000).nullable().optional(),
  bufferTtlDays: z.number().int().min(1).max(30).optional(),
  notifyViaSignal: z.boolean().optional(),
  status: z.enum(['active', 'paused', 'disabled']).optional(),
})
export type UpdateFirehoseConnectionInput = z.infer<typeof updateFirehoseConnectionSchema>

// --- Firehose Connection Health ---

export const firehoseConnectionHealthSchema = z.object({
  id: z.string(),
  status: firehoseConnectionStatusSchema,
  lastMessageReceived: z.string().nullable(),
  lastReportSubmitted: z.string().nullable(),
  bufferSize: z.number(),
  extractionCount: z.number(),
  inferenceHealthMs: z.number().nullable(),
})
export type FirehoseConnectionHealth = z.infer<typeof firehoseConnectionHealthSchema>

// --- Buffer Envelope (E2EE wrapper for buffer messages) ---

export const bufferEnvelopeJsonSchema = z.object({
  encrypted: z.string(),
  envelopes: z.array(recipientEnvelopeSchema),
})
export type BufferEnvelopeJson = z.infer<typeof bufferEnvelopeJsonSchema>

// --- Notification Opt-out ---

export const firehoseOptoutSchema = z.object({
  id: z.string(),
  connectionId: z.string(),
  userId: z.string(),
  optedOutAt: z.string(),
})
export type FirehoseOptout = z.infer<typeof firehoseOptoutSchema>
