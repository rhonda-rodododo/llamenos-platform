import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '@/lib/toast'
import { SettingsSection } from '@/components/settings-section'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Shield, Copy, Loader2, CheckCircle2, XCircle,
  Phone, KeyRound, AlertTriangle, RefreshCw, Activity,
} from 'lucide-react'
import {
  updateMessagingConfig,
  testMessagingChannel,
  signalRegister,
  signalVerify,
  getSignalAccountInfo,
  getSignalIdentities,
  updateSignalIdentityTrust,
  getSignalQueueStats,
  type MessagingConfig,
  type SignalIdentityRecord,
  type SignalQueueStats,
} from '@/lib/api'

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

        {/* Registration Section */}
        <SignalRegistrationPanel bridgeUrl={signal.bridgeUrl} bridgeApiKey={signal.bridgeApiKey} />

        {/* Identity Trust Section */}
        <SignalIdentityPanel />

        {/* Queue Monitoring Section */}
        <SignalQueuePanel />
      </div>
    </SettingsSection>
  )
}

// ---------------------------------------------------------------------------
// Signal Registration Panel
// ---------------------------------------------------------------------------

function SignalRegistrationPanel({ bridgeUrl, bridgeApiKey }: { bridgeUrl: string; bridgeApiKey: string }) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [phoneNumber, setPhoneNumber] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [registering, setRegistering] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [step, setStep] = useState<'idle' | 'pending_verification' | 'verified' | 'failed'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [accountInfo, setAccountInfo] = useState<{ registered: boolean; uuid?: string } | null>(null)

  useEffect(() => {
    if (bridgeUrl && bridgeApiKey) {
      getSignalAccountInfo()
        .then(setAccountInfo)
        .catch(() => {})
    }
  }, [bridgeUrl, bridgeApiKey])

  async function handleRegister() {
    setRegistering(true)
    setError(null)
    try {
      const result = await signalRegister({ bridgeUrl, bridgeApiKey, phoneNumber })
      setStep(result.step)
      if (result.error) setError(result.error)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Registration failed')
      setStep('failed')
    } finally {
      setRegistering(false)
    }
  }

  async function handleVerify() {
    setVerifying(true)
    setError(null)
    try {
      const result = await signalVerify({ bridgeUrl, bridgeApiKey, phoneNumber, verificationCode })
      setStep(result.step)
      if (result.error) setError(result.error)
      if (result.step === 'verified') {
        toast('Signal number registered successfully', 'success')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verification failed')
      setStep('failed')
    } finally {
      setVerifying(false)
    }
  }

  return (
    <div className="mt-6 space-y-3 border-t pt-4">
      <div className="flex items-center gap-2">
        <Phone className="h-4 w-4 text-muted-foreground" />
        <h4 className="font-medium text-sm">Number Registration</h4>
        {accountInfo?.registered && (
          <Badge variant="outline" className="text-green-600 text-xs">
            <CheckCircle2 className="h-3 w-3 mr-1" /> Registered
          </Badge>
        )}
      </div>

      {!bridgeUrl && (
        <p className="text-xs text-muted-foreground">Configure bridge URL above to enable registration.</p>
      )}

      {bridgeUrl && step === 'idle' && (
        <div className="space-y-2">
          <Label htmlFor="signal-reg-number">Phone Number to Register</Label>
          <div className="flex gap-2">
            <Input
              id="signal-reg-number"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="+12125551234"
              data-testid="signal-reg-number"
            />
            <Button onClick={handleRegister} disabled={registering || !phoneNumber} size="sm">
              {registering ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Register'}
            </Button>
          </div>
        </div>
      )}

      {step === 'pending_verification' && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            A verification code was sent to {phoneNumber}. Enter it below.
          </p>
          <div className="flex gap-2">
            <Input
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value)}
              placeholder="123456"
              data-testid="signal-verification-code"
            />
            <Button onClick={handleVerify} disabled={verifying || !verificationCode} size="sm">
              {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Verify'}
            </Button>
          </div>
        </div>
      )}

      {step === 'verified' && (
        <p className="text-xs text-green-600">Registration complete. Update the registered number above and save.</p>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-2 dark:border-red-800 dark:bg-red-950/30">
          <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
          <p className="text-xs text-red-700 dark:text-red-400">{error}</p>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Signal Identity Trust Panel
// ---------------------------------------------------------------------------

function SignalIdentityPanel() {
  const { toast } = useToast()
  const [identities, setIdentities] = useState<SignalIdentityRecord[]>([])
  const [loading, setLoading] = useState(false)

  async function loadIdentities() {
    setLoading(true)
    try {
      const data = await getSignalIdentities()
      setIdentities(data.identities ?? [])
    } catch {
      // Signal identities endpoint may not be available
    } finally {
      setLoading(false)
    }
  }

  async function handleTrust(uuid: string, level: string) {
    try {
      await updateSignalIdentityTrust(uuid, level)
      toast('Trust level updated', 'success')
      loadIdentities()
    } catch {
      toast('Failed to update trust', 'error')
    }
  }

  return (
    <div className="mt-6 space-y-3 border-t pt-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-muted-foreground" />
          <h4 className="font-medium text-sm">Identity Trust</h4>
        </div>
        <Button variant="ghost" size="sm" onClick={loadIdentities} disabled={loading}>
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
        </Button>
      </div>

      {identities.length === 0 && !loading && (
        <p className="text-xs text-muted-foreground">
          No identity records yet. Identities are tracked as messages are received.
        </p>
      )}

      {identities.filter(i => i.trustLevel === 'UNTRUSTED').length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-2 dark:border-amber-800 dark:bg-amber-950/30">
          <p className="text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="inline h-3 w-3 mr-1" />
            {identities.filter(i => i.trustLevel === 'UNTRUSTED').length} contact(s) have changed identity keys and need review.
          </p>
        </div>
      )}

      {identities.length > 0 && (
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {identities.map(identity => (
            <div key={identity.id} className="flex items-center justify-between text-xs py-1 border-b last:border-b-0">
              <div className="flex items-center gap-2">
                <span className="font-mono">{identity.number.slice(-4).padStart(identity.number.length, '*')}</span>
                <Badge
                  variant="outline"
                  className={
                    identity.trustLevel === 'TRUSTED_VERIFIED' ? 'text-green-600' :
                    identity.trustLevel === 'UNTRUSTED' ? 'text-red-600' :
                    'text-yellow-600'
                  }
                >
                  {identity.trustLevel.replace('TRUSTED_', '').toLowerCase()}
                </Badge>
                {identity.keyChangeCount > 0 && (
                  <span className="text-muted-foreground">({identity.keyChangeCount} key changes)</span>
                )}
              </div>
              {identity.trustLevel === 'UNTRUSTED' && (
                <Button size="sm" variant="ghost" onClick={() => handleTrust(identity.uuid, 'TRUSTED_UNVERIFIED')}>
                  Trust
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Signal Queue Monitoring Panel
// ---------------------------------------------------------------------------

function SignalQueuePanel() {
  const [stats, setStats] = useState<SignalQueueStats | null>(null)
  const [loading, setLoading] = useState(false)

  async function loadStats() {
    setLoading(true)
    try {
      const data = await getSignalQueueStats()
      setStats(data)
    } catch {
      // Queue stats endpoint may not be available
    } finally {
      setLoading(false)
    }
  }

  const total = stats ? stats.pending + stats.processing + stats.failed + stats.dead : 0

  return (
    <div className="mt-6 space-y-3 border-t pt-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          <h4 className="font-medium text-sm">Message Queue</h4>
        </div>
        <Button variant="ghost" size="sm" onClick={loadStats} disabled={loading}>
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
        </Button>
      </div>

      {!stats && !loading && (
        <p className="text-xs text-muted-foreground">Click refresh to load queue statistics.</p>
      )}

      {stats && (
        <div className="grid grid-cols-5 gap-2 text-center">
          <div className="rounded-md bg-muted p-2">
            <div className="text-lg font-bold">{stats.pending}</div>
            <div className="text-[10px] text-muted-foreground">Pending</div>
          </div>
          <div className="rounded-md bg-muted p-2">
            <div className="text-lg font-bold">{stats.processing}</div>
            <div className="text-[10px] text-muted-foreground">Processing</div>
          </div>
          <div className="rounded-md bg-muted p-2">
            <div className="text-lg font-bold text-green-600">{stats.sent}</div>
            <div className="text-[10px] text-muted-foreground">Sent</div>
          </div>
          <div className="rounded-md bg-muted p-2">
            <div className="text-lg font-bold text-amber-600">{stats.failed}</div>
            <div className="text-[10px] text-muted-foreground">Failed</div>
          </div>
          <div className="rounded-md bg-muted p-2">
            <div className="text-lg font-bold text-red-600">{stats.dead}</div>
            <div className="text-[10px] text-muted-foreground">Dead</div>
          </div>
        </div>
      )}

      {stats && stats.dead > 0 && (
        <p className="text-xs text-red-600">
          <AlertTriangle className="inline h-3 w-3 mr-1" />
          {stats.dead} message(s) in dead-letter queue. Review and retry from the conversation view.
        </p>
      )}
    </div>
  )
}
