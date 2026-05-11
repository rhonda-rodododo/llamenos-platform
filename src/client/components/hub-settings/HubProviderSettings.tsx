import { useTranslation } from 'react-i18next'
import { CheckCircle2, XCircle, Phone, MessageSquare, Signal, Mail, Send, Smartphone } from 'lucide-react'
import type { HubSetupStatus, ChannelConfig } from '@protocol/schemas/provider-setup'
import { Card } from '@/components/ui/card'
import { TELEPHONY_PROVIDER_LABELS } from '@shared/types'

interface HubProviderSettingsProps {
  status: HubSetupStatus
  channelConfig: ChannelConfig
}

const CHANNEL_ICONS: Record<string, React.ReactNode> = {
  voice: <Phone className="h-4 w-4" />,
  sms: <MessageSquare className="h-4 w-4" />,
  email: <Mail className="h-4 w-4" />,
  signal: <Signal className="h-4 w-4" />,
  whatsapp: <Smartphone className="h-4 w-4" />,
  telegram: <Send className="h-4 w-4" />,
  rcs: <MessageSquare className="h-4 w-4" />,
}

export function HubProviderSettings({ status, channelConfig }: HubProviderSettingsProps) {
  const { t } = useTranslation()

  const providerLabel = status.providerType
    ? TELEPHONY_PROVIDER_LABELS[status.providerType] || status.providerType
    : null

  return (
    <div className="space-y-4" data-testid="hub-provider-settings">
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">{t('hubOnboarding.providerStatus')}</h3>
            {providerLabel && (
              <p className="text-xs text-muted-foreground">{providerLabel}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {status.providerConnected ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span className="text-xs text-green-700 dark:text-green-400">
                  {t('hubOnboarding.providerConnected')}
                </span>
              </>
            ) : (
              <>
                <XCircle className="h-4 w-4 text-destructive" />
                <span className="text-xs text-destructive">
                  {t('hubOnboarding.providerDisconnected')}
                </span>
              </>
            )}
          </div>
        </div>
      </Card>

      {status.numbersProvisioned > 0 && (
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">{t('hubOnboarding.phoneNumbers')}</h3>
            <span className="text-xs text-muted-foreground">
              {status.numbersProvisioned} {status.numbersProvisioned === 1 ? 'number' : 'numbers'}
            </span>
          </div>
        </Card>
      )}

      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-3">{t('hubOnboarding.channelSettingsTitle')}</h3>
        <div className="space-y-2">
          {Object.entries(channelConfig).map(([key, enabled]) => {
            const channelKey = key as keyof ChannelConfig
            const isConfigured = status.channelsConfigured.includes(channelKey)
            const isPending = status.channelsPending.includes(channelKey)

            return (
              <div key={key} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">{CHANNEL_ICONS[key] || null}</span>
                  <span className="text-sm">{t(`hubOnboarding.channel${key.charAt(0).toUpperCase() + key.slice(1)}` as const)}</span>
                </div>
                <div className="flex items-center gap-2">
                  {enabled ? (
                    <>
                      <span className="text-xs text-green-700 dark:text-green-400">
                        {t('hubOnboarding.channelEnabled')}
                      </span>
                      {isConfigured && <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />}
                      {isPending && <span className="text-xs text-amber-600">{t('hubOnboarding.summaryPending')}</span>}
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {t('hubOnboarding.channelDisabled')}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      {status.a2pStatus && (
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">{t('hubOnboarding.a2pStatus')}</h3>
            <span className={`text-xs ${
              status.a2pStatus === 'approved'
                ? 'text-green-700 dark:text-green-400'
                : 'text-amber-600'
            }`}>
              {status.a2pStatus === 'approved'
                ? t('hubOnboarding.a2pApproved')
                : t('hubOnboarding.a2pPending')
              }
            </span>
          </div>
        </Card>
      )}
    </div>
  )
}
