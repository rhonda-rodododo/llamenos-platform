import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '@/lib/toast'
import { getTelephonyProvider, type TelephonyProviderConfig } from '@/lib/api'
import { TelephonyProviderSection as TelephonyProviderSectionInner } from '@/components/admin-settings/telephony-provider-section'

export function PhoneProviderSection() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [config, setConfig] = useState<TelephonyProviderConfig | null>(null)
  const [draft, setDraft] = useState<Partial<TelephonyProviderConfig>>({ type: 'twilio' })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getTelephonyProvider()
      .then(c => {
        if (c) {
          setConfig(c)
          setDraft(c)
        }
      })
      .catch(() => toast(t('common.error'), 'error'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="text-muted-foreground">{t('common.loading')}</div>

  const statusSummary = config?.type
    ? config.type.charAt(0).toUpperCase() + config.type.slice(1)
    : t('settings.notConfigured', { defaultValue: 'Not configured' })

  return (
    <TelephonyProviderSectionInner
      config={config}
      draft={draft}
      onConfigChange={setConfig}
      onDraftChange={setDraft}
      expanded={true}
      onToggle={() => {}}
      statusSummary={statusSummary}
    />
  )
}
