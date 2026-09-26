import { useTranslation } from 'react-i18next'
import { Headphones, PhoneOff } from 'lucide-react'
import type { TelephonyProviderType } from '@/lib/api'
import { TELEPHONY_PROVIDER_LABELS } from '@shared/types'
import { supportsInAppAudio } from '@/lib/in-app-audio'

/**
 * Tells the operator whether the selected telephony provider can carry call
 * audio inside the app. Providers without in-app audio remain selectable —
 * PSTN parallel ringing still works — but they are never presented as if a
 * volunteer could answer in the app.
 */
export function InAppAudioNotice({ provider }: { provider: TelephonyProviderType }) {
  const { t } = useTranslation()
  const supported = supportsInAppAudio(provider)

  return (
    <div
      className="flex items-start gap-2 rounded-lg border border-border bg-muted/50 p-3"
      data-testid="in-app-audio-notice"
      data-provider={provider}
      data-in-app-audio={supported ? 'supported' : 'unsupported'}
    >
      {supported
        ? <Headphones className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
        : <PhoneOff className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
      <div className="space-y-0.5">
        <p className="text-xs font-medium">
          {supported ? t('telephonyProvider.inAppAudioSupported') : t('telephonyProvider.inAppAudioUnsupported')}
        </p>
        {!supported && (
          <p className="text-xs text-muted-foreground">
            {t('telephonyProvider.inAppAudioUnsupportedWhy', { provider: TELEPHONY_PROVIDER_LABELS[provider] })}
          </p>
        )}
      </div>
    </div>
  )
}
