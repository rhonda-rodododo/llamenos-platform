import { z } from 'zod'
import { paginationSchema, paginatedMeta } from './common'

// --- Response schemas ---

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

export const callPresenceResponseSchema = z.object({
  volunteers: z.array(z.object({
    pubkey: z.string(),
    status: z.enum(['available', 'on-call', 'online']),
  })),
})

// --- List/wrapper response schemas ---

export const activeCallsResponseSchema = z.object({
  calls: z.array(callRecordResponseSchema),
})

export const todayCountResponseSchema = z.object({
  count: z.number(),
})

export const callerIdentifyResponseSchema = z.object({
  contact: z.unknown().nullable(),
  activeCaseCount: z.number(),
  recentCases: z.array(z.object({
    id: z.string(),
    caseNumber: z.string().optional(),
    status: z.string(),
  })),
})

export const callActionResponseSchema = z.object({
  call: callRecordResponseSchema,
})

export const banCallResponseSchema = z.object({
  banned: z.boolean(),
  hungUp: z.boolean(),
})

export const callHistoryResponseSchema = z.object({
  calls: z.array(callRecordResponseSchema),
  ...paginatedMeta,
})

// --- Input schemas ---

export const banCallerBodySchema = z.looseObject({
  reason: z.string().max(500).optional(),
})

export const callHistoryQuerySchema = paginationSchema.extend({
  cursor: z.string().optional(),
  search: z.string().max(100).optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').optional(),
})
