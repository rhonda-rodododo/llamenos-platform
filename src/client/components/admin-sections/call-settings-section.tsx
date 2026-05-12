import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '@/lib/toast'
import { getCallSettings, type CallSettings } from '@/lib/api'
import { CallSettingsSection as CallSettingsSectionInner } from '@/components/admin-settings/call-settings-section'

export function CallSettingsSection() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [settings, setSettings] = useState<CallSettings | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getCallSettings()
      .then(setSettings)
      .catch(() => toast(t('common.error'), 'error'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="text-muted-foreground">{t('common.loading')}</div>
  if (!settings) return <div className="text-muted-foreground">{t('common.error')}</div>

  const statusSummary = `${t('settings.queue', { defaultValue: 'Queue' })}: ${settings.queueTimeoutSeconds || 180}s, ${t('settings.voicemail', { defaultValue: 'VM' })}: ${settings.voicemailMaxSeconds}s`

  return (
    <CallSettingsSectionInner
      settings={settings}
      onChange={setSettings}
      expanded={true}
      onToggle={() => {}}
      statusSummary={statusSummary}
    />
  )
}
