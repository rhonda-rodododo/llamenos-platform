import { useTranslation } from 'react-i18next'
import {
  CHANNEL_SECURITY,
  CHANNEL_LABELS,
  type ChannelType,
  type TransportSecurity,
} from '@shared/types'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Phone,
  MessageSquare,
  Globe,
  Shield,
  FileText,
  Check,
} from 'lucide-react'
import type { SetupData } from './SetupWizard'

interface Props {
  data: SetupData
  onChange: (patch: Partial<SetupData>) => void
  headingRef?: React.RefObject<HTMLHeadingElement | null>
}

interface ChannelInfo {
  type: ChannelType
  icon: typeof Phone
  descriptionKey: string
  requiresKey: string
}

const CHANNELS: ChannelInfo[] = [
  { type: 'voice', icon: Phone, descriptionKey: 'setup.channelVoiceDesc', requiresKey: 'setup.channelVoiceReq' },
  { type: 'sms', icon: MessageSquare, descriptionKey: 'setup.channelSmsDesc', requiresKey: 'setup.channelSmsReq' },
  { type: 'whatsapp', icon: Globe, descriptionKey: 'setup.channelWhatsappDesc', requiresKey: 'setup.channelWhatsappReq' },
  { type: 'signal', icon: Shield, descriptionKey: 'setup.channelSignalDesc', requiresKey: 'setup.channelSignalReq' },
  { type: 'reports', icon: FileText, descriptionKey: 'setup.channelReportsDesc', requiresKey: 'setup.channelReportsReq' },
]

const SECURITY_BADGE_STYLES: Record<TransportSecurity, string> = {
  'e2ee': 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  'e2ee-to-bridge': 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  'provider-encrypted': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  'none': 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
}

const SECURITY_LABEL_KEYS: Record<TransportSecurity, string> = {
  'e2ee': 'setup.securityE2ee',
  'e2ee-to-bridge': 'setup.securityE2eeBridge',
  'provider-encrypted': 'setup.securityProvider',
  'none': 'setup.securityNone',
}

export function StepChannels({ data, onChange, headingRef }: Props) {
  const { t } = useTranslation()

  function toggleChannel(channel: ChannelType) {
    const current = data.selectedChannels
    const next = current.includes(channel)
      ? current.filter(c => c !== channel)
      : [...current, channel]
    onChange({ selectedChannels: next })
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 ref={headingRef} tabIndex={-1} className="text-lg font-semibold outline-none">{t('setup.channelsTitle')}</h2>
        <p className="text-sm text-muted-foreground mt-1">{t('setup.channelsDescription')}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {CHANNELS.map(channel => {
          const selected = data.selectedChannels.includes(channel.type)
          const security = CHANNEL_SECURITY[channel.type]
          const Icon = channel.icon

          return (
            <Card
              key={channel.type}
              role="button"
              tabIndex={0}
              aria-pressed={selected}
              onClick={() => toggleChannel(channel.type)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleChannel(channel.type) } }}
              className={`cursor-pointer p-4 transition-all ${
                selected
                  ? 'border-primary ring-2 ring-primary/20'
                  : 'hover:border-primary/50'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <Icon className="h-5 w-5 text-muted-foreground" />
                  <span className="font-medium text-sm">{CHANNEL_LABELS[channel.type]}</span>
                </div>
                {selected && (
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary">
                    <Check className="h-3 w-3 text-primary-foreground" />
                  </div>
                )}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{t(channel.descriptionKey)}</p>
              <div className="mt-3 flex items-center gap-2">
                <Badge
                  variant="outline"
                  className={`text-[10px] border-0 ${SECURITY_BADGE_STYLES[security]}`}
                >
                  {t(SECURITY_LABEL_KEYS[security])}
                </Badge>
              </div>
              <p className="mt-1.5 text-[10px] text-muted-foreground">{t(channel.requiresKey)}</p>
            </Card>
          )
        })}
      </div>

      {data.selectedChannels.length === 0 && (
        <p role="alert" className="text-sm text-destructive">{t('setup.selectOneChannel')}</p>
      )}
    </div>
  )
}
