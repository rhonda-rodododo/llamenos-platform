import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '@/lib/toast'
import {
  getRetentionSettings,
  getRetentionPlatformFloors,
} from '@/lib/api'
import type { RetentionSetting, RetentionPlatformFloor } from '@protocol/schemas'
import { RetentionSection as RetentionSectionInner } from '@/components/admin-settings/retention-section'

export function RetentionSection() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [settings, setSettings] = useState<RetentionSetting[]>([])
  const [floors, setFloors] = useState<RetentionPlatformFloor[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      getRetentionSettings().then(r => r.settings),
      getRetentionPlatformFloors().then(r => r.floors),
    ])
      .then(([s, f]) => { setSettings(s); setFloors(f) })
      .catch(() => toast(t('common.error'), 'error'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="text-muted-foreground">{t('common.loading')}</div>

  const configured = settings.filter(s => s.retentionDays > 0).length
  const statusSummary = configured > 0
    ? t('retention.configuredCount', { count: configured })
    : t('retention.noneConfigured')

  return (
    <RetentionSectionInner
      settings={settings}
      platformFloors={floors}
      onSettingsChange={setSettings}
      expanded={true}
      onToggle={() => {}}
      statusSummary={statusSummary}
    />
  )
}
