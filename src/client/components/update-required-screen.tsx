import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle } from 'lucide-react'
import { UPDATE_REQUIRED_EVENT, type UpdateRequiredDetail } from '@/lib/version'
import { LogoMark } from '@/components/logo-mark'

/**
 * Full-screen blocking overlay shown when the server requires a newer client version.
 * Listens for the `llamenos:update-required` CustomEvent dispatched by the API layer.
 * The overlay cannot be dismissed — the user must update.
 */
export function UpdateRequiredScreen() {
  const [updateRequired, setUpdateRequired] = useState(false)
  const { t } = useTranslation()

  useEffect(() => {
    function handleUpdateRequired(e: Event) {
      const _detail = (e as CustomEvent<UpdateRequiredDetail>).detail
      setUpdateRequired(true)
    }
    window.addEventListener(UPDATE_REQUIRED_EVENT, handleUpdateRequired)
    return () => window.removeEventListener(UPDATE_REQUIRED_EVENT, handleUpdateRequired)
  }, [])

  if (!updateRequired) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-background/95 backdrop-blur-sm"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="update-required-title"
      aria-describedby="update-required-message"
      data-testid="update-required-screen"
    >
      <div className="mx-4 w-full max-w-md text-center">
        <LogoMark size="lg" className="mx-auto mb-6" />
        <div className="flex items-center justify-center gap-2 mb-4">
          <AlertTriangle className="h-6 w-6 text-amber-500" />
          <h1
            id="update-required-title"
            className="text-xl font-semibold text-foreground"
          >
            {t('updateRequired.title')}
          </h1>
        </div>
        <p
          id="update-required-message"
          className="text-muted-foreground mb-8"
        >
          {t('updateRequired.message')}
        </p>
        <button
          onClick={() => window.location.reload()}
          className="rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          data-testid="update-required-reload"
        >
          {t('updateRequired.button')}
        </button>
      </div>
    </div>
  )
}
