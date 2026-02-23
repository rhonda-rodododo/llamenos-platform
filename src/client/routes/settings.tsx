import { createFileRoute, useSearch } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/lib/auth'
import { useEffect, useState, useCallback, useRef } from 'react'
import {
  updateMyTranscriptionPreference,
  updateMyProfile,
  getTranscriptionSettings,
  getWebRtcStatus,
} from '@/lib/api'
import * as keyManager from '@/lib/key-manager'
import { nip19 } from 'nostr-tools'
import { useToast } from '@/lib/toast'
import { Settings2, Mic, Bell, User, Globe, Fingerprint, KeyRound, Trash2, Plus, Phone, Monitor, PhoneCall, Smartphone, Loader2, CheckCircle2 } from 'lucide-react'
import { isWebAuthnAvailable, registerCredential, listCredentials, deleteCredential, type WebAuthnCredentialInfo } from '@/lib/webauthn'
import { PhoneInput } from '@/components/phone-input'
import {
  getProvisioningRoom,
  encryptNsecForDevice,
  sendProvisionedKey,
} from '@/lib/provisioning'
import { getNotificationPrefs, setNotificationPrefs } from '@/lib/notifications'
import { useNotificationPermission } from '@/lib/use-notification-permission'
import { LANGUAGES } from '@shared/languages'
import { SettingsSection } from '@/components/settings-section'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export const Route = createFileRoute('/settings')({
  component: SettingsPage,
  validateSearch: (search: Record<string, unknown>) => ({
    section: (search.section as string) || '',
  }),
})

function SettingsPage() {
  const { t } = useTranslation()
  const { section } = useSearch({ from: '/settings' })
  const { transcriptionEnabled, name: authName, spokenLanguages, callPreference, refreshProfile, publicKey } = useAuth()
  const { toast } = useToast()
  const [myTranscription, setMyTranscription] = useState(transcriptionEnabled)
  const [notifPrefs, setNotifPrefs] = useState(getNotificationPrefs)
  const [loading, setLoading] = useState(true)
  const [canOptOut, setCanOptOut] = useState(true)
  const [webauthnCreds, setWebauthnCreds] = useState<WebAuthnCredentialInfo[]>([])
  const [webauthnLabel, setWebauthnLabel] = useState('')
  const [webauthnRegistering, setWebauthnRegistering] = useState(false)
  const webauthnAvailable = isWebAuthnAvailable()
  const [currentCallPref, setCurrentCallPref] = useState<'phone' | 'browser' | 'both'>(callPreference)
  const [webrtcAvailable, setWebrtcAvailable] = useState(false)

  // Collapsible state — profile expanded by default, plus any deep-linked section
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const initial = new Set(['profile', 'key-backup'])
    if (section) initial.add(section)
    return initial
  })
  const scrolledRef = useRef(false)

  const toggleSection = useCallback((id: string, open: boolean) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (open) {
        next.add(id)
      } else {
        next.delete(id)
      }
      return next
    })
  }, [])

  // Profile state
  const [profileName, setProfileName] = useState(authName || '')
  const [profilePhone, setProfilePhone] = useState('')
  const [profileError, setProfileError] = useState('')
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>(spokenLanguages || ['en'])

  // Get npub for display
  const pk = keyManager.getPublicKeyHex() || publicKey
  const npub = pk ? nip19.npubEncode(pk) : ''

  useEffect(() => {
    const promises: Promise<void>[] = [
      getTranscriptionSettings().then(r => {
        setCanOptOut(r.allowVolunteerOptOut)
      }).catch(() => {}),
      getWebRtcStatus().then(r => {
        setWebrtcAvailable(r.available)
      }).catch(() => {}),
    ]
    // Load WebAuthn credentials for all users
    if (webauthnAvailable) {
      promises.push(listCredentials().then(setWebauthnCreds).catch(() => {}))
    }
    Promise.all(promises)
      .catch(() => toast(t('common.error'), 'error'))
      .finally(() => setLoading(false))
  }, [])

  // Scroll to deep-linked section after loading
  useEffect(() => {
    if (!loading && section && !scrolledRef.current) {
      scrolledRef.current = true
      requestAnimationFrame(() => {
        document.getElementById(section)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    }
  }, [loading, section])

  useEffect(() => {
    setProfileName(authName || '')
  }, [authName])

  useEffect(() => {
    setSelectedLanguages(spokenLanguages || ['en'])
  }, [spokenLanguages])

  useEffect(() => {
    setCurrentCallPref(callPreference)
  }, [callPreference])

  async function handleUpdateProfile() {
    setProfileError('')
    if (profilePhone && !/^\+\d{7,15}$/.test(profilePhone)) {
      setProfileError(t('profileSettings.invalidPhone'))
      return
    }
    try {
      await updateMyProfile({
        spokenLanguages: selectedLanguages,
        ...(profileName && { name: profileName }),
        ...(profilePhone && { phone: profilePhone }),
      })
      await refreshProfile()
      toast(t('profileSettings.profileUpdated'), 'success')
    } catch {
      toast(t('common.error'), 'error')
    }
  }

  if (loading) {
    return <div className="text-muted-foreground">{t('common.loading')}</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Settings2 className="h-6 w-6 text-primary" />
        <h1 className="text-xl font-bold sm:text-2xl">{t('settings.title')}</h1>
      </div>

      {/* Profile */}
      <SettingsSection
        id="profile"
        title={t('profileSettings.profile')}
        description={t('profileSettings.profileDescription')}
        icon={<User className="h-5 w-5 text-muted-foreground" />}
        expanded={expanded.has('profile')}
        onToggle={(open) => toggleSection('profile', open)}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="profile-name">{t('profileSettings.displayName')}</Label>
            <Input
              id="profile-name"
              value={profileName}
              onChange={e => setProfileName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="profile-phone">{t('profileSettings.phoneNumber')}</Label>
            <PhoneInput
              id="profile-phone"
              value={profilePhone}
              onChange={setProfilePhone}
            />
          </div>
        </div>

        {npub && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{t('profileSettings.yourPublicKey')}</p>
            <code className="block break-all rounded-md bg-muted px-3 py-2 text-xs">{npub}</code>
          </div>
        )}

        {profileError && (
          <p className="text-sm text-destructive">{profileError}</p>
        )}

        {/* Spoken languages */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-muted-foreground" />
            <Label>{t('profile.spokenLanguages')}</Label>
          </div>
          <p className="text-xs text-muted-foreground">{t('profile.spokenLanguagesHelp')}</p>
          <div className="flex flex-wrap gap-2">
            {LANGUAGES.map(lang => {
              const selected = selectedLanguages.includes(lang.code)
              return (
                <button
                  key={lang.code}
                  onClick={() => {
                    setSelectedLanguages(prev =>
                      selected
                        ? prev.filter(c => c !== lang.code)
                        : [...prev, lang.code]
                    )
                  }}
                  className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                    selected
                      ? 'border-primary bg-primary/10 text-primary font-medium'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <span>{lang.flag}</span>
                  {lang.label}
                </button>
              )
            })}
          </div>
        </div>

        <Button onClick={handleUpdateProfile}>
          {t('profileSettings.updateProfile')}
        </Button>
      </SettingsSection>

      {/* Key Backup */}
      <SettingsSection
        id="key-backup"
        title={t('profileSettings.keyBackup')}
        description={t('profileSettings.keyBackupDescription')}
        icon={<KeyRound className="h-5 w-5 text-muted-foreground" />}
        expanded={expanded.has('key-backup')}
        onToggle={(open) => toggleSection('key-backup', open)}
      >
        <p className="text-sm text-muted-foreground">
          {t('profileSettings.keyBackupNote', { defaultValue: 'Download a backup from the onboarding flow or use your recovery key to restore access on a new device.' })}
        </p>
        <p className="text-xs text-muted-foreground">
          {npub ? `${t('profileSettings.publicKey', { defaultValue: 'Public key' })}: ${npub.slice(0, 16)}...` : ''}
        </p>
      </SettingsSection>

      {/* Link Device */}
      <SettingsSection
        id="linked-devices"
        title={t('deviceLink.linkedDevices')}
        description={t('deviceLink.linkedDevicesDesc')}
        icon={<Smartphone className="h-5 w-5 text-muted-foreground" />}
        expanded={expanded.has('linked-devices')}
        onToggle={(open) => toggleSection('linked-devices', open)}
      >
        <LinkDeviceSection />
      </SettingsSection>

      {/* Passkeys (WebAuthn) — all users */}
      {webauthnAvailable && (
        <SettingsSection
          id="passkeys"
          title={t('webauthn.title')}
          description={t('webauthn.description')}
          icon={<Fingerprint className="h-5 w-5 text-muted-foreground" />}
          expanded={expanded.has('passkeys')}
          onToggle={(open) => toggleSection('passkeys', open)}
        >
          {webauthnCreds.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('webauthn.noKeys')}</p>
          ) : (
            <div className="space-y-2">
              {webauthnCreds.map(cred => (
                <div key={cred.id} className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">{cred.label}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline" className="text-[10px]">
                        {cred.backedUp
                          ? t('webauthn.syncedPasskey')
                          : t('webauthn.singleDevice')
                        }
                      </Badge>
                      <span>{t('webauthn.lastUsed')}: {new Date(cred.lastUsedAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      try {
                        await deleteCredential(cred.id)
                        setWebauthnCreds(prev => prev.filter(c => c.id !== cred.id))
                        toast(t('common.success'), 'success')
                      } catch {
                        toast(t('common.error'), 'error')
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <Input
              value={webauthnLabel}
              onChange={e => setWebauthnLabel(e.target.value)}
              placeholder={t('webauthn.label')}
              className="flex-1"
            />
            <Button
              onClick={async () => {
                if (!webauthnLabel.trim()) return
                setWebauthnRegistering(true)
                try {
                  await registerCredential(webauthnLabel.trim())
                  const updated = await listCredentials()
                  setWebauthnCreds(updated)
                  setWebauthnLabel('')
                  toast(t('webauthn.registerSuccess'), 'success')
                } catch {
                  toast(t('common.error'), 'error')
                } finally {
                  setWebauthnRegistering(false)
                }
              }}
              disabled={webauthnRegistering || !webauthnLabel.trim()}
            >
              <Plus className="h-4 w-4" />
              {t('webauthn.registerKey')}
            </Button>
          </div>
        </SettingsSection>
      )}

      {/* Transcription (personal toggle only) */}
      <SettingsSection
        id="transcription"
        title={t('settings.transcriptionSettings')}
        description={t('settings.transcriptionDescription')}
        icon={<Mic className="h-5 w-5 text-muted-foreground" />}
        expanded={expanded.has('transcription')}
        onToggle={(open) => toggleSection('transcription', open)}
      >
        {canOptOut ? (
          <div className="flex items-center justify-between rounded-lg border border-border p-4">
            <div className="space-y-0.5">
              <Label>{t('transcription.enableForCalls')}</Label>
            </div>
            <Switch
              checked={myTranscription}
              onCheckedChange={async (checked) => {
                try {
                  await updateMyTranscriptionPreference(checked)
                  setMyTranscription(checked)
                } catch {
                  toast(t('common.error'), 'error')
                }
              }}
            />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t('transcription.managedByAdmin')}</p>
        )}
      </SettingsSection>

      {/* Call Preference (WebRTC) */}
      <SettingsSection
        id="call-preference"
        title={t('settings.callPreference')}
        description={t('settings.callPreferenceDescription')}
        icon={<PhoneCall className="h-5 w-5 text-muted-foreground" />}
        expanded={expanded.has('call-preference')}
        onToggle={(open) => toggleSection('call-preference', open)}
      >
        {!webrtcAvailable && (
          <p className="text-sm text-muted-foreground">
            {t('settings.webrtcNotConfigured')}
          </p>
        )}
        <div className="space-y-2">
          {([
            { value: 'phone' as const, icon: Phone, label: t('settings.callPrefPhone'), desc: t('settings.callPrefPhoneDesc') },
            { value: 'browser' as const, icon: Monitor, label: t('settings.callPrefBrowser'), desc: t('settings.callPrefBrowserDesc') },
            { value: 'both' as const, icon: PhoneCall, label: t('settings.callPrefBoth'), desc: t('settings.callPrefBothDesc') },
          ]).map(option => (
            <button
              key={option.value}
              disabled={option.value !== 'phone' && !webrtcAvailable}
              onClick={async () => {
                try {
                  setCurrentCallPref(option.value)
                  await updateMyProfile({ callPreference: option.value })
                  await refreshProfile()
                  toast(t('common.success'), 'success')
                } catch {
                  setCurrentCallPref(callPreference) // revert
                  toast(t('common.error'), 'error')
                }
              }}
              className={`flex w-full items-center gap-3 rounded-lg border p-4 text-left transition-colors ${
                currentCallPref === option.value
                  ? 'border-primary bg-primary/5'
                  : option.value !== 'phone' && !webrtcAvailable
                    ? 'cursor-not-allowed border-border opacity-50'
                    : 'border-border hover:border-primary/50'
              }`}
            >
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                currentCallPref === option.value ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
              }`}>
                <option.icon className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <p className={`text-sm font-medium ${currentCallPref === option.value ? 'text-primary' : ''}`}>
                  {option.label}
                </p>
                <p className="text-xs text-muted-foreground">{option.desc}</p>
              </div>
              {currentCallPref === option.value && (
                <div className="h-2.5 w-2.5 rounded-full bg-primary" />
              )}
            </button>
          ))}
        </div>
      </SettingsSection>

      {/* Call Notifications */}
      <SettingsSection
        id="notifications"
        title={t('settings.notifications')}
        description={t('settings.notificationsDescription')}
        icon={<Bell className="h-5 w-5 text-muted-foreground" />}
        expanded={expanded.has('notifications')}
        onToggle={(open) => toggleSection('notifications', open)}
      >
        <div className="flex items-center justify-between rounded-lg border border-border p-4">
          <div className="space-y-0.5">
            <Label>{t('settings.playRingtone')}</Label>
            <p className="text-xs text-muted-foreground">{t('settings.playRingtoneDescription')}</p>
          </div>
          <Switch
            checked={notifPrefs.ringtoneEnabled}
            onCheckedChange={(checked) => {
              const updated = setNotificationPrefs({ ringtoneEnabled: checked })
              setNotifPrefs(updated)
            }}
          />
        </div>
        <div className="flex items-center justify-between rounded-lg border border-border p-4">
          <div className="space-y-0.5">
            <Label>{t('settings.browserNotifications')}</Label>
            <p className="text-xs text-muted-foreground">{t('settings.browserNotificationsDescription')}</p>
          </div>
          <Switch
            checked={notifPrefs.browserNotificationsEnabled}
            onCheckedChange={(checked) => {
              const updated = setNotificationPrefs({ browserNotificationsEnabled: checked })
              setNotifPrefs(updated)
            }}
          />
        </div>
        <NotificationPermissionStatus />
      </SettingsSection>
    </div>
  )
}

function NotificationPermissionStatus() {
  const { t } = useTranslation()
  const { permission, requestPermission } = useNotificationPermission()

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label>{t('notifications.permissionStatus')}</Label>
          {permission === 'granted' && (
            <p className="text-xs text-muted-foreground">{t('notifications.statusGranted')}</p>
          )}
          {permission === 'default' && (
            <p className="text-xs text-muted-foreground">{t('notifications.statusDefault')}</p>
          )}
          {permission === 'denied' && (
            <p className="text-xs text-muted-foreground">{t('notifications.statusDenied')}</p>
          )}
          {permission === 'unsupported' && (
            <p className="text-xs text-muted-foreground">{t('notifications.statusUnsupported')}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {permission === 'granted' && (
            <Badge className="bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20">
              {t('notifications.granted')}
            </Badge>
          )}
          {permission === 'default' && (
            <>
              <Badge variant="outline" className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20">
                {t('notifications.default')}
              </Badge>
              <Button size="sm" variant="outline" onClick={() => requestPermission()}>
                {t('notifications.enablePermission')}
              </Button>
            </>
          )}
          {permission === 'denied' && (
            <Badge variant="outline" className="bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20">
              {t('notifications.denied')}
            </Badge>
          )}
          {permission === 'unsupported' && (
            <Badge variant="outline" className="text-muted-foreground">
              {t('notifications.unsupported')}
            </Badge>
          )}
        </div>
      </div>
    </div>
  )
}

function LinkDeviceSection() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [linkCode, setLinkCode] = useState('')
  const [status, setStatus] = useState<'idle' | 'linking' | 'success' | 'error'>('idle')
  const [statusMessage, setStatusMessage] = useState('')

  async function handleLinkDevice() {
    if (!linkCode.trim()) return
    setStatus('linking')
    try {
      // Parse the code — could be JSON from QR or short code (roomId prefix)
      let roomId: string
      let token: string
      try {
        const parsed = JSON.parse(linkCode)
        roomId = parsed.r
        token = parsed.t
      } catch {
        // Treat as short code — but we need the full roomId
        // Short codes aren't enough; user must paste the full QR data or use camera
        setStatus('error')
        setStatusMessage(t('deviceLink.invalidCode'))
        return
      }

      // Fetch room to get ephemeral pubkey
      const room = await getProvisioningRoom(roomId, token)
      if (room.status !== 'waiting') {
        setStatus('error')
        setStatusMessage(t('deviceLink.linkExpired'))
        return
      }

      // Get nsec from key-manager
      const nsecStr = keyManager.getNsec()
      if (!nsecStr) {
        setStatus('error')
        setStatusMessage(t('pin.keyLocked'))
        return
      }

      const secretKey = keyManager.getSecretKey()
      const publicKey = keyManager.getPublicKeyHex()!

      // ECDH encrypt nsec for the new device
      const encrypted = encryptNsecForDevice(nsecStr, room.ephemeralPubkey, secretKey)

      // Send encrypted payload (authenticated)
      const authToken = keyManager.createAuthToken(Date.now())
      await sendProvisionedKey(roomId, token, encrypted, publicKey, {
        'Authorization': `Bearer ${authToken}`,
      })

      setStatus('success')
      setStatusMessage(t('deviceLink.linkSuccess'))
    } catch {
      setStatus('error')
      setStatusMessage(t('deviceLink.linkFailed'))
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t('deviceLink.linkFromPrimary')}</p>

      {status === 'idle' || status === 'error' ? (
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="link-code">{t('deviceLink.enterCode')}</Label>
            <div className="flex gap-2">
              <Input
                id="link-code"
                value={linkCode}
                onChange={e => setLinkCode(e.target.value)}
                placeholder={t('deviceLink.codePlaceholder')}
                className="font-mono"
                data-testid="link-code-input"
              />
              <Button onClick={handleLinkDevice} disabled={!linkCode.trim()} data-testid="link-device-button">
                <Smartphone className="h-4 w-4" />
                {t('deviceLink.link')}
              </Button>
            </div>
          </div>
          {status === 'error' && (
            <p className="text-sm text-destructive">{statusMessage}</p>
          )}
        </div>
      ) : status === 'linking' ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('common.loading')}
        </div>
      ) : (
        <div className="flex items-center gap-2 text-sm text-green-600">
          <CheckCircle2 className="h-4 w-4" />
          {statusMessage}
        </div>
      )}
    </div>
  )
}
