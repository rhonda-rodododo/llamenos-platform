import { useTranslation } from 'react-i18next'
import { useToast } from '@/lib/toast'
import { updateWebAuthnSettings, type WebAuthnSettings } from '@/lib/api'
import { SettingsSection } from '@/components/settings-section'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Shield } from 'lucide-react'

interface Props {
  settings: WebAuthnSettings
  onChange: (settings: WebAuthnSettings) => void
  expanded: boolean
  onToggle: (open: boolean) => void
  statusSummary?: string
}

export function PasskeyPolicySection({ settings, onChange, expanded, onToggle, statusSummary }: Props) {
  const { t } = useTranslation()
  const { toast } = useToast()

  async function handleToggle(field: keyof WebAuthnSettings, checked: boolean) {
    try {
      const res = await updateWebAuthnSettings({ [field]: checked })
      onChange(res)
    } catch {
      toast(t('common.error'), 'error')
    }
  }

  return (
    <SettingsSection
      id="passkey-policy"
      title={t('webauthn.policy')}
      description={t('webauthn.policyDescription')}
      icon={<Shield className="h-5 w-5 text-muted-foreground" />}
      expanded={expanded}
      onToggle={onToggle}
      basePath="/admin/settings"
      statusSummary={statusSummary}
    >
      <div className="flex items-center justify-between rounded-lg border border-border p-4">
        <div className="space-y-0.5">
          <Label>{t('webauthn.requireForAdmins')}</Label>
        </div>
        <Switch
          checked={settings.requireForAdmins}
          onCheckedChange={(checked) => handleToggle('requireForAdmins', checked)}
        />
      </div>
      <div className="flex items-center justify-between rounded-lg border border-border p-4">
        <div className="space-y-0.5">
          <Label>{t('webauthn.requireForUsers')}</Label>
        </div>
        <Switch
          checked={settings.requireForUsers}
          onCheckedChange={(checked) => handleToggle('requireForUsers', checked)}
        />
      </div>
    </SettingsSection>
  )
}
