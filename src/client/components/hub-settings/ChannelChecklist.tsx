import { useTranslation } from 'react-i18next'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import type { ChannelConfig } from '@protocol/schemas/provider-setup'

interface ChannelChecklistProps {
  config: ChannelConfig
  onChange: (config: ChannelConfig) => void
  disabled?: boolean
}

const CHANNELS: Array<{ key: keyof ChannelConfig; labelKey: string; icon: string }> = [
  { key: 'voice', labelKey: 'channelVoice', icon: '📞' },
  { key: 'sms', labelKey: 'channelSms', icon: '💬' },
  { key: 'email', labelKey: 'channelEmail', icon: '✉️' },
  { key: 'signal', labelKey: 'channelSignal', icon: '🔐' },
  { key: 'whatsapp', labelKey: 'channelWhatsApp', icon: '👋' },
  { key: 'telegram', labelKey: 'channelTelegram', icon: '✈️' },
  { key: 'rcs', labelKey: 'channelRcs', icon: '📱' },
]

export function ChannelChecklist({ config, onChange, disabled }: ChannelChecklistProps) {
  const { t } = useTranslation()

  function toggleChannel(key: keyof ChannelConfig) {
    onChange({ ...config, [key]: !config[key] })
  }

  return (
    <div className="space-y-4" data-testid="channel-checklist">
      <p className="text-sm text-muted-foreground">
        {t('hubOnboarding.channelChecklistDescription')}
      </p>

      <div className="space-y-3">
        {CHANNELS.map(({ key, labelKey, icon }) => (
          <div
            key={key}
            className="flex items-center justify-between rounded-lg border border-border p-3"
          >
            <div className="flex items-center gap-3">
              <span className="text-lg" role="img" aria-hidden="true">{icon}</span>
              <Label htmlFor={`channel-${key}`} className="text-sm font-medium cursor-pointer">
                {t(`hubOnboarding.${labelKey}`)}
              </Label>
            </div>
            <Switch
              id={`channel-${key}`}
              checked={!!config[key]}
              onCheckedChange={() => toggleChannel(key)}
              disabled={disabled}
              data-testid={`channel-toggle-${key}`}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
