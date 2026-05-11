import { useTranslation } from 'react-i18next'
import { Phone, MessageSquare, Signal, Smartphone } from 'lucide-react'
import type { HubUsage, HubQuota } from '@protocol/schemas/provider-setup'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'

interface HubUsageCardProps {
  usage: HubUsage
  quota: HubQuota
}

export function HubUsageCard({ usage, quota }: HubUsageCardProps) {
  const { t } = useTranslation()

  const items = [
    {
      label: t('hubOnboarding.usageCalls'),
      value: usage.callsReceived || 0,
      max: quota.maxCallsPerMonth || 500,
      icon: <Phone className="h-4 w-4" />,
    },
    {
      label: t('hubOnboarding.usageSms'),
      value: usage.smsSent || 0,
      max: quota.maxSmsPerMonth || 1000,
      icon: <MessageSquare className="h-4 w-4" />,
    },
    {
      label: t('hubOnboarding.usageSignal'),
      value: usage.signalMessagesSent || 0,
      max: quota.maxSignalMessagesPerMonth || 500,
      icon: <Signal className="h-4 w-4" />,
    },
    {
      label: t('hubOnboarding.usageWhatsApp'),
      value: usage.whatsAppMessagesSent || 0,
      max: quota.maxWhatsAppMessagesPerMonth || 500,
      icon: <Smartphone className="h-4 w-4" />,
    },
  ]

  return (
    <Card className="p-4 space-y-4" data-testid="hub-usage-card">
      <h3 className="text-sm font-semibold">{t('hubOnboarding.usageTitle')}</h3>

      <div className="space-y-3">
        {items.map((item) => {
          const percent = Math.min(100, Math.round((item.value / item.max) * 100))

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
