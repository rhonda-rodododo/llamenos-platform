import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '@/lib/toast'
import { getIvrLanguages, listIvrAudio, type IvrAudioRecording } from '@/lib/api'
import { VoicePromptsSection as VoicePromptsSectionInner } from '@/components/admin-settings/voice-prompts-section'
import { IVR_LANGUAGES } from '@shared/languages'

export function VoicePromptsSection() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [ivrEnabled, setIvrEnabled] = useState<string[]>([...IVR_LANGUAGES])
  const [recordings, setRecordings] = useState<IvrAudioRecording[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      getIvrLanguages().then(r => setIvrEnabled(r.enabledLanguages)),
      listIvrAudio().then(r => setRecordings(r.recordings)),
    ])
      .catch(() => toast(t('common.error'), 'error'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="text-muted-foreground">{t('common.loading')}</div>

  const statusSummary = recordings.length > 0
    ? t('settings.customized', { defaultValue: 'Customized' })
    : t('settings.default', { defaultValue: 'Default' })

  return (
    <VoicePromptsSectionInner
      ivrEnabled={ivrEnabled}
      recordings={recordings}
      onRecordingsChange={setRecordings}
      expanded={true}
      onToggle={() => {}}
      statusSummary={statusSummary}
    />
  )
}
