import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useAuth } from '@/lib/auth'
import { useTranslation } from 'react-i18next'
import {
  usePlatformCallMetrics,
  usePlatformConversationMetrics,
  usePlatformHourlyDistribution,
  usePlatformUserStats,
  type DateRange,
} from '@/lib/queries/analytics'
import { DateRangeSelector } from '@/components/analytics/date-range-selector'
import { KpiCards } from '@/components/analytics/kpi-cards'
import { CallVolumeChart } from '@/components/analytics/call-volume-chart'
import { HourlyChart } from '@/components/analytics/hourly-chart'
import { ConversationChart } from '@/components/analytics/conversation-chart'
import { UserStatsTable } from '@/components/analytics/user-stats-table'
import { Badge } from '@/components/ui/badge'

export const Route = createFileRoute('/admin/platform-analytics')({
  component: PlatformAnalyticsPage,
})

function PlatformAnalyticsPage() {
  const { t } = useTranslation()
  const { hasPermission } = useAuth()
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined)

  const enabled = hasPermission('system:manage-hubs') // super-admin
  const callMetrics = usePlatformCallMetrics(dateRange, enabled)
  const conversationMetrics = usePlatformConversationMetrics(dateRange, enabled)
  const hourly = usePlatformHourlyDistribution(dateRange, enabled)
  const userStats = usePlatformUserStats(dateRange, enabled)

  if (!enabled) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        {t('common.accessDenied')}
      </div>
    )
  }

  const loading = callMetrics.isLoading || conversationMetrics.isLoading

  return (
    <div className="space-y-6" data-testid="platform-analytics-page">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold">{t('analytics.platform.title')}</h1>
          <Badge variant="outline">{t('analytics.platform.crossHub')}</Badge>
        </div>
        <DateRangeSelector value={dateRange} onChange={setDateRange} />
      </div>

      <KpiCards callMetrics={callMetrics.data} conversationMetrics={conversationMetrics.data} loading={loading} />

      <div className="grid gap-6 lg:grid-cols-2">
        <CallVolumeChart data={callMetrics.data?.byPeriod} loading={callMetrics.isLoading} />
        <HourlyChart data={hourly.data?.buckets} loading={hourly.isLoading} />
      </div>

      <ConversationChart data={conversationMetrics.data} loading={conversationMetrics.isLoading} />
      <UserStatsTable data={userStats.data?.users} loading={userStats.isLoading} />
    </div>
  )
}
