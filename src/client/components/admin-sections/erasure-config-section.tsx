import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '@/lib/toast'
import { getErasureConfig, getPlatformSettings, type ErasureConfig } from '@/lib/api'
import { ErasureConfigSection as ErasureConfigSectionInner } from '@/components/admin-settings/erasure-config-section'

export function ErasureConfigSection() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [config, setConfig] = useState<ErasureConfig | null>(null)
  const [platformFloorHours, setPlatformFloorHours] = useState(24)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      getErasureConfig().then(r => r.config),
      getPlatformSettings().then(r => r.settings.erasurePlatformFloor.minDelayHours).catch(() => 24),
    ])
      .then(([c, floor]) => { setConfig(c); setPlatformFloorHours(floor) })
      .catch(() => toast(t('common.error'), 'error'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="text-muted-foreground">{t('common.loading')}</div>
  if (!config) return <div className="text-muted-foreground">{t('common.error')}</div>

  return (
    <ErasureConfigSectionInner
      config={config}
      platformFloorHours={platformFloorHours}
      onChange={setConfig}
      expanded={true}
      onToggle={() => {}}
      statusSummary={t('erasure.config.delayStatus', { hours: config.delayHours })}
    />
  )
}
