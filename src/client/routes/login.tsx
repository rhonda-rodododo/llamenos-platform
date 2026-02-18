import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/lib/auth'
import { useConfig } from '@/lib/config'
import { useTheme } from '@/lib/theme'
import { isValidNsec } from '@/lib/crypto'
import { hasStoredKey } from '@/lib/key-store'
import { readBackupFile, restoreFromBackupWithPin, restoreFromBackupWithRecoveryKey } from '@/lib/backup'
import * as keyManager from '@/lib/key-manager'
import { isWebAuthnAvailable } from '@/lib/webauthn'
import { KeyRound, LogIn, Shield, Sun, Moon, Monitor, Fingerprint, Key } from 'lucide-react'
import { LogoMark } from '@/components/logo-mark'
import { LanguageSelect } from '@/components/language-select'
import { PinInput } from '@/components/pin-input'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'

export const Route = createFileRoute('/login')({
  component: LoginPage,
})

function LoginPage() {
  const { t } = useTranslation()
  const { signIn, signInWithPasskey, unlockWithPin, error, isLoading } = useAuth()
  const { hotlineName } = useConfig()
  const { theme, setTheme } = useTheme()
  const navigate = useNavigate()
  const [validationError, setValidationError] = useState('')
  const [showRecovery, setShowRecovery] = useState(false)
  const [passkeyLoading, setPasskeyLoading] = useState(false)
  const webauthnAvailable = isWebAuthnAvailable()
  const storedKeyExists = hasStoredKey()

  // Recovery state
  const [recoveryMode, setRecoveryMode] = useState<'none' | 'nsec' | 'backup'>('none')
  const [nsec, setNsec] = useState('')
  const [backupFile, setBackupFile] = useState<import('@/lib/backup').BackupFile | null>(null)
  const [recoveryPin, setRecoveryPin] = useState('')
  const [recoveryKey, setRecoveryKey] = useState('')
  const [recoveryStep, setRecoveryStep] = useState<'upload' | 'decrypt' | 'newpin'>('upload')
  const [recoveredNsec, setRecoveredNsec] = useState('')
  const [newPin1, setNewPin1] = useState('')
  const [newPin2, setNewPin2] = useState('')
  const [newPinStep, setNewPinStep] = useState<'create' | 'confirm'>('create')
  const [pinError, setPinError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // --- PIN unlock (primary flow when key exists) ---
  async function handlePinUnlock(pin: string): Promise<boolean> {
    setValidationError('')
    const success = await unlockWithPin(pin)
    if (success) {
      navigate({ to: '/' })
      return true
    }
    return false
  }

  function handlePinWipe() {
    keyManager.wipeKey()
    setValidationError(t('lock.keyWiped', { defaultValue: 'Key wiped after too many failed attempts. Please restore from backup.' }))
    setShowRecovery(true)
  }

  // --- Direct nsec login (recovery) ---
  async function handleNsecSubmit(e: React.FormEvent) {
    e.preventDefault()
    setValidationError('')
    if (!nsec.trim() || !isValidNsec(nsec.trim())) {
      setValidationError(t('auth.invalidKey'))
      return
    }
    await signIn(nsec.trim())
    navigate({ to: '/' })
  }

  // --- Passkey login ---
  async function handlePasskeyLogin() {
    setValidationError('')
    setPasskeyLoading(true)
    try {
      await signInWithPasskey()
      navigate({ to: '/' })
    } catch (err) {
      setValidationError(err instanceof Error ? err.message : t('webauthn.signInError'))
    } finally {
      setPasskeyLoading(false)
    }
  }

  // --- Backup file restore ---
  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const backup = await readBackupFile(file)
    if (!backup) {
      setValidationError(t('auth.invalidBackup'))
      return
    }
    setBackupFile(backup)
    setRecoveryStep('decrypt')
    setValidationError('')
  }

  async function handleBackupDecrypt() {
    if (!backupFile) return
    setValidationError('')

    let nsecResult: string | null = null

    // Try recovery key first if provided
    if (recoveryKey.trim()) {
      nsecResult = await restoreFromBackupWithRecoveryKey(backupFile, recoveryKey.trim())
    }
    // Try PIN if recovery key didn't work
    if (!nsecResult && recoveryPin.trim()) {
      nsecResult = await restoreFromBackupWithPin(backupFile, recoveryPin.trim())
    }

    if (!nsecResult) {
      setValidationError(t('auth.decryptFailed', { defaultValue: 'Failed to decrypt backup. Check your PIN or recovery key.' }))
      return
    }

    setRecoveredNsec(nsecResult)
    setRecoveryStep('newpin')
  }

  async function handleNewPinComplete(pin: string) {
    if (newPinStep === 'create') {
      if (!/^\d{4,6}$/.test(pin)) {
        setPinError(t('pin.tooShort'))
        return
      }
      setNewPin1(pin)
      setNewPinStep('confirm')
      setNewPin2('')
      setPinError('')
    } else {
      if (pin !== newPin1) {
        setPinError(t('pin.mismatch'))
        setNewPin2('')
        return
      }
      // Import the recovered key with the new PIN
      try {
        await keyManager.importKey(recoveredNsec, pin)
        await signIn(recoveredNsec)
        navigate({ to: '/' })
      } catch {
        setValidationError(t('common.error'))
      }
    }
  }

  // --- If stored key exists, show PIN entry as primary ---
  if (storedKeyExists && !showRecovery) {
    return (
      <div className="relative flex min-h-screen items-center justify-center bg-background overflow-hidden">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 top-1/3 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/5 blur-3xl" />
        </div>

        <Card className="relative z-10 w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-500">
          <CardHeader className="text-center">
            <div className="mx-auto mb-3">
              <LogoMark size="xl" className="animate-in fade-in zoom-in duration-700" />
            </div>
            <CardTitle className="text-2xl">{t('auth.loginTitle', { name: hotlineName })}</CardTitle>
            <CardDescription>{t('pin.enterPin', { defaultValue: 'Enter your PIN to unlock' })}</CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Language & theme toggles */}
            <div className="flex items-center justify-center gap-2">
              <LanguageSelect size="sm" />
              <span className="h-4 w-px bg-border" />
              {([['system', Monitor], ['light', Sun], ['dark', Moon]] as const).map(([value, Icon]) => (
                <Button
                  key={value}
                  variant={theme === value ? 'secondary' : 'ghost'}
                  size="xs"
                  onClick={() => setTheme(value)}
                  title={t(`a11y.theme${value.charAt(0).toUpperCase() + value.slice(1)}`)}
                  aria-label={t(`a11y.theme${value.charAt(0).toUpperCase() + value.slice(1)}`)}
                >
                  <Icon className="h-3 w-3" />
                </Button>
              ))}
            </div>

            <PinUnlockInline onUnlock={handlePinUnlock} onWipe={handlePinWipe} />

            {(validationError || error) && (
              <p className="flex items-center gap-1.5 text-sm text-destructive">
                {validationError || error}
              </p>
            )}

            {/* Passkey login */}
            {webauthnAvailable && (
              <>
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-border" />
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="bg-card px-2 text-muted-foreground">{t('common.or', { defaultValue: 'or' })}</span>
                  </div>
                </div>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handlePasskeyLogin}
                  disabled={isLoading || passkeyLoading}
                >
                  {passkeyLoading ? t('webauthn.signingIn', { defaultValue: 'Signing in...' }) : (
                    <>
                      <Fingerprint className="h-4 w-4" />
                      {t('webauthn.signInWithPasskey', { defaultValue: 'Sign in with passkey' })}
                    </>
                  )}
                </Button>
              </>
            )}

            {/* Recovery options */}
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => setShowRecovery(true)}
            >
              <Key className="h-3.5 w-3.5" />
              {t('recovery.options', { defaultValue: 'Recovery options' })}
            </Button>
          </CardContent>

          <CardFooter className="justify-center">
            <p className="flex items-center gap-1.5 rounded-full bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary">
              <Shield className="h-3 w-3" />
              {t('auth.securityNote')}
            </p>
          </CardFooter>
        </Card>
      </div>
    )
  }

  // --- Recovery / first-time login (no stored key) ---
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/3 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/5 blur-3xl" />
      </div>

      <Card className="relative z-10 w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-500">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3">
            <LogoMark size="xl" className="animate-in fade-in zoom-in duration-700" />
          </div>
          <CardTitle className="text-2xl">{t('auth.loginTitle', { name: hotlineName })}</CardTitle>
          <CardDescription>
            {storedKeyExists
              ? t('recovery.title', { defaultValue: 'Recover your account' })
              : t('auth.loginDescription')}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Language & theme toggles */}
          <div className="flex items-center justify-center gap-2">
            <LanguageSelect size="sm" />
            <span className="h-4 w-px bg-border" />
            {([['system', Monitor], ['light', Sun], ['dark', Moon]] as const).map(([value, Icon]) => (
              <Button
                key={value}
                variant={theme === value ? 'secondary' : 'ghost'}
                size="xs"
                onClick={() => setTheme(value)}
                title={t(`a11y.theme${value.charAt(0).toUpperCase() + value.slice(1)}`)}
                aria-label={t(`a11y.theme${value.charAt(0).toUpperCase() + value.slice(1)}`)}
              >
                <Icon className="h-3 w-3" />
              </Button>
            ))}
          </div>

          {(validationError || error) && (
            <p className="flex items-center gap-1.5 text-sm text-destructive">
              {validationError || error}
            </p>
          )}

          {/* Backup file restore */}
          {recoveryMode !== 'nsec' && (
            <div className="space-y-3">
              {recoveryStep === 'upload' && (
                <>
                  <p className="text-sm text-muted-foreground">{t('auth.selectBackupFile')}</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json"
                    onChange={handleFileSelect}
                    className="block w-full text-sm file:mr-4 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary/90"
                  />
                </>
              )}

              {recoveryStep === 'decrypt' && backupFile && (
                <div className="space-y-3">
                  <p className="text-sm font-medium">{t('recovery.decryptBackup', { defaultValue: 'Decrypt your backup' })}</p>
                  <div className="space-y-2">
                    <Label>{t('recovery.enterRecoveryKey', { defaultValue: 'Recovery Key' })}</Label>
                    <Input
                      value={recoveryKey}
                      onChange={e => setRecoveryKey(e.target.value)}
                      placeholder="XXXX-XXXX-XXXX-..."
                      autoComplete="off"
                    />
                  </div>
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t border-border" />
                    </div>
                    <div className="relative flex justify-center text-xs">
                      <span className="bg-card px-2 text-muted-foreground">{t('common.or', { defaultValue: 'or' })}</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>{t('pin.enterPin', { defaultValue: 'PIN' })}</Label>
                    <Input
                      type="password"
                      inputMode="numeric"
                      value={recoveryPin}
                      onChange={e => setRecoveryPin(e.target.value)}
                      placeholder="••••••"
                      maxLength={6}
                      autoComplete="off"
                    />
                  </div>
                  <Button onClick={handleBackupDecrypt} className="w-full" disabled={!recoveryKey.trim() && !recoveryPin.trim()}>
                    {t('recovery.decrypt', { defaultValue: 'Decrypt' })}
                  </Button>
                </div>
              )}

              {recoveryStep === 'newpin' && (
                <div className="space-y-3">
                  <p className="text-sm font-medium">
                    {newPinStep === 'create'
                      ? t('pin.createTitle', { defaultValue: 'Create a PIN' })
                      : t('pin.confirmTitle', { defaultValue: 'Confirm your PIN' })}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {newPinStep === 'create'
                      ? t('pin.createDescription', { defaultValue: 'Choose a 4-6 digit PIN to protect your key on this device.' })
                      : t('pin.confirmDescription', { defaultValue: 'Enter the same PIN again to confirm.' })}
                  </p>
                  <PinInput
                    length={6}
                    value={newPinStep === 'create' ? newPin1 : newPin2}
                    onChange={newPinStep === 'create' ? setNewPin1 : setNewPin2}
                    onComplete={handleNewPinComplete}
                    error={!!pinError}
                    autoFocus
                  />
                  {pinError && <p className="text-center text-sm text-destructive">{pinError}</p>}
                </div>
              )}
            </div>
          )}

          {/* Direct nsec entry (advanced recovery) */}
          {recoveryMode !== 'backup' && recoveryStep === 'upload' && (
            <>
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-card px-2 text-muted-foreground">{t('common.or', { defaultValue: 'or' })}</span>
                </div>
              </div>

              <form onSubmit={handleNsecSubmit} className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="nsec">
                    <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
                    {t('auth.secretKey')}
                  </Label>
                  <Input
                    id="nsec"
                    type="password"
                    value={nsec}
                    onChange={(e) => setNsec(e.target.value)}
                    placeholder={t('auth.secretKeyPlaceholder')}
                    autoComplete="off"
                  />
                </div>
                <Button type="submit" disabled={isLoading} className="w-full">
                  {isLoading ? t('common.loading') : (
                    <>
                      <LogIn className="h-4 w-4" />
                      {t('auth.login')}
                    </>
                  )}
                </Button>
              </form>
            </>
          )}

          {/* Passkey login */}
          {webauthnAvailable && recoveryStep === 'upload' && (
            <>
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-card px-2 text-muted-foreground">{t('common.or', { defaultValue: 'or' })}</span>
                </div>
              </div>
              <Button
                variant="outline"
                className="w-full"
                onClick={handlePasskeyLogin}
                disabled={isLoading || passkeyLoading}
              >
                {passkeyLoading ? t('webauthn.signingIn', { defaultValue: 'Signing in...' }) : (
                  <>
                    <Fingerprint className="h-4 w-4" />
                    {t('webauthn.signInWithPasskey', { defaultValue: 'Sign in with passkey' })}
                  </>
                )}
              </Button>
            </>
          )}

          {/* Back to PIN login */}
          {storedKeyExists && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => { setShowRecovery(false); setValidationError('') }}
            >
              {t('common.back')}
            </Button>
          )}
        </CardContent>

        <CardFooter className="justify-center">
          <p className="flex items-center gap-1.5 rounded-full bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary">
            <Shield className="h-3 w-3" />
            {t('auth.securityNote')}
          </p>
        </CardFooter>
      </Card>
    </div>
  )
}

/** Inline PIN entry (not a full-screen overlay) for the login page */
function PinUnlockInline({ onUnlock, onWipe }: { onUnlock: (pin: string) => Promise<boolean>; onWipe: () => void }) {
  const { t } = useTranslation()
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)
  const [failedAttempts, setFailedAttempts] = useState(0)
  const [checking, setChecking] = useState(false)
  const maxAttempts = 10

  async function handleComplete(enteredPin: string) {
    if (checking) return
    setChecking(true)
    setError(false)
    const success = await onUnlock(enteredPin)
    if (success) return
    const newAttempts = failedAttempts + 1
    setFailedAttempts(newAttempts)
    setError(true)
    setPin('')
    setChecking(false)
    if (newAttempts >= maxAttempts) {
      onWipe()
    }
  }

  const remainingAttempts = maxAttempts - failedAttempts

  return (
    <div className="space-y-3">
      <PinInput
        length={6}
        value={pin}
        onChange={setPin}
        onComplete={handleComplete}
        disabled={checking}
        error={error}
        autoFocus
      />
      {error && (
        <p className="text-center text-sm text-destructive">{t('lock.wrongPin', { defaultValue: 'Wrong PIN' })}</p>
      )}
      {failedAttempts > 0 && remainingAttempts <= 5 && (
        <p className="text-center text-xs text-muted-foreground">
          {t('lock.attemptsRemaining', { count: remainingAttempts, defaultValue: '{{count}} attempts remaining' })}
        </p>
      )}
    </div>
  )
}
