import { useTranslation } from 'react-i18next'
import { ShieldOff } from 'lucide-react'

interface Props {
  reason: 'user-erasure' | 'device-revocation' | 'admin-erasure'
}

export function DeviceWipeScreen({ reason }: Props) {
  const { t } = useTranslation()

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-background"
      data-testid="device-wipe-screen"
    >
      <div className="max-w-md text-center space-y-6 px-6">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-destructive/10">
          <ShieldOff className="h-10 w-10 text-destructive" />
        </div>
        <h1 className="text-2xl font-bold" data-testid="device-wipe-title">
          {t('deviceWipe.title')}
        </h1>
        <p className="text-muted-foreground" data-testid="device-wipe-reason">
          {t(`deviceWipe.reason.${reason}`)}
        </p>
        <p className="text-sm text-muted-foreground">
          {t('deviceWipe.explanation')}
        </p>
      </div>
    </div>
  )
}
