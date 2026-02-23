import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Bell, X } from 'lucide-react'
import { useNotificationPermission } from '@/lib/use-notification-permission'

const DISMISS_KEY = 'llamenos-notification-prompt-dismissed'

export function NotificationPromptBanner() {
  const { t } = useTranslation()
  const { permission, requestPermission } = useNotificationPermission()
  const [dismissed, setDismissed] = useState(() =>
    localStorage.getItem(DISMISS_KEY) === 'true'
  )

  if (dismissed || permission !== 'default') return null

  return (
    <div className="flex items-center justify-between gap-2 border-b border-amber-500/20 bg-amber-500/5 px-4 py-2 text-sm">
      <p className="flex items-center gap-2 text-muted-foreground">
        <Bell className="h-4 w-4 shrink-0 text-amber-500" />
        <span>{t('notifications.promptText')}</span>
      </p>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => requestPermission()}
          className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        >
          {t('notifications.promptEnable')}
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
