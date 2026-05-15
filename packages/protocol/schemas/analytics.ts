import { z } from 'zod'

// --- Query schemas ---

export const analyticsDateRangeQuerySchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
})

// --- Response schemas ---

export const callPeriodMetricsSchema = z.object({
  period: z.string(),
  total: z.number(),
  answered: z.number(),
  unanswered: z.number(),
  abandoned: z.number(),
})

export const callMetricsResponseSchema = z.object({
  totalCalls: z.number(),
  answeredCalls: z.number(),
  unansweredCalls: z.number(),
  abandonedCalls: z.number(),
  answerRate: z.number(),
  avgDurationSeconds: z.number(),
  byPeriod: z.array(callPeriodMetricsSchema),
})

export const channelMetricsSchema = z.object({
  channel: z.string(),
  total: z.number(),
  active: z.number(),
  messages: z.number(),
})

export const conversationMetricsResponseSchema = z.object({
  totalConversations: z.number(),
  activeConversations: z.number(),
  waitingConversations: z.number(),
  closedConversations: z.number(),
  totalMessages: z.number(),
  avgMessagesPerConversation: z.number(),
  avgResponseTimeSeconds: z.number().nullable(),
  byChannel: z.array(channelMetricsSchema),
})

export const coverageSlotSchema = z.object({
  date: z.string(),
  dayOfWeek: z.number(),
  startTime: z.string(),
  endTime: z.string(),
  volunteerCount: z.number(),
  isCovered: z.boolean(),
})

export const shiftMetricsResponseSchema = z.object({
  totalShifts: z.number(),
  totalVolunteersScheduled: z.number(),
  weeklyHoursCovered: z.number(),
  coverageSlots: z.array(coverageSlotSchema),
})

export const analyticsServiceStatusSchema = z.object({
  name: z.string(),
  status: z.enum(['ok', 'degraded', 'unknown']),
  detail: z.string().optional(),
})

export const analyticsSystemHealthResponseSchema = z.object({
  activeCallCount: z.number(),
  waitingConversationCount: z.number(),
  activeVolunteerCount: z.number(),
  services: z.array(analyticsServiceStatusSchema),
})

// --- Hourly distribution ---

export const callHourBucketSchema = z.object({
  hour: z.number().int().min(0).max(23),
  count: z.number().int(),
})

export const hourlyDistributionResponseSchema = z.object({
  totalCalls: z.number().int(),
  buckets: z.array(callHourBucketSchema),
})

// --- Per-user stats ---

export const userStatEntrySchema = z.object({
  pubkey: z.string(),
  displayName: z.string().nullable(),
  callsAnswered: z.number().int(),
  avgDurationSeconds: z.number(),
  notesCreated: z.number().int(),
})

export const userStatsResponseSchema = z.object({
  users: z.array(userStatEntrySchema),
})

// --- Personal stats ---

export const personalStatsResponseSchema = z.object({
  callsToday: z.number().int(),
  callsThisPeriod: z.number().int(),
  avgDurationSeconds: z.number(),
  notesCreatedThisPeriod: z.number().int(),
})

// --- Inferred types ---

export type CallMetricsResponse = z.infer<typeof callMetricsResponseSchema>
export type ConversationMetricsResponse = z.infer<typeof conversationMetricsResponseSchema>
export type ShiftMetricsResponse = z.infer<typeof shiftMetricsResponseSchema>
export type AnalyticsSystemHealthResponse = z.infer<typeof analyticsSystemHealthResponseSchema>
export type HourlyDistributionResponse = z.infer<typeof hourlyDistributionResponseSchema>
export type UserStatsResponse = z.infer<typeof userStatsResponseSchema>
export type PersonalStatsResponse = z.infer<typeof personalStatsResponseSchema>
