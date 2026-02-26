import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useConfig } from '@/lib/config'
import { useTheme } from '@/lib/theme'
import {
  createProvisioningRoom,
  pollProvisioningRoom,
  decryptProvisionedNsec,
  computeSASForNewDevice,
  type ProvisioningSession,
} from '@/lib/provisioning'
import * as keyManager from '@/lib/key-manager'
import { hasStoredKey } from '@/lib/key-store'
import { LogoMark } from '@/components/logo-mark'
import { LanguageSelect } from '@/components/language-select'
import { PinInput } from '@/components/pin-input'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Smartphone, Loader2, CheckCircle2, XCircle, ShieldCheck, Sun, Moon, Monitor } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'

export const Route = createFileRoute('/link-device')({
  component: LinkDevicePage,
})

type Step = 'init' | 'waiting' | 'verify-sas' | 'pin-create' | 'pin-confirm' | 'done' | 'error'

function LinkDevicePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { hotlineName } = useConfig()
  const { theme, setTheme } = useTheme()
  const [step, setStep] = useState<Step>('init')
  const [session, setSession] = useState<ProvisioningSession | null>(null)
  const [error, setError] = useState('')
  const [sasCode, setSasCode] = useState('')
  const [encryptedNsecData, setEncryptedNsecData] = useState<{ encryptedNsec: string; primaryPubkey: string } | null>(null)
  const [nsec, setNsec] = useState('')
  const [pin1, setPin1] = useState('')
  const [pin2, setPin2] = useState('')
  const [pinError, setPinError] = useState('')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // If user already has a stored key, redirect to login
  useEffect(() => {
    if (hasStoredKey()) {
      navigate({ to: '/login' })
    }
  }, [navigate])

  async function startLinking() {
    try {
      setStep('waiting')
      const s = await createProvisioningRoom()
      setSession(s)

      // Start polling for the primary device's response
      pollRef.current = setInterval(async () => {
        try {
          const status = await pollProvisioningRoom(s.roomId, s.token)
          if (status.status === 'ready' && status.encryptedNsec && status.primaryPubkey) {
            clearInterval(pollRef.current!)
            pollRef.current = null
            // Compute SAS for verification before decrypting
            const sas = computeSASForNewDevice(s.ephemeralSecret, status.primaryPubkey)
            setSasCode(sas)
            setEncryptedNsecData({ encryptedNsec: status.encryptedNsec, primaryPubkey: status.primaryPubkey })
            setStep('verify-sas')
          } else if (status.status === 'expired') {
            clearInterval(pollRef.current!)
            pollRef.current = null
            setError(t('deviceLink.linkExpired'))
            setStep('error')
          }
        } catch {
          // Transient error, keep polling
        }
      }, 2000)
    } catch {
      setError(t('deviceLink.linkFailed'))
      setStep('error')
    }
  }

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  function handleSASConfirm() {
    if (!session || !encryptedNsecData) return
    try {
      const decryptedNsec = decryptProvisionedNsec(
        encryptedNsecData.encryptedNsec,
        encryptedNsecData.primaryPubkey,
        session.ephemeralSecret,
      )
      setNsec(decryptedNsec)
      setEncryptedNsecData(null)
      setStep('pin-create')
    } catch {
      setError(t('deviceLink.decryptFailed'))
      setStep('error')
    }
  }

  function handleSASMismatch() {
    setEncryptedNsecData(null)
    setSasCode('')
    setError(t('deviceLink.sasMismatch'))
    setStep('error')
  }

  async function handlePinCreate(pin: string) {
    setPin1(pin)
    setStep('pin-confirm')
  }

  async function handlePinConfirm(pin: string) {
    if (pin !== pin1) {
      setPinError(t('onboarding.pinMismatch'))
      setPin2('')
      return
    }
    try {
      await keyManager.importKey(nsec, pin)
      // Zero out nsec from memory
      setNsec('')
      setStep('done')
    } catch {
      setPinError(t('common.error'))
    }
  }

  function handleDone() {
    navigate({ to: '/login' })
  }

  const qrData = session ? JSON.stringify({ r: session.roomId, t: session.token }) : ''
  const shortCode = session ? session.roomId.slice(0, 8).toUpperCase() : ''

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-8 bg-background">
      {/* Header bar */}
      <div className="absolute top-4 right-4 flex items-center gap-2">
        <LanguageSelect />
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" onClick={() => setTheme('light')} aria-label="Light">
            <Sun className={`h-4 w-4 ${theme === 'light' ? 'text-primary' : ''}`} />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setTheme('dark')} aria-label="Dark">
            <Moon className={`h-4 w-4 ${theme === 'dark' ? 'text-primary' : ''}`} />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setTheme('system')} aria-label="System">
            <Monitor className={`h-4 w-4 ${theme === 'system' ? 'text-primary' : ''}`} />
          </Button>
        </div>
      </div>

      <div className="mb-6 text-center">
        <LogoMark className="mx-auto h-10 w-10 text-primary" />
        <h1 className="mt-2 text-2xl font-bold">{hotlineName || 'Hotline'}</h1>
      </div>

      <Card className="w-full max-w-md" data-testid="link-device-card">
        {step === 'init' && (
          <>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Smartphone className="h-5 w-5" />
                {t('deviceLink.title')}
              </CardTitle>
              <CardDescription>{t('deviceLink.description')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">{t('deviceLink.instructions')}</p>
              <Button onClick={startLinking} className="w-full" data-testid="start-linking">
                {t('deviceLink.startLinking')}
              </Button>
              <Button variant="ghost" className="w-full" onClick={() => navigate({ to: '/login' })}>
                {t('common.back')}
              </Button>
            </CardContent>
          </>
        )}

        {step === 'waiting' && session && (
          <>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin" />
                {t('deviceLink.waitingForPrimary')}
              </CardTitle>
              <CardDescription>{t('deviceLink.scanFromPrimary')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-center rounded-lg bg-white p-4" data-testid="provisioning-qr">
                <QRCodeSVG value={qrData} size={200} level="M" />
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">{t('deviceLink.orEnterCode')}</p>
                <code className="mt-1 block text-xl font-mono font-bold tracking-widest" data-testid="short-code">
                  {shortCode}
                </code>
              </div>
              <p className="text-xs text-center text-muted-foreground">{t('deviceLink.expiresIn5')}</p>
            </CardContent>
          </>
        )}

        {step === 'verify-sas' && (
          <>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5" />
                {t('deviceLink.verifySAS')}
              </CardTitle>
              <CardDescription>{t('deviceLink.verifySASDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border-2 border-primary/20 bg-primary/5 p-6 text-center" data-testid="sas-code">
                <p className="text-xs text-muted-foreground mb-2">{t('deviceLink.securityCode')}</p>
                <p className="text-4xl font-mono font-bold tracking-[0.3em]">{sasCode}</p>
              </div>
              <p className="text-sm text-muted-foreground text-center">{t('deviceLink.compareCodes')}</p>
              <div className="flex gap-2">
                <Button onClick={handleSASConfirm} className="flex-1" data-testid="sas-match">
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                  {t('deviceLink.codesMatch')}
                </Button>
                <Button onClick={handleSASMismatch} variant="destructive" className="flex-1" data-testid="sas-mismatch">
                  <XCircle className="h-4 w-4 mr-1" />
                  {t('deviceLink.codesDontMatch')}
                </Button>
              </div>
            </CardContent>
          </>
        )}

        {step === 'pin-create' && (
          <>
            <CardHeader>
              <CardTitle>{t('onboarding.createPin')}</CardTitle>
              <CardDescription>{t('onboarding.pinDescription')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <PinInput
                length={6}
                value={pin1}
                onChange={setPin1}
                onComplete={handlePinCreate}
                autoFocus
              />
            </CardContent>
          </>
        )}

        {step === 'pin-confirm' && (
          <>
            <CardHeader>
              <CardTitle>{t('onboarding.confirmPin')}</CardTitle>
              <CardDescription>{t('onboarding.confirmPinDescription')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <PinInput
                length={6}
                value={pin2}
                onChange={setPin2}
                onComplete={handlePinConfirm}
                autoFocus
              />
              {pinError && <p className="text-sm text-destructive text-center">{pinError}</p>}
            </CardContent>
          </>
        )}

        {step === 'done' && (
          <>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                {t('deviceLink.linkSuccess')}
              </CardTitle>
              <CardDescription>{t('deviceLink.linkSuccessDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={handleDone} className="w-full" data-testid="continue-to-login">
                {t('common.continue')}
              </Button>
            </CardContent>
          </>
        )}

        {step === 'error' && (
          <>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <XCircle className="h-5 w-5 text-destructive" />
                {t('deviceLink.linkFailed')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-destructive">{error}</p>
              <Button onClick={() => { setStep('init'); setError('') }} className="w-full">
                {t('common.retry')}
              </Button>
              <Button variant="ghost" className="w-full" onClick={() => navigate({ to: '/login' })}>
                {t('common.back')}
              </Button>
            </CardContent>
          </>
        )}
      </Card>
    </div>
  )
}
