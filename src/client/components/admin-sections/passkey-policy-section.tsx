import { useTranslation } from 'react-i18next'
import { useToast } from '@/lib/toast'
import { updateWebAuthnSettings, type WebAuthnSettings } from '@/lib/api'
import { SectionBody, SectionField, SectionActions, SectionDescription } from '@/components/admin-shell/section-layout'
import { Switch } from '@/components/ui/switch'
import { useState } from 'react'

export function PasskeyPolicySection() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [settings, setSettings] = useState<WebAuthnSettings | null>(null)
  const [saving, setSaving] = useState(false)
  const [showSaved, setShowSaved] = useState(false)

  async function handleToggle(field: keyof WebAuthnSettings, checked: boolean) {
    if (!settings) return
    setSaving(true)
    try {
      const res = await updateWebAuthnSettings({ [field]: checked })
      setSettings(res)
      setShowSaved(true)
      setTimeout(() => setShowSaved(false), 2000)
    } catch {
      toast(t('common.error'), 'error')
    } finally {
      setSaving(false)
    }
  }

  if (!settings) {
    return <div className="text-muted-foreground">{t('common.loading')}</div>
  }

  return (
    <SectionBody>
      <SectionDescription>{t('webauthn.policyDescription')}</SectionDescription>
      <SectionField label={t('webauthn.requireForAdmins')}>
        <Switch
          checked={settings.requireForAdmins}
          onCheckedChange={(checked) => handleToggle('requireForAdmins', checked)}
        />
      </SectionField>
      <SectionField label={t('webauthn.requireForUsers')}>
        <Switch
          checked={settings.requireForUsers}
          onCheckedChange={(checked) => handleToggle('requireForUsers', checked)}
        />
      </SectionField>
      <SectionActions
        slug="passkey-policy"
        onSave={() => {}}
        saving={saving}
        showSaved={showSaved}
      />
    </SectionBody>
  )
}
