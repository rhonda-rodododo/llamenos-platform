import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, X } from 'lucide-react'
import { usePwaInstall } from '@/lib/use-pwa-install'

const DISMISS_KEY = 'llamenos-pwa-install-dismissed'

export function PwaInstallBanner() {
  const { t } = useTranslation()
  const { canInstall, isInstalled, promptInstall } = usePwaInstall()
  const [dismissed, setDismissed] = useState(() =>
    localStorage.getItem(DISMISS_KEY) === 'true'
  )

  if (dismissed || !canInstall || isInstalled) return null

  return (
    <div className="flex items-center justify-between gap-2 border-b border-blue-500/20 bg-blue-500/5 px-4 py-2 text-sm">
      <p className="flex items-center gap-2 text-muted-foreground">
        <Download className="h-4 w-4 shrink-0 text-blue-500" />
        <span>{t('pwa.installText')}</span>
      </p>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => promptInstall()}
          className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        >
          {t('pwa.installButton')}
        </button>
        <button
          onClick={() => {
            localStorage.setItem(DISMISS_KEY, 'true')
            setDismissed(true)
          }}
          className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label={t('common.close')}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
