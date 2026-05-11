import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '@/lib/toast'
import { getSpamSettings, type SpamSettings } from '@/lib/api'
import { SpamSection as SpamSectionInner } from '@/components/admin-settings/spam-section'

export function SpamSection() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [settings, setSettings] = useState<SpamSettings | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getSpamSettings()
      .then(setSettings)
      .catch(() => toast(t('common.error'), 'error'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="text-muted-foreground">{t('common.loading')}</div>
  if (!settings) return <div className="text-muted-foreground">{t('common.error')}</div>

  const statusSummary = `${t('settings.captcha', { defaultValue: 'CAPTCHA' })}: ${settings.voiceCaptchaEnabled ? t('common.on', { defaultValue: 'on' }) : t('common.off', { defaultValue: 'off' })}, ${t('settings.rateLimit', { defaultValue: 'Rate limit' })}: ${settings.rateLimitEnabled ? t('common.on', { defaultValue: 'on' }) : t('common.off', { defaultValue: 'off' })}`

  return (
    <SpamSectionInner
      settings={settings}
      onChange={setSettings}
      onConfirmToggle={(key, newValue) => {
        if (key === 'captcha') {
          getSpamSettings().then(s => {
            setSettings({ ...s, voiceCaptchaEnabled: newValue })
          })
        } else if (key === 'rateLimit') {
          getSpamSettings().then(s => {
            setSettings({ ...s, rateLimitEnabled: newValue })
          })
        }
      }}
      expanded={true}
      onToggle={() => {}}
      statusSummary={statusSummary}
    />
  )
}
