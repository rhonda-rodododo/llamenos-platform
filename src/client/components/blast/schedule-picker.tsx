import { useTranslation } from 'react-i18next'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'

interface SchedulePickerProps {
  value: string
  onChange: (value: string) => void
}

/** Returns an ISO string truncated to minutes, in local datetime-local format */
function toDatetimeLocalValue(isoString: string): string {
  if (!isoString) return ''
  try {
    const d = new Date(isoString)
    const offset = d.getTimezoneOffset() * 60000
    return new Date(d.getTime() - offset).toISOString().slice(0, 16)
  } catch {
    return ''
  }
}

/** Minimum datetime-local value: now + 2 minutes */
function minDatetimeLocal(): string {
  const d = new Date(Date.now() + 2 * 60 * 1000)
  const offset = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - offset).toISOString().slice(0, 16)
}

export function SchedulePicker({ value, onChange }: SchedulePickerProps) {
  const { t } = useTranslation()
  const displayValue = toDatetimeLocalValue(value)

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const localVal = e.target.value
    if (!localVal) {
      onChange('')
      return
    }
    // Convert local datetime to ISO string
    const asDate = new Date(localVal)
    onChange(asDate.toISOString())
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="blast-schedule-input">{t('blasts.scheduleDate')}</Label>
      <div className="flex gap-2">
        <input
          id="blast-schedule-input"
          data-testid="blast-schedule-input"
          type="datetime-local"
          value={displayValue}
          min={minDatetimeLocal()}
          onChange={handleChange}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onChange('')}
            aria-label={t('blasts.clearSchedule')}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{t('blasts.scheduleHelp')}</p>
    </div>
  )
}
