import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '@/lib/toast'
import { SettingsSection } from '@/components/settings-section'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Shield, Copy, Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { updateMessagingConfig, testMessagingChannel, type MessagingConfig } from '@/lib/api'

interface SignalChannelSectionProps {
  config: MessagingConfig
  onConfigChange: (config: MessagingConfig) => void
  expanded: boolean
  onToggle: (open: boolean) => void
  statusSummary?: string
}

export function SignalChannelSection({
  config,
  onConfigChange,
  expanded,
  onToggle,
  statusSummary,
}: SignalChannelSectionProps) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<boolean | null>(null)
  const [saving, setSaving] = useState(false)

  const signal = config.signal || {
    bridgeUrl: '',
    bridgeApiKey: '',
    webhookSecret: '',
    registeredNumber: '',
    autoResponse: '',
  }

  const webhookUrl = `${window.location.origin}/api/messaging/signal/webhook`

  function updateSignal(updates: Record<string, unknown>) {
    const updated = { ...config, signal: { ...signal, ...updates } }
    onConfigChange(updated)
  }

  async function handleSave() {
    setSaving(true)
    try {
      await updateMessagingConfig({
        ...config,
        enabledChannels: config.enabledChannels.includes('signal')
          ? config.enabledChannels
          : [...config.enabledChannels, 'signal'],
        signal: { ...signal },
      })
      toast(t('common.success'), 'success')
    } catch {
      toast(t('common.error'), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleTest() {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await testMessagingChannel('signal')
      setTestResult(res.connected)
    } catch {
      setTestResult(false)
    } finally {
      setTesting(false)
    }
  }

  return (
    <SettingsSection
      id="signal-channel"
      title={t('signal.title', { defaultValue: 'Signal Channel' })}
      description={t('signal.description', { defaultValue: 'End-to-end encrypted messaging via Signal bridge.' })}
      icon={<Shield className="h-5 w-5 text-muted-foreground" />}
      expanded={expanded}
      onToggle={onToggle}
      statusSummary={statusSummary}
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3">
          <p className="text-xs text-blue-700 dark:text-blue-400">
            {t('signal.e2eeNote', { defaultValue: 'Signal provides end-to-end encryption to the bridge. Messages are re-encrypted with your hotline\'s keys before storage.' })}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="signal-bridge-url">{t('signal.bridgeUrl', { defaultValue: 'Bridge URL' })}</Label>
          <Input
            id="signal-bridge-url"
            value={signal.bridgeUrl}
            onChange={(e) => updateSignal({ bridgeUrl: e.target.value })}
            placeholder="https://signal-bridge.internal:8080"
            data-testid="signal-bridge-url"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="signal-api-key">{t('signal.bridgeApiKey', { defaultValue: 'Bridge API Key' })}</Label>
          <Input
            id="signal-api-key"
            type="password"
            value={signal.bridgeApiKey}
            onChange={(e) => updateSignal({ bridgeApiKey: e.target.value })}
            data-testid="signal-api-key"
          />
        </div>

        <div className="space-y-2">
          <Label>{t('signal.webhookUrl', { defaultValue: 'Webhook URL' })}</Label>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all rounded-md bg-muted px-3 py-2 text-xs">{webhookUrl}</code>
            <Button
              variant="outline"
              size="icon"
              onClick={() => { navigator.clipboard.writeText(webhookUrl); toast(t('common.success'), 'success') }}
              aria-label={t('a11y.copyToClipboard')}
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="signal-webhook-secret">{t('signal.webhookSecret', { defaultValue: 'Webhook Secret' })}</Label>
          <Input
            id="signal-webhook-secret"
            type="password"
            value={signal.webhookSecret || ''}
            onChange={(e) => updateSignal({ webhookSecret: e.target.value })}
            data-testid="signal-webhook-secret"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="signal-registered-number">{t('signal.registeredNumber', { defaultValue: 'Registered Number' })}</Label>
          <Input
            id="signal-registered-number"
            value={signal.registeredNumber}
            onChange={(e) => updateSignal({ registeredNumber: e.target.value })}
            placeholder="+12125551234"
            data-testid="signal-registered-number"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="signal-auto-response">{t('signal.autoResponse', { defaultValue: 'Auto-Response' })}</Label>
          <Input
            id="signal-auto-response"
            value={signal.autoResponse || ''}
            onChange={(e) => updateSignal({ autoResponse: e.target.value })}
            placeholder={t('setup.autoResponsePlaceholder')}
          />
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={handleSave} disabled={saving || !signal.bridgeUrl}>
            {saving ? t('common.loading') : t('common.save')}
          </Button>
          <Button variant="outline" onClick={handleTest} disabled={testing || !signal.bridgeUrl}>
            {testing ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> {t('telephonyProvider.testing')}</>
            ) : (
              t('telephonyProvider.testConnection')
            )}
          </Button>
          {testResult !== null && (
            <Badge variant="outline" className={testResult ? 'text-green-600' : 'text-red-600'}>
              {testResult ? (
                <><CheckCircle2 className="h-3 w-3" /> {t('telephonyProvider.testSuccess')}</>
              ) : (
                <><XCircle className="h-3 w-3" /> {t('telephonyProvider.testFailed')}</>
              )}
            </Badge>
          )}
        </div>
      </div>
    </SettingsSection>
  )
}
