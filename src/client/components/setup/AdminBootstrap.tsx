import { useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/lib/auth'
import { useToast } from '@/lib/toast'
import { generateKeyPair, createAuthToken } from '@/lib/crypto'
import { isValidPin } from '@/lib/key-store'
import * as keyManager from '@/lib/key-manager'
import { bootstrapAdmin } from '@/lib/api'
import { createBackup, generateRecoveryKey, downloadBackupFile } from '@/lib/backup'
import { setLanguage } from '@/lib/i18n'
import { LANGUAGES } from '@shared/languages'
import { PinInput } from '@/components/pin-input'
import { Button } from '@/components/ui/button'
import { LogoMark } from '@/components/logo-mark'
import {
  Globe,
  KeyRound,
  ShieldCheck,
  ArrowRight,
  ArrowLeft,
  Check,
  Copy,
  Download,
  AlertTriangle,
  Loader2,
} from 'lucide-react'

type BootstrapStep = 'welcome' | 'pin' | 'generating' | 'backup' | 'complete'

interface AdminBootstrapProps {
  onComplete: () => void
}

export function AdminBootstrap({ onComplete }: AdminBootstrapProps) {
  const { t, i18n } = useTranslation()
  const { signIn } = useAuth()
  const { toast } = useToast()

  const [step, setStep] = useState<BootstrapStep>('welcome')
  const [uiLang, setUiLang] = useState(i18n.language || 'en')
  const [error, setError] = useState('')

  // PIN state
  const [pin1, setPin1] = useState('')
  const [pin2, setPin2] = useState('')
  const [pinStep, setPinStep] = useState<'create' | 'confirm'>('create')
  const [pinError, setPinError] = useState('')

  // Keypair state
  const [nsec, setNsec] = useState('')
  const [confirmedPin, setConfirmedPin] = useState('')

  // Recovery key & backup verification
  const [recoveryKeyStr, setRecoveryKeyStr] = useState('')
  const [verifyChars, setVerifyChars] = useState<{ index: number; char: string }[]>([])
  const [verifyInputs, setVerifyInputs] = useState<string[]>([])
  const [backupVerified, setBackupVerified] = useState(false)
  const [backupDownloaded, setBackupDownloaded] = useState(false)
  const [pubkey, setPubkey] = useState('')

  function handlePinComplete(enteredPin: string) {
    if (pinStep === 'create') {
      if (!isValidPin(enteredPin)) {
        setPinError(t('pin.tooShort'))
        return
      }
      setPin1(enteredPin)
      setPinStep('confirm')
      setPin2('')
      setPinError('')
    } else {
      if (enteredPin !== pin1) {
        setPinError(t('pin.mismatch'))
        setPin2('')
        return
      }
      generateKeypairAndBootstrap(enteredPin)
    }
  }

  async function generateKeypairAndBootstrap(pin: string) {
    setStep('generating')
    setError('')
    try {
      const kp = generateKeyPair()
      setNsec(kp.nsec)
      setPubkey(kp.publicKey)
      setConfirmedPin(pin)

      // Create Schnorr signature to prove key ownership
      const tokenJson = createAuthToken(kp.secretKey, Date.now())
      const parsed = JSON.parse(tokenJson)

      // Call bootstrap endpoint
      await bootstrapAdmin(parsed.pubkey, parsed.timestamp, parsed.token)

      // Generate recovery key
      const rk = generateRecoveryKey()
      setRecoveryKeyStr(rk)

      // Set up verification (4 random chars from recovery key, skipping dashes)
      const rkNoDash = rk.replace(/-/g, '')
      const indices: number[] = []
      while (indices.length < 4) {
        const idx = Math.floor(Math.random() * rkNoDash.length)
        if (!indices.includes(idx)) indices.push(idx)
      }
      indices.sort((a, b) => a - b)
      setVerifyChars(indices.map(i => ({ index: i, char: rkNoDash[i] })))
      setVerifyInputs(Array(4).fill(''))
      setStep('backup')
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
      setStep('pin')
      setPinStep('create')
      setPin1('')
      setPin2('')
    }
  }

  function checkBackupVerification() {
    const correct = verifyChars.every((vc, i) => verifyInputs[i].toLowerCase() === vc.char.toLowerCase())
    if (correct) {
      setBackupVerified(true)
    } else {
      toast(t('onboarding.verifyFailed'), 'error')
    }
  }

  async function downloadBackup() {
    const backup = await createBackup(nsec, confirmedPin, pubkey, recoveryKeyStr)
    downloadBackupFile(backup)
    setBackupDownloaded(true)
    toast(t('onboarding.backupDownloaded'), 'success')
  }

  async function handleComplete() {
    try {
      // Import key via key manager (encrypts with PIN and loads into memory)
      await keyManager.importKey(nsec, confirmedPin)
      // Mark bootstrap as complete BEFORE signIn triggers re-renders
      sessionStorage.setItem('bootstrapComplete', '1')
      await signIn(nsec)
      setStep('complete')
      // Brief delay for the success message, then advance to wizard
      setTimeout(onComplete, 1000)
    } catch {
      toast(t('common.error'), 'error')
    }
  }

  return (
    <div className="space-y-6">
      {step === 'welcome' && (
        <>
          <div className="text-center space-y-4">
            <div className="mx-auto">
              <LogoMark size="xl" />
            </div>
            <h2 className="text-2xl font-bold">
              {t('setup.bootstrap.welcomeTitle', { defaultValue: 'Welcome to your hotline' })}
            </h2>
            <p className="text-muted-foreground">
              {t('setup.bootstrap.welcomeDescription', { defaultValue: "Let's create your admin account. Your cryptographic identity is generated in your browser — the server never sees your private key." })}
            </p>
          </div>

          {/* Language selection */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Globe className="h-4 w-4 text-muted-foreground" />
              {t('profile.uiLanguage')}
            </div>
            <div className="flex flex-wrap gap-2">
              {LANGUAGES.map(lang => (
                <button
                  key={lang.code}
                  onClick={() => { setUiLang(lang.code); setLanguage(lang.code) }}
                  className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                    uiLang === lang.code
                      ? 'border-primary bg-primary/10 text-primary font-medium'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <span>{lang.flag}</span>
                  {lang.label}
                  {uiLang === lang.code && <Check className="h-3 w-3" />}
                </button>
              ))}
            </div>
          </div>

          <Button onClick={() => setStep('pin')} className="w-full" size="lg">
            {t('setup.bootstrap.getStarted', { defaultValue: 'Get Started' })}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </>
      )}

      {step === 'pin' && (
        <div className="space-y-6">
          <div className="text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <KeyRound className="h-6 w-6 text-primary" />
            </div>
            <h2 className="text-xl font-bold">
              {pinStep === 'create' ? t('pin.createTitle') : t('pin.confirmTitle')}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {pinStep === 'create' ? t('pin.createDescription') : t('pin.confirmDescription')}
            </p>
          </div>

          {error && (
            <p className="text-sm text-destructive text-center">{error}</p>
          )}

          <PinInput
            length={6}
            value={pinStep === 'create' ? pin1 : pin2}
            onChange={pinStep === 'create' ? setPin1 : setPin2}
            onComplete={handlePinComplete}
            error={!!pinError}
            autoFocus
          />
          {pinError && (
            <p className="text-center text-sm text-destructive">{pinError}</p>
          )}
          {pinStep === 'confirm' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setPinStep('create'); setPin1(''); setPin2(''); setPinError('') }}
              className="w-full"
            >
              <ArrowLeft className="h-4 w-4" />
              {t('common.back')}
            </Button>
          )}
          {pinStep === 'create' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setStep('welcome')}
              className="w-full"
            >
              <ArrowLeft className="h-4 w-4" />
              {t('common.back')}
            </Button>
          )}
        </div>
      )}

      {step === 'generating' && (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">{t('setup.bootstrap.generating', { defaultValue: 'Creating your admin account...' })}</p>
        </div>
      )}

      {step === 'backup' && (
        <div className="space-y-6">
          <div className="text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <ShieldCheck className="h-6 w-6 text-primary" />
            </div>
            <h2 className="text-xl font-bold">{t('onboarding.backupTitle')}</h2>
            <p className="text-sm text-muted-foreground mt-1">{t('onboarding.backupDescription')}</p>
          </div>

          {/* Recovery key display */}
          <div className="space-y-2">
            <p className="text-sm font-medium">{t('onboarding.recoveryKey')}</p>
            <div className="flex items-center gap-2">
              <code data-testid="recovery-key" className="flex-1 break-all rounded-md bg-muted px-3 py-2 text-sm font-mono tracking-wider">
                {recoveryKeyStr}
              </code>
              <Button
                variant="outline"
                size="icon"
                onClick={() => { navigator.clipboard.writeText(recoveryKeyStr); toast(t('common.success'), 'success'); setTimeout(() => navigator.clipboard.writeText('').catch(() => {}), 30000) }}
                aria-label={t('a11y.copyToClipboard')}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/20 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{t('onboarding.recoveryKeyWarning')}</span>
            </div>
          </div>

          {/* Download backup */}
          <Button variant="outline" onClick={downloadBackup} className="w-full">
            <Download className="h-4 w-4" />
            {t('onboarding.downloadBackup')}
          </Button>

          {/* Verification */}
          {!backupVerified && (
            <div className="space-y-3">
              <p className="text-sm font-medium">{t('onboarding.verifyTitle')}</p>
              <p className="text-xs text-muted-foreground">{t('onboarding.verifyDescription')}</p>
              <div className="grid grid-cols-2 gap-3">
                {verifyChars.map((vc, i) => (
                  <div key={vc.index} className="space-y-1">
                    <label className="text-xs text-muted-foreground">
                      {t('onboarding.charAtPosition', { position: vc.index + 1 })}
                    </label>
                    <input
                      type="text"
                      maxLength={1}
                      value={verifyInputs[i]}
                      onChange={e => {
                        const newInputs = [...verifyInputs]
                        newInputs[i] = e.target.value
                        setVerifyInputs(newInputs)
                      }}
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-center font-mono text-sm uppercase focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                    />
                  </div>
                ))}
              </div>
              <Button
                onClick={checkBackupVerification}
                disabled={verifyInputs.some(v => !v)}
                className="w-full"
              >
                {t('onboarding.verifyButton')}
              </Button>
            </div>
          )}

          {backupVerified && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-lg bg-green-50 p-3 text-sm text-green-800 dark:bg-green-950/20 dark:text-green-300">
                <Check className="h-4 w-4" />
                {t('onboarding.verifySuccess')}
              </div>
              <Button onClick={handleComplete} className="w-full" size="lg" disabled={!backupDownloaded}>
                {t('setup.bootstrap.continueSetup', { defaultValue: 'Continue to Setup' })}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      )}

      {step === 'complete' && (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-950/20">
            <Check className="h-6 w-6 text-green-600 dark:text-green-400" />
          </div>
          <p className="text-lg font-medium">{t('setup.bootstrap.complete', { defaultValue: 'Admin account created!' })}</p>
          <p className="text-sm text-muted-foreground">{t('setup.bootstrap.completeSub', { defaultValue: "Now let's configure your hotline." })}</p>
        </div>
      )}
    </div>
  )
}
