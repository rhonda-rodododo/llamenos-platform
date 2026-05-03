import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X, ExternalLink } from 'lucide-react'
import { useConfig } from '@/lib/config'

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

  const resetText = demoResetSchedule
    ? t('demo.bannerTextSchedule', {
        schedule: demoResetSchedule,
        defaultValue: "You're exploring the Ll\u00e1menos demo. Data resets {{schedule}}.",
      })
    : t('demo.bannerText', { defaultValue: "You're exploring the Ll\u00e1menos demo. Data resets daily." })

  return (
    <div className="flex items-center justify-between gap-2 border-b border-primary/20 bg-primary/5 px-4 py-2 text-sm">
      <p className="flex items-center gap-2 text-muted-foreground">
        <span className="shrink-0 text-base">&#10024;</span>
        <span>
          {resetText}
          {' '}
          <a
            href="https://llamenos-platform.com/docs/getting-started"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline"
          >
            {t('demo.getStarted', { defaultValue: 'Deploy your own' })}
            <ExternalLink className="h-3 w-3" />
          </a>
        </span>
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
