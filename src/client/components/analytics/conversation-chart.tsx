import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import type { ConversationMetricsResponse } from '@protocol/schemas/analytics'

interface ConversationChartProps {
  data?: ConversationMetricsResponse
  loading: boolean
}

function formatSeconds(seconds: number | null): string {
  if (seconds == null) return '—'
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

export function ConversationChart({ data, loading }: ConversationChartProps) {
  const { t } = useTranslation()

  if (!loading && (!data || data.totalConversations === 0)) {
    return (
      <Card>
        <CardHeader><CardTitle>{t('analytics.conversations.title')}</CardTitle></CardHeader>
        <CardContent><p className="text-muted-foreground">{t('analytics.conversations.noData')}</p></CardContent>
      </Card>
    )
  }

  return (
    <Card data-testid="conversation-chart">
      <CardHeader><CardTitle>{t('analytics.conversations.title')}</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-6 text-sm">
          <div>
            <span className="text-muted-foreground">{t('analytics.conversations.avgResponseTime')}: </span>
            <span className="font-medium">{formatSeconds(data?.avgResponseTimeSeconds ?? null)}</span>
          </div>
          <div>
            <span className="text-muted-foreground">{t('analytics.conversations.avgMessages')}: </span>
            <span className="font-medium">{data?.avgMessagesPerConversation ?? 0}</span>
          </div>
        </div>
        {loading ? (
          <div className="h-48 animate-pulse rounded bg-muted" />
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data?.byChannel}>
              <XAxis dataKey="channel" fontSize={12} />
              <YAxis allowDecimals={false} fontSize={12} />
              <Tooltip />
              <Bar dataKey="messages" fill="#06b6d4" radius={[4, 4, 0, 0]} name="Messages" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}
