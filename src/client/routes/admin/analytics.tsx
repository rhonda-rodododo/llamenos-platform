import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useAuth } from '@/lib/auth'
import { useTranslation } from 'react-i18next'
import {
  useCallMetrics,
  useConversationMetrics,
  useShiftMetrics,
  useHourlyDistribution,
  useUserStats,
  type DateRange,
} from '@/lib/queries/analytics'
import { DateRangeSelector } from '@/components/analytics/date-range-selector'
import { KpiCards } from '@/components/analytics/kpi-cards'
import { CallVolumeChart } from '@/components/analytics/call-volume-chart'
import { HourlyChart } from '@/components/analytics/hourly-chart'
import { ConversationChart } from '@/components/analytics/conversation-chart'
import { ShiftCoverage } from '@/components/analytics/shift-coverage'
import { UserStatsTable } from '@/components/analytics/user-stats-table'

export const Route = createFileRoute('/admin/analytics')({
  component: AnalyticsPage,
})

function AnalyticsPage() {
  const { t } = useTranslation()
  const { hasPermission } = useAuth()
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined)

  // All queries enabled — page is only rendered when navigated to
  const enabled = hasPermission('audit:read')
  const callMetrics = useCallMetrics(dateRange, enabled)
  const conversationMetrics = useConversationMetrics(dateRange, enabled)
  const shiftMetrics = useShiftMetrics(enabled)
  const hourly = useHourlyDistribution(dateRange, enabled)
  const userStats = useUserStats(dateRange, enabled)

  if (!hasPermission('audit:read')) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        {t('common.accessDenied')}
      </div>
    )
  }

  const loading = callMetrics.isLoading || conversationMetrics.isLoading

  return (
    <div className="space-y-6" data-testid="analytics-page">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold" data-testid="page-title">{t('analytics.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('analytics.description')}</p>
        </div>
        <DateRangeSelector value={dateRange} onChange={setDateRange} />
      </div>

      <KpiCards
        callMetrics={callMetrics.data}
        conversationMetrics={conversationMetrics.data}
        loading={loading}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <CallVolumeChart
          data={callMetrics.data?.byPeriod}
          loading={callMetrics.isLoading}
        />
        <HourlyChart
          data={hourly.data?.buckets}
          loading={hourly.isLoading}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ConversationChart
          data={conversationMetrics.data}
          loading={conversationMetrics.isLoading}
        />
        <ShiftCoverage
          data={shiftMetrics.data}
          loading={shiftMetrics.isLoading}
        />
      </div>

      <UserStatsTable
        data={userStats.data?.users}
        loading={userStats.isLoading}
      />
    </div>
  )
}
