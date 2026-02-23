import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Phone, MessageSquare, FileText, Plus, X } from 'lucide-react'
import type { SetupData } from './SetupWizard'

interface Props {
  data: SetupData
  onChange: (patch: Partial<SetupData>) => void
  headingRef?: React.RefObject<HTMLHeadingElement | null>
}

export function StepSettings({ data, onChange, headingRef }: Props) {
  const { t } = useTranslation()
  const hasVoice = data.selectedChannels.includes('voice')
  const hasMessaging = data.selectedChannels.includes('sms') ||
    data.selectedChannels.includes('whatsapp') ||
    data.selectedChannels.includes('signal')
  const hasReports = data.selectedChannels.includes('reports')
  const [newCategory, setNewCategory] = useState('')

  function addCategory() {
    const trimmed = newCategory.trim()
    if (!trimmed || data.reportCategories.includes(trimmed)) return
    onChange({ reportCategories: [...data.reportCategories, trimmed] })
    setNewCategory('')
  }

  function removeCategory(cat: string) {
    onChange({ reportCategories: data.reportCategories.filter(c => c !== cat) })
  }

  if (!hasVoice && !hasMessaging && !hasReports) {
    return (
      <div className="space-y-4">
        <h2 ref={headingRef} tabIndex={-1} className="text-lg font-semibold outline-none">{t('setup.settingsTitle')}</h2>
        <p className="text-sm text-muted-foreground">{t('setup.noSettingsNeeded')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 ref={headingRef} tabIndex={-1} className="text-lg font-semibold outline-none">{t('setup.settingsTitle')}</h2>
        <p className="text-sm text-muted-foreground mt-1">{t('setup.settingsDescription')}</p>
      </div>

      {/* Voice settings */}
      {hasVoice && (
        <div className="space-y-4 rounded-lg border p-4">
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">{t('setup.voiceSettings')}</h3>
          </div>

          <div className="space-y-3">
            <div className="space-y-1">
              <Label>{t('setup.queueTimeout')}</Label>
              <p className="text-xs text-muted-foreground">{t('setup.queueTimeoutHelp')}</p>
              <Input
                type="number"
                min={10}
                max={300}
                value={data.voiceSettings.queueTimeout}
                onChange={e => onChange({
                  voiceSettings: { ...data.voiceSettings, queueTimeout: parseInt(e.target.value) || 60 },
                })}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>{t('setup.voicemailEnabled')}</Label>
                <p className="text-xs text-muted-foreground">{t('setup.voicemailEnabledHelp')}</p>
              </div>
              <Switch
                checked={data.voiceSettings.voicemailEnabled}
                onCheckedChange={checked => onChange({
                  voiceSettings: { ...data.voiceSettings, voicemailEnabled: checked },
                })}
              />
            </div>

            {data.voiceSettings.voicemailEnabled && (
              <div className="space-y-1">
                <Label>{t('setup.voicemailMaxDuration')}</Label>
                <Input
                  type="number"
                  min={15}
                  max={600}
                  value={data.voiceSettings.voicemailMaxDuration}
                  onChange={e => onChange({
                    voiceSettings: { ...data.voiceSettings, voicemailMaxDuration: parseInt(e.target.value) || 120 },
                  })}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Messaging settings */}
      {hasMessaging && (
        <div className="space-y-4 rounded-lg border p-4">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">{t('setup.messagingSettings')}</h3>
          </div>

          <div className="space-y-3">
            <div className="space-y-1">
              <Label>{t('setup.autoResponse')}</Label>
              <p className="text-xs text-muted-foreground">{t('setup.autoResponseHelp')}</p>
              <Input
                value={data.messagingSettings.autoResponse}
                onChange={e => onChange({
                  messagingSettings: { ...data.messagingSettings, autoResponse: e.target.value },
                })}
                placeholder={t('setup.autoResponsePlaceholder')}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>{t('setup.inactivityTimeout')}</Label>
                <Input
                  type="number"
                  min={5}
                  max={1440}
                  value={data.messagingSettings.inactivityTimeout}
                  onChange={e => onChange({
                    messagingSettings: { ...data.messagingSettings, inactivityTimeout: parseInt(e.target.value) || 60 },
                  })}
                />
              </div>
              <div className="space-y-1">
                <Label>{t('setup.maxConcurrent')}</Label>
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={data.messagingSettings.maxConcurrent}
                  onChange={e => onChange({
                    messagingSettings: { ...data.messagingSettings, maxConcurrent: parseInt(e.target.value) || 3 },
                  })}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Report settings */}
      {hasReports && (
        <div className="space-y-4 rounded-lg border p-4">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">{t('setup.reportSettings')}</h3>
          </div>

          <div className="space-y-2">
            <Label>{t('setup.reportCategories')}</Label>
            <p className="text-xs text-muted-foreground">{t('setup.reportCategoriesHelp')}</p>

            <div className="flex flex-wrap gap-2">
              {data.reportCategories.map(cat => (
                <span key={cat} className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs">
                  {cat}
                  <button
                    onClick={() => removeCategory(cat)}
                    aria-label={`${t('common.remove')}: ${cat}`}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>

            <div className="flex gap-2">
              <Input
                value={newCategory}
                onChange={e => setNewCategory(e.target.value)}
                placeholder={t('setup.categoryPlaceholder')}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCategory() } }}
                className="flex-1"
              />
              <Button variant="outline" size="sm" onClick={addCategory} disabled={!newCategory.trim()}>
                <Plus className="h-3.5 w-3.5" />
                {t('common.add')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
