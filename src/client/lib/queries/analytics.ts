import { useQuery } from '@tanstack/react-query'
import { request } from '@/lib/api'
import type {
  CallMetricsResponse,
  ConversationMetricsResponse,
  ShiftMetricsResponse,
  AnalyticsSystemHealthResponse,
  HourlyDistributionResponse,
  UserStatsResponse,
  PersonalStatsResponse,
} from '@protocol/schemas/analytics'

// ── Types ──

export interface DateRange {
  from: string  // ISO datetime
  to: string    // ISO datetime
}

function dateRangeParams(range?: DateRange): string {
  if (!range) return ''
  const params = new URLSearchParams()
  if (range.from) params.set('from', range.from)
  if (range.to) params.set('to', range.to)
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

// ── Query Keys ──

export const analyticsKeys = {
  callMetrics: (dateRange?: DateRange) => ['analytics', 'calls', dateRange] as const,
  conversationMetrics: (dateRange?: DateRange) => ['analytics', 'conversations', dateRange] as const,
  shiftMetrics: () => ['analytics', 'shifts'] as const,
  systemHealth: () => ['analytics', 'health'] as const,
  hourlyDistribution: (dateRange?: DateRange) => ['analytics', 'hours', dateRange] as const,
  userStats: (dateRange?: DateRange) => ['analytics', 'users', dateRange] as const,
  personal: () => ['analytics', 'personal'] as const,
  platform: {
    callMetrics: (dateRange?: DateRange) => ['analytics', 'platform', 'calls', dateRange] as const,
    conversationMetrics: (dateRange?: DateRange) => ['analytics', 'platform', 'conversations', dateRange] as const,
    hourlyDistribution: (dateRange?: DateRange) => ['analytics', 'platform', 'hours', dateRange] as const,
    userStats: (dateRange?: DateRange) => ['analytics', 'platform', 'users', dateRange] as const,
  },
} as const

// ── Hub-Scoped Hooks ──

export function useCallMetrics(dateRange?: DateRange, enabled = false) {
  return useQuery({
    queryKey: analyticsKeys.callMetrics(dateRange),
    queryFn: () => request<CallMetricsResponse>(`/analytics/calls${dateRangeParams(dateRange)}`),
    enabled,
  })
}

export function useConversationMetrics(dateRange?: DateRange, enabled = false) {
  return useQuery({
    queryKey: analyticsKeys.conversationMetrics(dateRange),
    queryFn: () => request<ConversationMetricsResponse>(`/analytics/conversations${dateRangeParams(dateRange)}`),
    enabled,
  })
}

export function useShiftMetrics(enabled = false) {
  return useQuery({
    queryKey: analyticsKeys.shiftMetrics(),
    queryFn: () => request<ShiftMetricsResponse>('/analytics/shifts'),
    enabled,
  })
}

export function useSystemHealth(enabled = false) {
  return useQuery({
    queryKey: analyticsKeys.systemHealth(),
    queryFn: () => request<AnalyticsSystemHealthResponse>('/analytics/health'),
    staleTime: 30_000, // 30s for real-time-ish health
    enabled,
  })
}

export function useHourlyDistribution(dateRange?: DateRange, enabled = false) {
  return useQuery({
    queryKey: analyticsKeys.hourlyDistribution(dateRange),
    queryFn: () => request<HourlyDistributionResponse>(`/analytics/hours${dateRangeParams(dateRange)}`),
    enabled,
  })
}

export function useUserStats(dateRange?: DateRange, enabled = false) {
  return useQuery({
    queryKey: analyticsKeys.userStats(dateRange),
    queryFn: () => request<UserStatsResponse>(`/analytics/users${dateRangeParams(dateRange)}`),
    enabled,
  })
}

// ── Personal Stats ──

export function usePersonalStats(enabled = true) {
  return useQuery({
    queryKey: analyticsKeys.personal(),
    queryFn: () => request<PersonalStatsResponse>('/analytics/me'),
    staleTime: 60_000, // 1 minute — "calls today" should feel current
    enabled,
  })
}

// ── Platform-Scoped Hooks (super-admin, cross-hub) ──
// These hit the same endpoints but without hub prefix.
// The API client's request() function automatically prefixes hub-scoped paths.

export function usePlatformCallMetrics(dateRange?: DateRange, enabled = false) {
  return useQuery({
    queryKey: analyticsKeys.platform.callMetrics(dateRange),
    queryFn: () => request<CallMetricsResponse>(`/analytics/calls${dateRangeParams(dateRange)}`),
    enabled,
  })
}

export function usePlatformConversationMetrics(dateRange?: DateRange, enabled = false) {
  return useQuery({
    queryKey: analyticsKeys.platform.conversationMetrics(dateRange),
    queryFn: () => request<ConversationMetricsResponse>(`/analytics/conversations${dateRangeParams(dateRange)}`),
    enabled,
  })
}

export function usePlatformHourlyDistribution(dateRange?: DateRange, enabled = false) {
  return useQuery({
    queryKey: analyticsKeys.platform.hourlyDistribution(dateRange),
    queryFn: () => request<HourlyDistributionResponse>(`/analytics/hours${dateRangeParams(dateRange)}`),
    enabled,
  })
}

export function usePlatformUserStats(dateRange?: DateRange, enabled = false) {
  return useQuery({
    queryKey: analyticsKeys.platform.userStats(dateRange),
    queryFn: () => request<UserStatsResponse>(`/analytics/users${dateRangeParams(dateRange)}`),
    enabled,
  })
}
