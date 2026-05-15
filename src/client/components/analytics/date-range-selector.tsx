import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { DateRange } from '@/lib/queries/analytics'

type Preset = '7d' | '30d' | 'custom'

interface DateRangeSelectorProps {
  value: DateRange | undefined
  onChange: (range: DateRange | undefined) => void
}

function daysAgo(days: number): DateRange {
  const to = new Date()
  const from = new Date(to)
  from.setDate(from.getDate() - days)
  return { from: from.toISOString(), to: to.toISOString() }
}

export function DateRangeSelector({ value, onChange }: DateRangeSelectorProps) {
  const { t } = useTranslation()
  const [preset, setPreset] = useState<Preset>('30d')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  function selectPreset(p: Preset) {
    setPreset(p)
    if (p === '7d') onChange(daysAgo(7))
    else if (p === '30d') onChange(daysAgo(30))
  }

  function applyCustom() {
    if (customFrom && customTo) {
      onChange({
        from: new Date(customFrom).toISOString(),
        to: new Date(customTo).toISOString(),
      })
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="date-range-selector">
      <Button
        variant={preset === '7d' ? 'default' : 'outline'}
        size="sm"
        onClick={() => selectPreset('7d')}
      >
        {t('analytics.dateRange.7days')}
      </Button>
      <Button
        variant={preset === '30d' ? 'default' : 'outline'}
        size="sm"
        onClick={() => selectPreset('30d')}
      >
        {t('analytics.dateRange.30days')}
      </Button>
      <Button
        variant={preset === 'custom' ? 'default' : 'outline'}
        size="sm"
        onClick={() => setPreset('custom')}
      >
        {t('analytics.dateRange.custom')}
      </Button>
      {preset === 'custom' && (
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="w-36"
          />
          <span className="text-muted-foreground">–</span>
          <Input
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            className="w-36"
          />
          <Button size="sm" onClick={applyCustom}>
            Apply
          </Button>
        </div>
      )}
    </div>
  )
}
