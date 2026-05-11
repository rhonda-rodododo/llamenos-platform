import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '@/lib/toast'
import { getMessagingConfig, type MessagingConfig } from '@/lib/api'
import { RCSChannelSection as RCSChannelSectionInner } from '@/components/admin-settings/rcs-channel-section'

export function RcsChannelSection() {
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

  const statusSummary = config.rcs
    ? t('common.configured', { defaultValue: 'Configured' })
    : t('settings.notConfigured', { defaultValue: 'Not configured' })

  return (
    <RCSChannelSectionInner
      config={config}
      onConfigChange={setConfig}
      expanded={true}
      onToggle={() => {}}
      statusSummary={statusSummary}
    />
  )
}
