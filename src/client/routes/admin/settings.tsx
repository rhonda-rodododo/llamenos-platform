import { createFileRoute, useSearch } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/lib/auth'
import { useEffect, useState, useCallback, useRef } from 'react'
import {
  getSpamSettings,
  updateSpamSettings,
  getCallSettings,
  getTranscriptionSettings,
  updateTranscriptionSettings,
  getIvrLanguages,
  listIvrAudio,
  getCustomFields,
  getTelephonyProvider,
  type SpamSettings,
  type CallSettings,
  type IvrAudioRecording,
  type CustomFieldDefinition,
  type TelephonyProviderConfig,
} from '@/lib/api'
import { getWebAuthnSettings, type WebAuthnSettings } from '@/lib/api'
import { useToast } from '@/lib/toast'
import { Settings2 } from 'lucide-react'
import { IVR_LANGUAGES } from '@shared/languages'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { PasskeyPolicySection } from '@/components/admin-settings/passkey-policy-section'
import { TelephonyProviderSection } from '@/components/admin-settings/telephony-provider-section'
import { TranscriptionSection } from '@/components/admin-settings/transcription-section'
import { IvrLanguagesSection } from '@/components/admin-settings/ivr-languages-section'
import { CallSettingsSection } from '@/components/admin-settings/call-settings-section'
import { VoicePromptsSection } from '@/components/admin-settings/voice-prompts-section'
import { CustomFieldsSection } from '@/components/admin-settings/custom-fields-section'
import { SpamSection } from '@/components/admin-settings/spam-section'
import { RolesSection } from '@/components/admin-settings/roles-section'

export const Route = createFileRoute('/admin/settings')({
  component: AdminSettingsPage,
  validateSearch: (search: Record<string, unknown>) => ({
    section: (search.section as string) || '',
  }),
})

function AdminSettingsPage() {
  const { t } = useTranslation()
  const { section } = useSearch({ from: '/admin/settings' })
  const { isAdmin } = useAuth()
  const { toast } = useToast()
  const [spam, setSpam] = useState<SpamSettings | null>(null)
  const [callSet, setCallSet] = useState<CallSettings | null>(null)
  const [globalTranscription, setGlobalTranscription] = useState(false)
  const [allowVolunteerOptOut, setAllowVolunteerOptOut] = useState(false)
  const [ivrEnabled, setIvrEnabled] = useState<string[]>([...IVR_LANGUAGES])
  const [ivrAudio, setIvrAudio] = useState<IvrAudioRecording[]>([])
  const [loading, setLoading] = useState(true)
  const [confirmToggle, setConfirmToggle] = useState<{ key: string; newValue: boolean } | null>(null)
  const [webauthnSettings, setWebauthnSettings] = useState<WebAuthnSettings | null>(null)
  const [customFieldDefs, setCustomFieldDefs] = useState<CustomFieldDefinition[]>([])
  const [providerConfig, setProviderConfig] = useState<TelephonyProviderConfig | null>(null)
  const [providerDraft, setProviderDraft] = useState<Partial<TelephonyProviderConfig>>({ type: 'twilio' })

  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const initial = new Set(['passkey-policy'])
    if (section) initial.add(section)
    return initial
  })
  const scrolledRef = useRef(false)

  const toggleSection = useCallback((id: string, open: boolean) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (open) next.add(id); else next.delete(id)
      return next
    })
  }, [])

  useEffect(() => {
    if (!isAdmin) return
    Promise.all([
      getSpamSettings().then(setSpam),
      getCallSettings().then(setCallSet),
      getTranscriptionSettings().then(r => {
        setGlobalTranscription(r.globalEnabled)
        setAllowVolunteerOptOut(r.allowVolunteerOptOut)
      }),
      getIvrLanguages().then(r => setIvrEnabled(r.enabledLanguages)),
      listIvrAudio().then(r => setIvrAudio(r.recordings)),
      getWebAuthnSettings().then(setWebauthnSettings).catch(() => {}),
      getCustomFields().then(r => setCustomFieldDefs(r.fields)).catch(() => {}),
      getTelephonyProvider().then(config => {
        if (config) { setProviderConfig(config); setProviderDraft(config) }
      }).catch(() => {}),
    ])
      .catch(() => toast(t('common.error'), 'error'))
      .finally(() => setLoading(false))
  }, [isAdmin])

  useEffect(() => {
    if (!loading && section && !scrolledRef.current) {
      scrolledRef.current = true
      requestAnimationFrame(() => {
        document.getElementById(section)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    }
  }, [loading, section])

  function handleConfirmToggle(key: string, newValue: boolean) {
    setConfirmToggle({ key, newValue })
  }

  async function applyConfirmToggle() {
    if (!confirmToggle) return
    const { key, newValue } = confirmToggle
    try {
      if (key === 'transcription') {
        const res = await updateTranscriptionSettings({ globalEnabled: newValue })
        setGlobalTranscription(res.globalEnabled)
      } else if (key === 'captcha') {
        const res = await updateSpamSettings({ voiceCaptchaEnabled: newValue })
        setSpam(res)
      } else if (key === 'rateLimit') {
        const res = await updateSpamSettings({ rateLimitEnabled: newValue })
        setSpam(res)
      }
    } catch {
      toast(t('common.error'), 'error')
    }
  }

  const confirmTitles: Record<string, string> = {
    transcription: t('confirm.transcriptionTitle'),
    captcha: t('confirm.captchaTitle'),
    rateLimit: t('confirm.rateLimitTitle'),
  }

  const confirmDescriptions: Record<string, string> = {
    transcription: confirmToggle?.newValue ? t('confirm.transcriptionEnable') : t('confirm.transcriptionDisable'),
    captcha: confirmToggle?.newValue ? t('confirm.captchaEnable') : t('confirm.captchaDisable'),
    rateLimit: confirmToggle?.newValue ? t('confirm.rateLimitEnable') : t('confirm.rateLimitDisable'),
  }

  // Compute status summaries for collapsed sections
  const passkeyStatus = webauthnSettings
    ? (webauthnSettings.requireForAdmins && webauthnSettings.requireForVolunteers)
      ? t('webauthn.requiredAll', { defaultValue: 'Required for all' })
      : webauthnSettings.requireForAdmins
        ? t('webauthn.requiredAdmins', { defaultValue: 'Required for admins' })
        : webauthnSettings.requireForVolunteers
          ? t('webauthn.requiredVolunteers', { defaultValue: 'Required for volunteers' })
          : t('webauthn.notRequired', { defaultValue: 'Not required' })
    : undefined

  const telephonyStatus = providerConfig?.type
    ? providerConfig.type.charAt(0).toUpperCase() + providerConfig.type.slice(1)
    : t('settings.notConfigured', { defaultValue: 'Not configured' })

  const transcriptionStatus = globalTranscription
    ? t('common.enabled', { defaultValue: 'Enabled' })
    : t('common.disabled', { defaultValue: 'Disabled' })

  const ivrStatus = `${ivrEnabled.length} ${t('settings.languages', { defaultValue: 'languages' })}`

  const callStatus = callSet
    ? `${t('settings.queue', { defaultValue: 'Queue' })}: ${callSet.queueTimeoutSeconds || 180}s, ${t('settings.voicemail', { defaultValue: 'VM' })}: ${callSet.voicemailMaxSeconds}s`
    : undefined

  const customFieldsStatus = customFieldDefs.length > 0
    ? `${customFieldDefs.length} ${t('settings.fields', { defaultValue: 'fields' })}`
    : t('common.none', { defaultValue: 'None' })

  const spamStatus = spam
    ? `${t('settings.captcha', { defaultValue: 'CAPTCHA' })}: ${spam.voiceCaptchaEnabled ? t('common.on', { defaultValue: 'on' }) : t('common.off', { defaultValue: 'off' })}, ${t('settings.rateLimit', { defaultValue: 'Rate limit' })}: ${spam.rateLimitEnabled ? t('common.on', { defaultValue: 'on' }) : t('common.off', { defaultValue: 'off' })}`
    : undefined

  if (!isAdmin) return <div className="text-muted-foreground">{t('common.error')}</div>
  if (loading) return <div className="text-muted-foreground">{t('common.loading')}</div>

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Settings2 className="h-6 w-6 text-primary" />
        <h1 className="text-xl font-bold sm:text-2xl">{t('settings.hubTitle')}</h1>
      </div>
      <p className="text-sm text-muted-foreground">{t('settings.hubDescription')}</p>

      {webauthnSettings && (
        <PasskeyPolicySection
          settings={webauthnSettings}
          onChange={setWebauthnSettings}
          expanded={expanded.has('passkey-policy')}
          onToggle={(open) => toggleSection('passkey-policy', open)}
          statusSummary={passkeyStatus}
        />
      )}

      <RolesSection
        expanded={expanded.has('roles')}
        onToggle={(open) => toggleSection('roles', open)}
        statusSummary={t('roles.summary', { defaultValue: 'Manage roles' })}
      />

      <TelephonyProviderSection
        config={providerConfig}
        draft={providerDraft}
        onConfigChange={setProviderConfig}
        onDraftChange={setProviderDraft}
        expanded={expanded.has('telephony-provider')}
        onToggle={(open) => toggleSection('telephony-provider', open)}
        statusSummary={telephonyStatus}
      />

      <TranscriptionSection
        globalEnabled={globalTranscription}
        allowOptOut={allowVolunteerOptOut}
        onGlobalChange={setGlobalTranscription}
        onOptOutChange={setAllowVolunteerOptOut}
        onConfirmToggle={handleConfirmToggle}
        expanded={expanded.has('transcription')}
        onToggle={(open) => toggleSection('transcription', open)}
        statusSummary={transcriptionStatus}
      />

      <IvrLanguagesSection
        enabled={ivrEnabled}
        onChange={setIvrEnabled}
        expanded={expanded.has('ivr-languages')}
        onToggle={(open) => toggleSection('ivr-languages', open)}
        statusSummary={ivrStatus}
      />

      {callSet && (
        <CallSettingsSection
          settings={callSet}
          onChange={setCallSet}
          expanded={expanded.has('call-settings')}
          onToggle={(open) => toggleSection('call-settings', open)}
          statusSummary={callStatus}
        />
      )}

      <VoicePromptsSection
        ivrEnabled={ivrEnabled}
        recordings={ivrAudio}
        onRecordingsChange={setIvrAudio}
        expanded={expanded.has('voice-prompts')}
        onToggle={(open) => toggleSection('voice-prompts', open)}
        statusSummary={ivrAudio.length > 0 ? t('settings.customized', { defaultValue: 'Customized' }) : t('settings.default', { defaultValue: 'Default' })}
      />

      <CustomFieldsSection
        fields={customFieldDefs}
        onChange={setCustomFieldDefs}
        expanded={expanded.has('custom-fields')}
        onToggle={(open) => toggleSection('custom-fields', open)}
        statusSummary={customFieldsStatus}
      />

      {spam && (
        <SpamSection
          settings={spam}
          onChange={setSpam}
          onConfirmToggle={handleConfirmToggle}
          expanded={expanded.has('spam')}
          onToggle={(open) => toggleSection('spam', open)}
          statusSummary={spamStatus}
        />
      )}

      <ConfirmDialog
        open={!!confirmToggle}
        onOpenChange={(open) => { if (!open) setConfirmToggle(null) }}
        title={confirmToggle ? confirmTitles[confirmToggle.key] : ''}
        description={confirmToggle ? confirmDescriptions[confirmToggle.key] : ''}
        variant="default"
        onConfirm={applyConfirmToggle}
      />
    </div>
  )
}
