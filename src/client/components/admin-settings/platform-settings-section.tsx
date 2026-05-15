import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '@/lib/toast'
import { SettingsSection } from '@/components/settings-section'
import {
  SectionBody,
  SectionField,
  SectionToggleField,
  SectionDescription,
  SectionActions,
} from '@/components/admin-shell/section-layout'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Settings2 } from 'lucide-react'
import {
  updatePlatformSettings,
  type PlatformSettings,
} from '@/lib/api'

interface Props {
  settings: PlatformSettings
  onChange: (settings: PlatformSettings) => void
  expanded: boolean
  onToggle: (open: boolean) => void
  statusSummary?: string
}

export function PlatformSettingsSection({ settings, onChange, expanded, onToggle, statusSummary }: Props) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [local, setLocal] = useState<PlatformSettings>(settings)
  const [saving, setSaving] = useState(false)
  const [showSaved, setShowSaved] = useState(false)

  function updateLocal<K extends keyof PlatformSettings>(key: K, value: PlatformSettings[K]) {
    setLocal(prev => ({ ...prev, [key]: value }))
  }

  async function handleSave() {
    setSaving(true)
    try {
      const { settings: updated } = await updatePlatformSettings(local)
      onChange(updated)
      setLocal(updated)
      setShowSaved(true)
      setTimeout(() => setShowSaved(false), 2000)
    } catch {
      toast(t('common.error'), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <SettingsSection
      id="platform-settings"
      title={t('platformSettings.title')}
      icon={<Settings2 className="h-5 w-5 text-muted-foreground" />}
      expanded={expanded}
      onToggle={onToggle}
      statusSummary={statusSummary}
    >
      <SectionBody>
        {/* Feature Flags */}
        <div className="space-y-4" data-testid="platform-feature-flags">
          <h4 className="text-sm font-medium">{t('platformSettings.featureFlags.title')}</h4>

          <SectionToggleField
            label={t('platformSettings.featureFlags.mls')}
            help={t('platformSettings.featureFlags.mlsHelp')}
            htmlFor="flag-mls"
          >
            <Switch
              id="flag-mls"
              data-testid="flag-mls-switch"
              checked={local.featureFlags.mlsEnabled}
              onCheckedChange={(checked) => updateLocal('featureFlags', { ...local.featureFlags, mlsEnabled: checked })}
            />
          </SectionToggleField>

          <SectionToggleField
            label={t('platformSettings.featureFlags.transcription')}
            help={t('platformSettings.featureFlags.transcriptionHelp')}
            htmlFor="flag-transcription"
          >
            <Switch
              id="flag-transcription"
              data-testid="flag-transcription-switch"
              checked={local.featureFlags.transcriptionEnabled}
              onCheckedChange={(checked) => updateLocal('featureFlags', { ...local.featureFlags, transcriptionEnabled: checked })}
            />
          </SectionToggleField>

          <SectionToggleField
            label={t('platformSettings.featureFlags.caseManagement')}
            help={t('platformSettings.featureFlags.caseManagementHelp')}
            htmlFor="flag-case-management"
          >
            <Switch
              id="flag-case-management"
              data-testid="flag-case-management-switch"
              checked={local.featureFlags.caseManagementEnabled}
              onCheckedChange={(checked) => updateLocal('featureFlags', { ...local.featureFlags, caseManagementEnabled: checked })}
            />
          </SectionToggleField>

          <SectionToggleField
            label={t('platformSettings.featureFlags.crossHubSharing')}
            help={t('platformSettings.featureFlags.crossHubSharingHelp')}
            htmlFor="flag-cross-hub-sharing"
          >
            <Switch
              id="flag-cross-hub-sharing"
              data-testid="flag-cross-hub-sharing-switch"
              checked={local.featureFlags.crossHubSharingEnabled}
              onCheckedChange={(checked) => updateLocal('featureFlags', { ...local.featureFlags, crossHubSharingEnabled: checked })}
            />
          </SectionToggleField>
        </div>

        {/* Branding */}
        <div className="space-y-4 border-t border-border/60 pt-5" data-testid="platform-branding">
          <h4 className="text-sm font-medium">{t('platformSettings.branding.title')}</h4>

          <SectionField label={t('platformSettings.branding.instanceName')} htmlFor="branding-instance-name">
            <Input
              id="branding-instance-name"
              data-testid="branding-instance-name-input"
              value={local.branding.instanceName}
              onChange={(e) => updateLocal('branding', { ...local.branding, instanceName: e.target.value })}
            />
          </SectionField>

          <SectionField label={t('platformSettings.branding.supportEmail')} htmlFor="branding-support-email">
            <Input
              id="branding-support-email"
              data-testid="branding-support-email-input"
              type="email"
              value={local.branding.supportEmail}
              onChange={(e) => updateLocal('branding', { ...local.branding, supportEmail: e.target.value })}
            />
          </SectionField>

          <SectionField label={t('platformSettings.branding.privacyPolicyUrl')} htmlFor="branding-privacy-url">
            <Input
              id="branding-privacy-url"
              data-testid="branding-privacy-url-input"
              type="url"
              value={local.branding.privacyPolicyUrl}
              onChange={(e) => updateLocal('branding', { ...local.branding, privacyPolicyUrl: e.target.value })}
            />
          </SectionField>
        </div>

        {/* Session Policy */}
        <div className="space-y-4 border-t border-border/60 pt-5" data-testid="platform-session-policy">
          <h4 className="text-sm font-medium">{t('platformSettings.sessionPolicy.title')}</h4>

          <SectionField
            label={t('platformSettings.sessionPolicy.maxSessionDuration')}
            htmlFor="session-max-duration"
            help={t('platformSettings.sessionPolicy.maxSessionDurationHelp')}
          >
            <div className="flex items-center gap-2">
              <Input
                id="session-max-duration"
                data-testid="session-max-duration-input"
                type="number"
                value={local.sessionPolicy.maxSessionDurationHours}
                onChange={(e) => updateLocal('sessionPolicy', {
                  ...local.sessionPolicy,
                  maxSessionDurationHours: parseInt(e.target.value) || 720,
                })}
                min={1}
                max={8760}
                className="w-32"
              />
              <span className="text-sm text-muted-foreground">{t('platformSettings.sessionPolicy.hours')}</span>
            </div>
          </SectionField>

          <SectionField
            label={t('platformSettings.sessionPolicy.maxInactive')}
            htmlFor="session-max-inactive"
            help={t('platformSettings.sessionPolicy.maxInactiveHelp')}
          >
            <div className="flex items-center gap-2">
              <Input
                id="session-max-inactive"
                data-testid="session-max-inactive-input"
                type="number"
                value={local.sessionPolicy.maxInactiveHours}
                onChange={(e) => updateLocal('sessionPolicy', {
                  ...local.sessionPolicy,
                  maxInactiveHours: parseInt(e.target.value) || 168,
                })}
                min={1}
                max={8760}
                className="w-32"
              />
              <span className="text-sm text-muted-foreground">{t('platformSettings.sessionPolicy.hours')}</span>
            </div>
          </SectionField>
        </div>

        {/* Platform Erasure Floor */}
        <div className="space-y-4 border-t border-border/60 pt-5" data-testid="platform-erasure-floor">
          <h4 className="text-sm font-medium">{t('platformSettings.erasureFloor.title')}</h4>
          <SectionDescription>{t('platformSettings.erasureFloor.description')}</SectionDescription>

          <SectionField
            label={t('platformSettings.erasureFloor.minDelay')}
            htmlFor="erasure-min-delay"
            help={t('platformSettings.erasureFloor.minDelayHelp')}
          >
            <div className="flex items-center gap-2">
              <Input
                id="erasure-min-delay"
                data-testid="erasure-min-delay-input"
                type="number"
                value={local.erasurePlatformFloor.minDelayHours}
                onChange={(e) => updateLocal('erasurePlatformFloor', {
                  minDelayHours: parseInt(e.target.value) || 24,
                })}
                min={4}
                max={168}
                className="w-32"
              />
              <span className="text-sm text-muted-foreground">{t('platformSettings.erasureFloor.hours')}</span>
            </div>
          </SectionField>
        </div>

        {/* Retention Purge Schedule */}
        <div className="space-y-4 border-t border-border/60 pt-5" data-testid="platform-retention-purge">
          <h4 className="text-sm font-medium">{t('platformSettings.retentionPurge.title')}</h4>

          <SectionToggleField
            label={t('platformSettings.retentionPurge.enabled')}
            help={t('platformSettings.retentionPurge.enabledHelp')}
            htmlFor="purge-enabled"
          >
            <Switch
              id="purge-enabled"
              data-testid="purge-enabled-switch"
              checked={local.retentionPurge.enabled}
              onCheckedChange={(checked) => updateLocal('retentionPurge', { ...local.retentionPurge, enabled: checked })}
            />
          </SectionToggleField>

          {local.retentionPurge.enabled && (
            <SectionField
              label={t('platformSettings.retentionPurge.cronHour')}
              htmlFor="purge-cron-hour"
              help={t('platformSettings.retentionPurge.cronHourHelp')}
            >
              <div className="flex items-center gap-2">
                <Input
                  id="purge-cron-hour"
                  data-testid="purge-cron-hour-input"
                  type="number"
                  value={local.retentionPurge.cronHourUtc}
                  onChange={(e) => updateLocal('retentionPurge', {
                    ...local.retentionPurge,
                    cronHourUtc: parseInt(e.target.value) || 3,
                  })}
                  min={0}
                  max={23}
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">{t('platformSettings.retentionPurge.utc')}</span>
              </div>
            </SectionField>
          )}
        </div>

        <SectionActions
          slug="platform-settings"
          onSave={handleSave}
          saving={saving}
          showSaved={showSaved}
        />
      </SectionBody>
    </SettingsSection>
  )
}
