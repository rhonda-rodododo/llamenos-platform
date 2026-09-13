import { useTranslation } from 'react-i18next'
import { LogoMark } from '@/components/logo-mark'
import { ServerAddressForm } from './ServerAddressForm'

/**
 * First-run gate for a packaged desktop build: a `tauri://` build has no
 * default backend to reach (see api-config.ts), so nothing else in the app
 * can safely render until the user tells us which server to talk to.
 * Rendered from `RootLayout` (`src/client/routes/__root.tsx`) in place of the
 * entire route tree whenever `needsServerAddress()` is true.
 */
export function ServerAddressScreen({ onConfigured }: { onConfigured: (base: string) => void }) {
  const { t } = useTranslation()

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background p-4 overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/3 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/5 blur-3xl" />
      </div>
      <div className="relative z-10 w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <LogoMark size="md" className="mx-auto" />
          <h1 data-testid="server-address-title" className="text-lg font-semibold">
            {t('serverAddress.firstRunTitle')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('serverAddress.firstRunDescription')}
          </p>
        </div>
        <ServerAddressForm
          testIdPrefix="server-address"
          submitLabel={t('serverAddress.connect')}
          onSaved={onConfigured}
        />
      </div>
    </div>
  )
}
