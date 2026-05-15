import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import type { CallMetricsResponse } from '@protocol/schemas/analytics'

interface CallVolumeChartProps {
  data?: CallMetricsResponse['byPeriod']
  loading: boolean
}

export function CallVolumeChart({ data, loading }: CallVolumeChartProps) {
  const { t } = useTranslation()

  if (!loading && (!data || data.length === 0)) {
    return (
      <Card>
        <CardHeader><CardTitle>{t('analytics.callVolume.title')}</CardTitle></CardHeader>
        <CardContent><p className="text-muted-foreground">{t('analytics.callVolume.noData')}</p></CardContent>
      </Card>
    )
  }

  return (
    <Card data-testid="call-volume-chart">
      <CardHeader><CardTitle>{t('analytics.callVolume.title')}</CardTitle></CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-64 animate-pulse rounded bg-muted" />
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data}>
              <XAxis
                dataKey="period"
                tickFormatter={(d: string) => new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                fontSize={12}
              />
              <YAxis allowDecimals={false} fontSize={12} />
              <Tooltip />
              <Legend />
              <Bar dataKey="answered" stackId="a" fill="#22c55e" name={t('analytics.callVolume.answered')} />
              <Bar dataKey="unanswered" stackId="a" fill="#f59e0b" name={t('analytics.callVolume.unanswered')} />
              <Bar dataKey="abandoned" stackId="a" fill="#ef4444" name={t('analytics.callVolume.abandoned')} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}
