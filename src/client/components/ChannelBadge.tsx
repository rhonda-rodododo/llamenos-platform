import {
  Phone,
  MessageSquare,
  Globe,
  Shield,
  FileText,
  MessageCircle,
  type LucideIcon,
} from 'lucide-react'
import { CHANNEL_LABELS, CHANNEL_SECURITY, type TransportSecurity } from '@shared/types'
import { cn } from '@/lib/utils'

interface ChannelBadgeProps {
  channelType: string
  showSecurity?: boolean
}

const CHANNEL_ICONS: Record<string, LucideIcon> = {
  voice: Phone,
  sms: MessageSquare,
  whatsapp: Globe,
  signal: Shield,
  reports: FileText,
  web: MessageCircle,
}

const SECURITY_COLORS: Record<TransportSecurity, string> = {
  'e2ee': 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  'e2ee-to-bridge': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  'provider-encrypted': 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
  'none': 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
}

const SECURITY_LABELS: Record<TransportSecurity, string> = {
  'e2ee': 'End-to-end encrypted',
  'e2ee-to-bridge': 'E2EE to bridge',
  'provider-encrypted': 'Provider encrypted',
  'none': 'No encryption',
}

export function ChannelBadge({ channelType, showSecurity = false }: ChannelBadgeProps) {
  const label = CHANNEL_LABELS[channelType as keyof typeof CHANNEL_LABELS] ?? channelType
  const security = CHANNEL_SECURITY[channelType as keyof typeof CHANNEL_SECURITY] ?? 'none'
  const Icon = CHANNEL_ICONS[channelType] ?? MessageCircle
  const colorClasses = SECURITY_COLORS[security]

  return (
    <div className="inline-flex flex-col items-center gap-0.5">
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
          colorClasses,
        )}
      >
        <Icon className="h-3 w-3" />
        {label}
      </span>
      {showSecurity && (
        <span className="text-[10px] leading-tight text-muted-foreground">
          {SECURITY_LABELS[security]}
        </span>
      )}
    </div>
  )
}
