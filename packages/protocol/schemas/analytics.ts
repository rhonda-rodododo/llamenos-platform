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

// --- Inferred types ---

export type CallMetricsResponse = z.infer<typeof callMetricsResponseSchema>
export type ConversationMetricsResponse = z.infer<typeof conversationMetricsResponseSchema>
export type ShiftMetricsResponse = z.infer<typeof shiftMetricsResponseSchema>
export type AnalyticsSystemHealthResponse = z.infer<typeof analyticsSystemHealthResponseSchema>
