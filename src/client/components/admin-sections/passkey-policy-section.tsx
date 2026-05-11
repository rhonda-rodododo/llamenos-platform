import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '@/lib/toast'
import { getWebAuthnSettings, type WebAuthnSettings } from '@/lib/api'
import { PasskeyPolicySection as PasskeyPolicySectionInner } from '@/components/admin-settings/passkey-policy-section'

export function PasskeyPolicySection() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [settings, setSettings] = useState<WebAuthnSettings | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getWebAuthnSettings()
      .then(setSettings)
      .catch(() => toast(t('common.error'), 'error'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="text-muted-foreground">{t('common.loading')}</div>
  if (!settings) return <div className="text-muted-foreground">{t('common.error')}</div>

  const statusSummary = settings.requireForAdmins && settings.requireForUsers
    ? t('webauthn.requiredAll', { defaultValue: 'Required for all' })
    : settings.requireForAdmins
      ? t('webauthn.requiredAdmins', { defaultValue: 'Required for admins' })
      : settings.requireForUsers
        ? t('webauthn.requiredUsers', { defaultValue: 'Required for volunteers' })
        : t('webauthn.notRequired', { defaultValue: 'Not required' })

  return (
    <PasskeyPolicySectionInner
      settings={settings}
      onChange={setSettings}
      expanded={true}
      onToggle={() => {}}
      statusSummary={statusSummary}
    />
  )
}
