import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '@/components/ui/card'
import { Phone, Clock, MessageSquare, Percent } from 'lucide-react'
import type { CallMetricsResponse, ConversationMetricsResponse } from '@protocol/schemas/analytics'

interface KpiCardsProps {
  callMetrics?: CallMetricsResponse
  conversationMetrics?: ConversationMetricsResponse
  loading: boolean
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

function formatRate(rate: number): string {
  return `${Math.round(rate * 100)}%`
}

export function KpiCards({ callMetrics, conversationMetrics, loading }: KpiCardsProps) {
  const { t } = useTranslation()

  const kpis = [
    {
      label: t('analytics.summary.totalCalls'),
      value: callMetrics?.totalCalls ?? 0,
      icon: Phone,
    },
    {
      label: t('analytics.summary.answerRate'),
      value: formatRate(callMetrics?.answerRate ?? 0),
      icon: Percent,
    },
    {
      label: t('analytics.summary.avgDuration'),
      value: formatDuration(callMetrics?.avgDurationSeconds ?? 0),
      icon: Clock,
    },
    {
      label: t('analytics.summary.totalConversations'),
      value: conversationMetrics?.totalConversations ?? 0,
      icon: MessageSquare,
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4" data-testid="kpi-cards">
      {kpis.map((kpi) => (
        <Card key={kpi.label}>
          <CardContent className="flex items-center gap-3 p-4">
            <kpi.icon className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="text-2xl font-bold">{loading ? '—' : kpi.value}</p>
              <p className="text-xs text-muted-foreground">{kpi.label}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
