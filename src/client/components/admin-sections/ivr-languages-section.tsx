import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '@/lib/toast'
import { getIvrLanguages } from '@/lib/api'
import { IvrLanguagesSection as IvrLanguagesSectionInner } from '@/components/admin-settings/ivr-languages-section'
import { IVR_LANGUAGES } from '@shared/languages'

export function IvrLanguagesSection() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [enabled, setEnabled] = useState<string[]>([...IVR_LANGUAGES])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getIvrLanguages()
      .then(r => setEnabled(r.enabledLanguages))
      .catch(() => toast(t('common.error'), 'error'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="text-muted-foreground">{t('common.loading')}</div>

  const statusSummary = `${enabled.length} ${t('settings.languages', { defaultValue: 'languages' })}`

  return (
    <IvrLanguagesSectionInner
      enabled={enabled}
      onChange={setEnabled}
      expanded={true}
      onToggle={() => {}}
      statusSummary={statusSummary}
    />
  )
}
