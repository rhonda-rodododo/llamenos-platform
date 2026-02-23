import { useTranslation } from 'react-i18next'
import type { SetupData } from './SetupWizard'
import { VoiceSmsProviderForm } from './VoiceSmsProviderForm'
import { WhatsAppProviderForm } from './WhatsAppProviderForm'
import { SignalProviderForm } from './SignalProviderForm'

interface Props {
  data: SetupData
  onChange: (patch: Partial<SetupData>) => void
  headingRef?: React.RefObject<HTMLHeadingElement | null>
}

export function StepProviders({ data, onChange, headingRef }: Props) {
  const { t } = useTranslation()
  const hasVoiceOrSms = data.selectedChannels.includes('voice') || data.selectedChannels.includes('sms')
  const hasWhatsApp = data.selectedChannels.includes('whatsapp')
  const hasSignal = data.selectedChannels.includes('signal')
  const noProviders = !hasVoiceOrSms && !hasWhatsApp && !hasSignal

  if (noProviders) {
    return (
      <div className="space-y-4">
        <h2 ref={headingRef} tabIndex={-1} className="text-lg font-semibold outline-none">{t('setup.providersTitle')}</h2>
        <p className="text-sm text-muted-foreground">{t('setup.noProvidersNeeded')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 ref={headingRef} tabIndex={-1} className="text-lg font-semibold outline-none">{t('setup.providersTitle')}</h2>
        <p className="text-sm text-muted-foreground mt-1">{t('setup.providersDescription')}</p>
      </div>

      {hasVoiceOrSms && (
        <VoiceSmsProviderForm data={data} onChange={onChange} />
      )}

      {hasWhatsApp && (
        <WhatsAppProviderForm data={data} onChange={onChange} />
      )}

      {hasSignal && (
        <SignalProviderForm data={data} onChange={onChange} />
      )}
    </div>
  )
}
