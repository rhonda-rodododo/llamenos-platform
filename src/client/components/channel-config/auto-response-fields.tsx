import { useTranslation } from 'react-i18next'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

interface AutoResponseFieldsProps {
  autoResponse: string
  afterHoursResponse: string
  onAutoResponseChange: (value: string) => void
  onAfterHoursResponseChange: (value: string) => void
  idPrefix: string
}

export function AutoResponseFields({
  autoResponse,
  afterHoursResponse,
  onAutoResponseChange,
  onAfterHoursResponseChange,
  idPrefix,
}: AutoResponseFieldsProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-auto-response`}>
          {t('channels.shared.autoResponse')}
        </Label>
        <Textarea
          id={`${idPrefix}-auto-response`}
          value={autoResponse}
          onChange={(e) => onAutoResponseChange(e.target.value)}
          placeholder={t('channels.shared.autoResponsePlaceholder')}
          rows={2}
          data-testid={`${idPrefix}-auto-response`}
        />
        <p className="text-xs text-muted-foreground">
          {t('channels.shared.autoResponseHelp')}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-after-hours`}>
          {t('channels.shared.afterHoursResponse')}
        </Label>
        <Textarea
          id={`${idPrefix}-after-hours`}
          value={afterHoursResponse}
          onChange={(e) => onAfterHoursResponseChange(e.target.value)}
          placeholder={t('channels.shared.afterHoursPlaceholder')}
          rows={2}
          data-testid={`${idPrefix}-after-hours`}
        />
        <p className="text-xs text-muted-foreground">
          {t('channels.shared.afterHoursHelp')}
        </p>
      </div>
    </div>
  )
}
