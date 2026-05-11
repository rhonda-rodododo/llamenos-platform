import { useTranslation } from 'react-i18next'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { HUB_CHANNEL_TYPES } from '@protocol/schemas/provider-setup'
import type { ChannelConfig, HubChannelType } from '@protocol/schemas/provider-setup'

interface ChannelChecklistProps {
  config: ChannelConfig
  onChange: (config: ChannelConfig) => void
  disabled?: boolean
}

const CHANNEL_ICONS: Record<HubChannelType, string> = {
  voice: '📞',
  sms: '💬',
  email: '✉️',
  signal: '🔐',
  whatsapp: '👋',
  telegram: '✈️',
  rcs: '📱',
}

const CHANNEL_LABEL_KEYS: Record<HubChannelType, string> = {
  voice: 'channelVoice',
  sms: 'channelSms',
  email: 'channelEmail',
  signal: 'channelSignal',
  whatsapp: 'channelWhatsApp',
  telegram: 'channelTelegram',
  rcs: 'channelRcs',
}

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
        {HUB_CHANNEL_TYPES.map((key) => (
          <div
            key={key}
            className="flex items-center justify-between rounded-lg border border-border p-3"
          >
            <div className="flex items-center gap-3">
              <span className="text-lg" role="img" aria-hidden="true">{CHANNEL_ICONS[key]}</span>
              <Label htmlFor={`channel-${key}`} className="text-sm font-medium cursor-pointer">
                {t(`hubOnboarding.${CHANNEL_LABEL_KEYS[key]}`)}
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
