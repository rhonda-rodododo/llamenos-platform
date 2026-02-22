import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import { useToast } from '@/lib/toast'
import {
  updateSetupState,
  completeSetup,
  seedDemoData,
} from '@/lib/api'
import type { ChannelType } from '@shared/types'
import type { TelephonyProviderConfig, WhatsAppConfig, SignalConfig } from '@shared/types'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowLeft, ArrowRight, SkipForward } from 'lucide-react'
import { LogoMark } from '@/components/logo-mark'
import { AdminBootstrap } from './AdminBootstrap'
import { StepIdentity } from './StepIdentity'
import { StepChannels } from './StepChannels'
import { StepProviders } from './StepProviders'
import { StepSettings } from './StepSettings'
import { StepInvite } from './StepInvite'
import { StepSummary } from './StepSummary'

const TOTAL_STEPS = 6

export interface SetupData {
  hotlineName: string
  organization: string
  language: string
  selectedChannels: ChannelType[]
  telephonyProvider: Partial<TelephonyProviderConfig> | null
  whatsappConfig: Partial<WhatsAppConfig> | null
  signalConfig: Partial<SignalConfig> | null
  voiceSettings: { queueTimeout: number; voicemailEnabled: boolean; voicemailMaxDuration: number }
  messagingSettings: { autoResponse: string; inactivityTimeout: number; maxConcurrent: number }
  reportCategories: string[]
  providerValidated: boolean
  whatsappValidated: boolean
  signalValidated: boolean
}

const DEFAULT_SETUP_DATA: SetupData = {
  hotlineName: '',
  organization: '',
  language: 'en',
  selectedChannels: [],
  telephonyProvider: null,
  whatsappConfig: null,
  signalConfig: null,
  voiceSettings: { queueTimeout: 60, voicemailEnabled: true, voicemailMaxDuration: 120 },
  messagingSettings: { autoResponse: '', inactivityTimeout: 60, maxConcurrent: 3 },
  reportCategories: [],
  providerValidated: false,
  whatsappValidated: false,
  signalValidated: false,
}

export function SetupWizard({ needsBootstrap = false }: { needsBootstrap?: boolean }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { toast } = useToast()
  const [bootstrapComplete, setBootstrapComplete] = useState(
    !needsBootstrap || sessionStorage.getItem('bootstrapComplete') === '1'
  )
  const [step, setStep] = useState(0)
  const [data, setData] = useState<SetupData>(DEFAULT_SETUP_DATA)
  const [saving, setSaving] = useState(false)

  const updateData = useCallback((patch: Partial<SetupData>) => {
    setData(prev => ({ ...prev, ...patch }))
  }, [])

  const canProceed = useCallback(() => {
    switch (step) {
      case 0: return data.hotlineName.trim().length > 0
      case 1: return data.selectedChannels.length > 0
      default: return true
    }
  }, [step, data.hotlineName, data.selectedChannels])

  async function handleNext() {
    if (step === TOTAL_STEPS - 1) return
    setSaving(true)
    try {
      await updateSetupState({
        selectedChannels: data.selectedChannels,
        completedSteps: Array.from({ length: step + 1 }, (_, i) => String(i)),
      })
      setStep(s => s + 1)
    } catch {
      toast(t('setup.saveFailed'), 'error')
    } finally {
      setSaving(false)
    }
  }

  function handleBack() {
    if (step > 0) setStep(s => s - 1)
  }

  function handleSkip() {
    if (step < TOTAL_STEPS - 1) setStep(s => s + 1)
  }

  async function handleComplete({ demoMode }: { demoMode: boolean }) {
    setSaving(true)
    try {
      await completeSetup(demoMode)
      sessionStorage.removeItem('bootstrapComplete')
      if (demoMode) {
        try {
          await seedDemoData()
        } catch {
          toast(t('setup.demoSeedFailed', { defaultValue: 'Sample data partially created' }), 'error')
        }
      }
      toast(t('setup.complete'), 'success')
      navigate({ to: '/' })
    } catch {
      toast(t('setup.completeFailed'), 'error')
    } finally {
      setSaving(false)
    }
  }

  const stepLabels = [
    t('setup.stepIdentity'),
    t('setup.stepChannels'),
    t('setup.stepProviders'),
    t('setup.stepSettings'),
    t('setup.stepInvite'),
    t('setup.stepSummary'),
  ]

  // Show bootstrap step if no admin exists
  if (!bootstrapComplete) {
    return (
      <Card className="w-full max-w-2xl">
        <div className="px-6 pt-6">
          <div className="flex items-center gap-2 mb-4">
            <LogoMark size="sm" />
            <h1 className="text-xl font-bold">{t('setup.bootstrap.title', { defaultValue: 'Create Admin Account' })}</h1>
          </div>
        </div>
        <div className="px-6 py-6">
          <AdminBootstrap onComplete={() => setBootstrapComplete(true)} />
        </div>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-2xl">
      {/* Header */}
      <div className="px-6 pt-6">
        <div className="flex items-center gap-2 mb-4">
          <LogoMark size="sm" />
          <h1 className="text-xl font-bold">{t('setup.title')}</h1>
        </div>
        {/* Progress */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{stepLabels[step]}</span>
            <span>{t('setup.stepOf', { current: step + 1, total: TOTAL_STEPS })}</span>
          </div>
          <div className="flex gap-1">
            {Array.from({ length: TOTAL_STEPS }, (_, i) => (
              <div
                key={i}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  i <= step ? 'bg-primary' : 'bg-muted'
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Step content */}
      <div className="px-6 py-6">
        {step === 0 && <StepIdentity data={data} onChange={updateData} />}
        {step === 1 && <StepChannels data={data} onChange={updateData} />}
        {step === 2 && <StepProviders data={data} onChange={updateData} />}
        {step === 3 && <StepSettings data={data} onChange={updateData} />}
        {step === 4 && <StepInvite />}
        {step === 5 && <StepSummary data={data} onComplete={handleComplete} saving={saving} />}
      </div>

      {/* Navigation */}
      {step < TOTAL_STEPS - 1 && (
        <div className="flex items-center justify-between border-t px-6 py-4">
          <Button variant="ghost" onClick={handleBack} disabled={step === 0}>
            <ArrowLeft className="h-4 w-4" />
            {t('common.back')}
          </Button>
          <div className="flex gap-2">
            {step >= 2 && (
              <Button variant="ghost" size="sm" onClick={handleSkip}>
                <SkipForward className="h-4 w-4" />
                {t('setup.skip')}
              </Button>
            )}
            <Button onClick={handleNext} disabled={!canProceed() || saving}>
              {saving ? t('common.loading') : t('common.next')}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}
