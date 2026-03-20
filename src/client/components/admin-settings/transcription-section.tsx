import { useTranslation } from 'react-i18next'
import { useToast } from '@/lib/toast'
import { updateTranscriptionSettings } from '@/lib/api'
import { SettingsSection } from '@/components/settings-section'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Mic } from 'lucide-react'

interface Props {
  globalEnabled: boolean
  allowOptOut: boolean
  onGlobalChange: (enabled: boolean) => void
  onOptOutChange: (enabled: boolean) => void
  onConfirmToggle: (key: string, newValue: boolean) => void
  expanded: boolean
  onToggle: (open: boolean) => void
  statusSummary?: string
}

export function TranscriptionSection({ globalEnabled, allowOptOut, onOptOutChange, onConfirmToggle, expanded, onToggle, statusSummary }: Props) {
  const { t } = useTranslation()
  const { toast } = useToast()

  return (
    <SettingsSection
      id="transcription"
      title={t('settings.transcriptionSettings')}
      description={t('settings.transcriptionDescription')}
      icon={<Mic className="h-5 w-5 text-muted-foreground" />}
      expanded={expanded}
      onToggle={onToggle}
      basePath="/admin/settings"
      statusSummary={statusSummary}
    >
      <div className="flex items-center justify-between rounded-lg border border-border p-4">
        <div className="space-y-0.5">
          <Label>{t('settings.enableTranscription')}</Label>
          <p className="text-xs text-muted-foreground">{t('transcription.enabledGlobal')}</p>
        </div>
        <Switch
          checked={globalEnabled}
          onCheckedChange={(checked) => onConfirmToggle('transcription', checked)}
        />
      </div>
      <div className="flex items-center justify-between rounded-lg border border-border p-4">
        <div className="space-y-0.5">
          <Label>{t('transcription.allowOptOut')}</Label>
          <p className="text-xs text-muted-foreground">{t('transcription.allowOptOutDescription')}</p>
        </div>
        <Switch
          checked={allowOptOut}
          onCheckedChange={async (checked) => {
            try {
              const res = await updateTranscriptionSettings({ allowUserOptOut: checked })
              onOptOutChange(res.allowUserOptOut)
            } catch {
              toast(t('common.error'), 'error')
            }
          }}
        />
      </div>
    </SettingsSection>
  )
}
