import { useTranslation } from 'react-i18next'
import { Phone, MessageSquare, Signal, Smartphone } from 'lucide-react'
import type { HubUsage, HubQuota } from '@protocol/schemas/provider-setup'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'

interface HubUsageCardProps {
  usage: HubUsage
  quota: HubQuota
}

const USAGE_ICONS: Record<string, React.ReactNode> = {
  callsReceived: <Phone className="h-4 w-4" />,
  smsSent: <MessageSquare className="h-4 w-4" />,
  signalMessagesSent: <Signal className="h-4 w-4" />,
  whatsAppMessagesSent: <Smartphone className="h-4 w-4" />,
}

const USAGE_KEYS = [
  { usageKey: 'callsReceived' as const, quotaKey: 'maxCallsPerMonth' as const, labelKey: 'usageCalls' },
  { usageKey: 'smsSent' as const, quotaKey: 'maxSmsPerMonth' as const, labelKey: 'usageSms' },
  { usageKey: 'signalMessagesSent' as const, quotaKey: 'maxSignalMessagesPerMonth' as const, labelKey: 'usageSignal' },
  { usageKey: 'whatsAppMessagesSent' as const, quotaKey: 'maxWhatsAppMessagesPerMonth' as const, labelKey: 'usageWhatsApp' },
]

export function HubUsageCard({ usage, quota }: HubUsageCardProps) {
  const { t } = useTranslation()

  const items = USAGE_KEYS.map(({ usageKey, quotaKey, labelKey }) => ({
    label: t(`hubOnboarding.${labelKey}`),
    value: usage[usageKey] || 0,
    max: quota[quotaKey] || 0,
    icon: USAGE_ICONS[usageKey],
  }))

  return (
    <Card className="p-4 space-y-4" data-testid="hub-usage-card">
      <h3 className="text-sm font-semibold">{t('hubOnboarding.usageTitle')}</h3>

      <div className="space-y-3">
        {items.map((item) => {
          const percent = item.max > 0
            ? Math.min(100, Math.round((item.value / item.max) * 100))
            : 0

          return (
            <div key={item.label} className="space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">{item.icon}</span>
                  <span className="text-xs">{item.label}</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {item.value} / {item.max}
                </span>
              </div>
              <Progress value={percent} className="h-1.5" />
            </div>
          )
        })}
      </div>
    </Card>
  )
}
