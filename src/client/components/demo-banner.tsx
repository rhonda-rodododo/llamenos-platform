import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { useConfig } from '@/lib/config'

// Test-environment safety banner (issue #733). Shown whenever the server
// reports demoMode: true -- which now covers both the public demo and the
// Internal Availability staging backend (issue #718 decided demo IS
// staging, i.e. one instance/audience). The copy is deliberately a safety
// warning, not a marketing message: no "deploy your own" call-to-action,
// and no promise about reset cadence unless the operator actually
// configured DEMO_RESET_CRON (demoResetSchedule).
export function DemoBanner() {
  const { t } = useTranslation()
  const { demoResetSchedule } = useConfig()
  const [dismissed, setDismissed] = useState(() =>
    sessionStorage.getItem('demo-banner-dismissed') === 'true'
  )

  if (dismissed) return null

  function handleDismiss() {
    sessionStorage.setItem('demo-banner-dismissed', 'true')
    setDismissed(true)
  }

  const bannerText = demoResetSchedule
    ? t('demo.bannerTextSchedule', {
        schedule: demoResetSchedule,
        defaultValue: 'Test environment \u2014 do not enter real caller information. Data resets {{schedule}} and is not confidential.',
      })
    : t('demo.bannerText', { defaultValue: 'Test environment \u2014 do not enter real caller information. Data here is not confidential and may be deleted at any time.' })

  return (
    <div className="flex items-center justify-between gap-2 border-b border-primary/20 bg-primary/5 px-4 py-2 text-sm">
      <p className="flex items-center gap-2 text-muted-foreground">
        <span className="shrink-0 text-base" aria-hidden="true">&#9888;</span>
        <span>{bannerText}</span>
      </p>
      <button
        onClick={handleDismiss}
        className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        aria-label={t('common.dismiss', { defaultValue: 'Dismiss' })}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
