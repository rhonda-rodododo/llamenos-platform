import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useEffect, useState } from 'react'
import { Settings2, Loader2 } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { useConfig } from '@/lib/config'
import { useToast } from '@/lib/toast'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  getOnboardingStatus,
  getProviderStatus,
  getHubUsage,
  startOnboarding,
} from '@/lib/api/hub-onboard'
import { HubOnboardingWizard } from '@/components/hub-settings/HubOnboardingWizard'
import { HubProviderSettings } from '@/components/hub-settings/HubProviderSettings'
import { HubUsageCard } from '@/components/hub-settings/HubUsageCard'
import type { HubSetupStatus, HubUsage, HubOnboardingState } from '@protocol/schemas/provider-setup'
import { DEFAULT_CHANNEL_CONFIG } from '@/components/hub-settings/HubOnboardingWizard'

export const Route = createFileRoute('/admin/hub-communications')({
  component: HubCommunicationsSettingsPage,
})

function HubCommunicationsSettingsPage() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const { hasPermission } = useAuth()
  const { currentHubId } = useConfig()

  const [loading, setLoading] = useState(true)
  const [onboarding, setOnboarding] = useState<HubOnboardingState | null>(null)
  const [providerStatus, setProviderStatus] = useState<HubSetupStatus | null>(null)
  const [usage, setUsage] = useState<HubUsage | null>(null)
  const [showWizard, setShowWizard] = useState(false)

  const canConfigure = hasPermission('hubs:configure')
  const canView = hasPermission('telephony:view-providers')

  async function loadData() {
    if (!currentHubId) {
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const [onboardRes, statusRes, usageRes] = await Promise.all([
        getOnboardingStatus(currentHubId),
        getProviderStatus(currentHubId),
        getHubUsage(currentHubId),
      ])

      setOnboarding(onboardRes.onboarding)
      setProviderStatus(statusRes.status)
      setUsage(usageRes.usage)

      if (!statusRes.status.onboardingComplete && !onboardRes.onboarding) {
        setShowWizard(true)
      }
    } catch {
      toast(t('hubOnboarding.errorLoading'), 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [currentHubId])

  async function handleStartSetup() {
    if (!currentHubId) return
    try {
      await startOnboarding(currentHubId)
      setShowWizard(true)
    } catch {
      toast(t('hubOnboarding.errorSaving'), 'error')
    }
  }

  function handleWizardComplete() {
    setShowWizard(false)
    loadData()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 text-muted-foreground p-8">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t('hubOnboarding.loading')}
      </div>
    )
  }

  if (!canView) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        {t('common.unauthorized')}
      </div>
    )
  }

  if (!currentHubId) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        {t('common.noData')}
      </div>
    )
  }

  const hubName = providerStatus?.hubId || currentHubId

  if (showWizard || (providerStatus && !providerStatus.onboardingComplete)) {
    return (
      <div className="flex justify-center p-4">
        <HubOnboardingWizard
          hubId={currentHubId}
          hubName={hubName}
          onComplete={handleWizardComplete}
        />
      </div>
    )
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center gap-2">
        <Settings2 className="h-6 w-6 text-primary" />
        <h1 data-testid="page-title" className="text-xl font-bold sm:text-2xl">
          {t('hubOnboarding.settingsTitle')}
        </h1>
      </div>

      <p className="text-sm text-muted-foreground">
        {t('hubOnboarding.settingsDescription')}
      </p>

      {providerStatus && (
        <HubProviderSettings
          status={providerStatus}
          channelConfig={onboarding?.channelConfig || DEFAULT_CHANNEL_CONFIG}
        />
      )}

      {usage && (
        <HubUsageCard
          usage={usage}
          quota={providerStatus?.quotas ?? {
            maxPhoneNumbers: 5,
            maxSmsPerMonth: 1000,
            maxCallsPerMonth: 500,
            maxSignalMessagesPerMonth: 500,
            maxWhatsAppMessagesPerMonth: 500,
            maxSubAccounts: 0,
          }}
        />
      )}

      {canConfigure && providerStatus?.onboardingComplete && (
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold">{t('hubOnboarding.title')}</h3>
              <p className="text-xs text-muted-foreground">
                {t('hubOnboarding.noProviderDescription')}
              </p>
            </div>
            <Button onClick={handleStartSetup} data-testid="restart-setup-btn">
              {t('hubOnboarding.resumeSetup')}
            </Button>
          </div>
        </Card>
      )}
    </div>
  )
}
