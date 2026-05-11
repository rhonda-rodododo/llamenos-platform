import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '@/lib/toast'
import { getMessagingConfig, type MessagingConfig } from '@/lib/api'
import { SignalChannelSection as SignalChannelSectionInner } from '@/components/admin-settings/signal-channel-section'

export function SignalChannelSection() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [config, setConfig] = useState<MessagingConfig | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getMessagingConfig()
      .then(setConfig)
      .catch(() => toast(t('common.error'), 'error'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="text-muted-foreground">{t('common.loading')}</div>
  if (!config) return <div className="text-muted-foreground">{t('common.error')}</div>

  const statusSummary = config.signal
    ? t('common.configured', { defaultValue: 'Configured' })
    : t('settings.notConfigured', { defaultValue: 'Not configured' })

  return (
    <SignalChannelSectionInner
      config={config}
      onConfigChange={setConfig}
      expanded={true}
      onToggle={() => {}}
      statusSummary={statusSummary}
    />
  )
}
