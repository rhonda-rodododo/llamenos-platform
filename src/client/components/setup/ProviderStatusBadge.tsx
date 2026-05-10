import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import type { ProviderStatus } from '@protocol/schemas/provider-setup'

interface ProviderStatusBadgeProps {
  status: ProviderStatus | string
  className?: string
}

export function ProviderStatusBadge({ status, className }: ProviderStatusBadgeProps) {
  const { t } = useTranslation()

  const config: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string; colorClass: string }> = {
    connected: {
      variant: 'outline',
      label: t('telephonyProvider.connected', { defaultValue: 'Connected' }),
      colorClass: 'bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20',
    },
    connecting: {
      variant: 'outline',
      label: t('telephonyProvider.connecting', { defaultValue: 'Connecting' }),
      colorClass: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20',
    },
    error: {
      variant: 'outline',
      label: t('telephonyProvider.error', { defaultValue: 'Error' }),
      colorClass: 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20',
    },
    disconnected: {
      variant: 'outline',
      label: t('telephonyProvider.disconnected', { defaultValue: 'Disconnected' }),
      colorClass: 'bg-muted text-muted-foreground border-border',
    },
  }

  const c = config[status] || config.disconnected

  return (
    <Badge variant={c.variant} className={`${c.colorClass} ${className || ''}`}>
      {c.label}
    </Badge>
  )
}
