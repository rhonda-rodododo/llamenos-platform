import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import type { HourlyDistributionResponse } from '@protocol/schemas/analytics'

interface HourlyChartProps {
  data?: HourlyDistributionResponse['buckets']
  loading: boolean
}

function formatHour(hour: number): string {
  if (hour === 0) return '12am'
  if (hour < 12) return `${hour}am`
  if (hour === 12) return '12pm'
  return `${hour - 12}pm`
}

export function HourlyChart({ data, loading }: HourlyChartProps) {
  const { t } = useTranslation()

  if (!loading && (!data || data.every((b) => b.count === 0))) {
    return (
      <Card>
        <CardHeader><CardTitle>{t('analytics.hours.title')}</CardTitle></CardHeader>
        <CardContent><p className="text-muted-foreground">{t('analytics.hours.noData')}</p></CardContent>
      </Card>
    )
  }

  return (
    <Card data-testid="hourly-chart">
      <CardHeader><CardTitle>{t('analytics.hours.title')}</CardTitle></CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-64 animate-pulse rounded bg-muted" />
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data} layout="vertical">
              <XAxis type="number" allowDecimals={false} fontSize={12} />
              <YAxis
                type="category"
                dataKey="hour"
                tickFormatter={formatHour}
                fontSize={11}
                width={45}
              />
              <Tooltip labelFormatter={(label: React.ReactNode) => formatHour(Number(label))} />
              <Bar dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}
