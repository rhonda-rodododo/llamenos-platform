import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useConfig } from '@/lib/config'
import { LogoMark } from '@/components/logo-mark'
import { SetupWizard } from '@/components/setup/SetupWizard'

export const Route = createFileRoute('/setup')({
  component: SetupPage,
})

function SetupPage() {
  const { t } = useTranslation()
  const { needsBootstrap, isLoading: configLoading } = useConfig()

  // Wait for config to load so we know whether to show bootstrap step
  if (configLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <LogoMark size="sm" className="animate-pulse" />
          {t('common.loading')}
        </div>
      </div>
    )
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background p-4 overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/3 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/5 blur-3xl" />
      </div>
      <div className="relative z-10 w-full flex justify-center">
        <SetupWizard needsBootstrap={needsBootstrap} />
      </div>
    </div>
  )
}
