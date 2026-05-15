import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '@/lib/toast'
import { SettingsSection } from '@/components/settings-section'
import {
  SectionField,
  SectionToggleField,
  SectionActions,
  SectionDescription,
  SectionBanner,
} from '@/components/admin-shell/section-layout'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Clock } from 'lucide-react'
import { updateErasureConfig, type ErasureConfig } from '@/lib/api'

interface Props {
  config: ErasureConfig
  platformFloorHours: number
  onChange: (config: ErasureConfig) => void
  expanded: boolean
  onToggle: (open: boolean) => void
  statusSummary?: string
}

export function ErasureConfigSection({
  config,
  platformFloorHours,
  onChange,
  expanded,
  onToggle,
  statusSummary,
}: Props) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [delayHours, setDelayHours] = useState(config.delayHours)
  const [emergencyOverride, setEmergencyOverride] = useState(config.emergencyOverrideEnabled)
  const [saving, setSaving] = useState(false)
  const [showSaved, setShowSaved] = useState(false)

  const isBelowFloor = delayHours < platformFloorHours

  async function handleSave() {
    if (isBelowFloor) {
      toast(t('erasure.config.belowFloor', { min: platformFloorHours }), 'error')
      return
    }
    setSaving(true)
    try {
      const { config: updated } = await updateErasureConfig({
        delayHours,
        emergencyOverrideEnabled: emergencyOverride,
      })
      onChange(updated)
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
      id="erasure-config"
      title={t('erasure.config.title')}
      icon={<Clock className="h-5 w-5 text-muted-foreground" />}
      expanded={expanded}
      onToggle={onToggle}
      statusSummary={statusSummary}
    >
      <SectionDescription>{t('erasure.config.description')}</SectionDescription>

      <SectionField
        label={t('erasure.config.delayHours')}
        htmlFor="erasure-delay"
        help={t('erasure.config.delayHelp', { min: 24, max: 168 })}
        error={isBelowFloor ? t('erasure.config.belowFloor', { min: platformFloorHours }) : undefined}
      >
        <div className="flex items-center gap-2">
          <Input
            id="erasure-delay"
            data-testid="erasure-delay-input"
            type="number"
            value={delayHours}
            onChange={(e) => setDelayHours(parseInt(e.target.value) || 24)}
            min={platformFloorHours}
            max={168}
            className="w-32"
          />
          <span className="text-sm text-muted-foreground">{t('erasure.config.hours')}</span>
        </div>
      </SectionField>

      <SectionBanner tone="info">
        {t('erasure.config.platformFloor', { hours: platformFloorHours })}
      </SectionBanner>

      <SectionToggleField
        label={t('erasure.config.emergencyOverride')}
        help={t('erasure.config.emergencyOverrideHelp')}
        htmlFor="erasure-emergency"
      >
        <Switch
          id="erasure-emergency"
          data-testid="erasure-emergency-switch"
          checked={emergencyOverride}
          onCheckedChange={setEmergencyOverride}
        />
      </SectionToggleField>

      <SectionActions
        slug="erasure-config"
        onSave={handleSave}
        saving={saving}
        showSaved={showSaved}
        disabled={isBelowFloor}
      />
    </SettingsSection>
  )
}
