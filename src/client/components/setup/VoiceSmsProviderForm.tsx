import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '@/lib/toast'
import {
  testTelephonyProvider,
  updateTelephonyProvider,
  type TelephonyProviderConfig,
  type TelephonyProviderType,
} from '@/lib/api'
import { TELEPHONY_PROVIDER_LABELS } from '@shared/types'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Check, Loader2, Copy } from 'lucide-react'
import { InAppAudioNotice } from './InAppAudioNotice'
import { supportsInAppAudio } from '@/lib/in-app-audio'
import type { SetupData } from './SetupWizard'

interface Props {
  data: SetupData
  onChange: (patch: Partial<SetupData>) => void
}

const PROVIDERS: TelephonyProviderType[] = ['twilio', 'signalwire', 'vonage', 'plivo', 'asterisk']

export function VoiceSmsProviderForm({ data, onChange }: Props) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null)
  const [saving, setSaving] = useState(false)

  const provider = data.telephonyProvider || { type: 'twilio' as TelephonyProviderType }
  const selectedType = (provider.type || 'twilio') as TelephonyProviderType

  function update(patch: Partial<TelephonyProviderConfig>) {
    onChange({ telephonyProvider: { ...provider, ...patch }, providerValidated: false })
    setTestResult(null)
  }

  async function handleTest() {
    setTesting(true)
    try {
      const result = await testTelephonyProvider(provider as TelephonyProviderConfig)
      setTestResult(result)
      if (result.ok) onChange({ providerValidated: true })
    } catch (err) {
      setTestResult({ ok: false, error: String(err) })
    } finally {
      setTesting(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    try {
      await updateTelephonyProvider(provider as TelephonyProviderConfig)
      toast(t('telephonyProvider.saved'), 'success')
    } catch (err) {
      toast(String(err), 'error')
    } finally {
      setSaving(false)
    }
  }

  function copyWebhookUrl() {
    const url = `${window.location.origin}/telephony/voice`
    navigator.clipboard.writeText(url)
    toast(t('setup.webhookCopied'), 'success')
  }

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <h3 className="text-sm font-semibold">{t('setup.voiceSmsProvider')}</h3>

      {/* Provider select */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {PROVIDERS.map(type => (
          <Card
            key={type}
            role="button"
            tabIndex={0}
            onClick={() => update({ type })}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); update({ type }) } }}
            data-testid={`provider-card-${type}`}
            data-in-app-audio={supportsInAppAudio(type) ? 'supported' : 'unsupported'}
            className={`cursor-pointer p-3 text-center text-xs transition-all ${
              selectedType === type ? 'border-primary ring-2 ring-primary/20' : 'hover:border-primary/50'
            }`}
          >
            <span className="font-medium">{TELEPHONY_PROVIDER_LABELS[type]}</span>
            {!supportsInAppAudio(type) && (
              <span className="mt-0.5 block text-[10px] text-muted-foreground">{t('telephonyProvider.phonesOnlySuffix')}</span>
            )}
            {selectedType === type && <Check className="mx-auto mt-1 h-3 w-3 text-primary" />}
          </Card>
        ))}
      </div>

      <InAppAudioNotice provider={selectedType} />

      {/* Credential fields */}
      <div className="space-y-3">
        <div className="space-y-1">
          <Label>{t('telephonyProvider.phoneNumber')}</Label>
          <Input value={provider.phoneNumber || ''} onChange={e => update({ phoneNumber: e.target.value })} placeholder="+12125551234" />
        </div>

        {(selectedType === 'twilio' || selectedType === 'signalwire') && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>{t('telephonyProvider.accountSid')}</Label>
              <Input value={provider.accountSid || ''} onChange={e => update({ accountSid: e.target.value })} placeholder="AC..." />
            </div>
            <div className="space-y-1">
              <Label>{t('telephonyProvider.authToken')}</Label>
              <Input type="password" value={provider.authToken || ''} onChange={e => update({ authToken: e.target.value })} />
            </div>
            {selectedType === 'signalwire' && (
              <div className="space-y-1 sm:col-span-2">
                <Label>{t('telephonyProvider.signalwireSpace')}</Label>
                <Input value={provider.signalwireSpace || ''} onChange={e => update({ signalwireSpace: e.target.value })} placeholder="myspace" />
              </div>
            )}
          </div>
        )}

        {selectedType === 'vonage' && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>{t('telephonyProvider.apiKey')}</Label>
              <Input value={provider.apiKey || ''} onChange={e => update({ apiKey: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>{t('telephonyProvider.apiSecret')}</Label>
              <Input type="password" value={provider.apiSecret || ''} onChange={e => update({ apiSecret: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>{t('telephonyProvider.applicationId')}</Label>
              <Input value={provider.applicationId || ''} onChange={e => update({ applicationId: e.target.value })} />
            </div>
          </div>
        )}

        {selectedType === 'plivo' && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>{t('telephonyProvider.authId')}</Label>
              <Input value={provider.authId || ''} onChange={e => update({ authId: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>{t('telephonyProvider.authToken')}</Label>
              <Input type="password" value={provider.authToken || ''} onChange={e => update({ authToken: e.target.value })} />
            </div>
          </div>
        )}

        {selectedType === 'asterisk' && (
          <>
            <div className="space-y-1">
              <Label>{t('telephonyProvider.ariUrl')}</Label>
              <Input value={provider.ariUrl || ''} onChange={e => update({ ariUrl: e.target.value })} placeholder="https://asterisk.example.com:8089/ari" />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>{t('telephonyProvider.ariUsername')}</Label>
                <Input value={provider.ariUsername || ''} onChange={e => update({ ariUsername: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>{t('telephonyProvider.ariPassword')}</Label>
                <Input type="password" value={provider.ariPassword || ''} onChange={e => update({ ariPassword: e.target.value })} />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Test result */}
      {testResult && (
        <div className={`rounded-lg border p-3 ${testResult.ok ? 'border-green-500/30 bg-green-500/10' : 'border-destructive/30 bg-destructive/10'}`}>
          <p className={`text-xs ${testResult.ok ? 'text-green-700 dark:text-green-400' : 'text-destructive'}`}>
            {testResult.ok ? t('telephonyProvider.testSuccess') : `${t('telephonyProvider.testFailed')}: ${testResult.error || ''}`}
          </p>
        </div>
      )}

      {/* Webhook URL (shown after validation) */}
      {data.providerValidated && (
        <div className="flex items-center gap-2 rounded-lg border bg-muted/50 p-3">
          <div className="flex-1">
            <p className="text-xs font-medium">{t('setup.webhookUrl')}</p>
            <code className="text-xs text-muted-foreground">{window.location.origin}/telephony/voice</code>
          </div>
          <Button variant="ghost" size="sm" onClick={copyWebhookUrl}>
            <Copy className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={handleTest} disabled={testing || !provider.phoneNumber}>
          {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {testing ? t('telephonyProvider.testing') : t('telephonyProvider.testConnection')}
        </Button>
        <Button size="sm" onClick={handleSave} disabled={saving || !data.providerValidated}>
          {saving ? t('common.loading') : t('telephonyProvider.saveProvider')}
        </Button>
      </div>
    </div>
  )
}
