import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '@/lib/toast'
import { getPlatformSettings, type PlatformSettings } from '@/lib/api'
import { PlatformSettingsSection } from '@/components/admin-settings/platform-settings-section'

export function PlatformSection() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [settings, setSettings] = useState<PlatformSettings | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getPlatformSettings()
      .then(({ settings }) => setSettings(settings))
      .catch(() => toast(t('common.error'), 'error'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="text-muted-foreground">{t('common.loading')}</div>
  if (!settings) return <div className="text-muted-foreground">{t('common.error')}</div>

  return (
    <PlatformSettingsSection
      settings={settings}
      onChange={setSettings}
      expanded={true}
      onToggle={() => {}}
      statusSummary={settings.branding.instanceName || undefined}
    />
  )
}
