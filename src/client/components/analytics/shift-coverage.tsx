import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { ShiftMetricsResponse } from '@protocol/schemas/analytics'

interface ShiftCoverageProps {
  data?: ShiftMetricsResponse
  loading: boolean
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function ShiftCoverage({ data, loading }: ShiftCoverageProps) {
  const { t } = useTranslation()

  if (!loading && (!data || data.coverageSlots.length === 0)) {
    return (
      <Card>
        <CardHeader><CardTitle>{t('analytics.shifts.title')}</CardTitle></CardHeader>
        <CardContent><p className="text-muted-foreground">{t('analytics.shifts.noData')}</p></CardContent>
      </Card>
    )
  }

  // Group slots by day
  const coverageSlots = data?.coverageSlots ?? []
  const slotsByDay = new Map<number, typeof coverageSlots>()
  for (const slot of coverageSlots) {
    const existing = slotsByDay.get(slot.dayOfWeek) ?? []
    existing.push(slot)
    slotsByDay.set(slot.dayOfWeek, existing)
  }

  return (
    <Card data-testid="shift-coverage">
      <CardHeader>
        <CardTitle>{t('analytics.shifts.title')}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {data?.weeklyHoursCovered ?? 0}h/week · {data?.totalVolunteersScheduled ?? 0} volunteers
        </p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-32 animate-pulse rounded bg-muted" />
        ) : (
          <div className="grid grid-cols-7 gap-1">
            {DAY_LABELS.map((label, dayIndex) => {
              const slots = slotsByDay.get(dayIndex) ?? []
              const covered = slots.some((s) => s.isCovered)
              return (
                <div key={dayIndex} className="text-center">
                  <p className="mb-1 text-xs font-medium">{label}</p>
                  <div
                    className={`rounded p-2 text-xs ${
                      slots.length === 0
                        ? 'bg-muted text-muted-foreground'
                        : covered
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                    }`}
                  >
                    {slots.length === 0
                      ? '—'
                      : slots.map((s) => `${s.startTime}–${s.endTime}`).join(', ')}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
