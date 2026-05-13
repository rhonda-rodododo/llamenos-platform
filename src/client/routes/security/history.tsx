import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Smartphone, Key, LogOut, ShieldAlert, Shield, Link2, AlertTriangle, Download,
} from 'lucide-react'
import { useSecurityEvents } from '@/lib/queries/devices'

const EVENT_ICONS: Record<string, typeof Smartphone> = {
  device_register: Smartphone,
  device_remove: Smartphone,
  device_rename: Smartphone,
  session_create: Key,
  session_terminate: LogOut,
  session_terminate_all: LogOut,
  account_lockdown: ShieldAlert,
  account_lockdown_complete: Shield,
  webauthn_register: Key,
  webauthn_authenticate: Key,
  webauthn_remove: Key,
  sigchain_append: Link2,
  puk_rotate: Shield,
  hub_key_rotate: Shield,
  device_fingerprint_verified: Shield,
  passkey_rename: Key,
  login_failed: AlertTriangle,
}

export const Route = createFileRoute('/security/history')({
  component: HistoryPage,
})

function HistoryPage() {
  const { t } = useTranslation()
  const [limit] = useState(50)
  const [offset, setOffset] = useState(0)
  const { data, isLoading } = useSecurityEvents(limit, offset)

  function exportJson() {
    if (!data?.events) return
    const blob = new Blob([JSON.stringify(data.events, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `security-events-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (isLoading) return <div className="animate-pulse">{t('common.loading')}</div>

  return (
    <div className="space-y-4" data-testid="security-history">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t('security.history.title')}</h2>
        <Button variant="outline" size="sm" onClick={exportJson}>
          <Download className="h-4 w-4 mr-1" />
          {t('security.history.export')}
        </Button>
      </div>

      <div className="space-y-2">
        {data?.events.map((event) => {
          const Icon = EVENT_ICONS[event.eventType] ?? AlertTriangle

          return (
            <div key={event.id} className="flex items-start gap-3 p-3 rounded-md border">
              <Icon className="h-4 w-4 mt-0.5 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {t(`security.history.events.${event.eventType.replace(/_([a-z])/g, (_: string, c: string) => c.toUpperCase())}`, { defaultValue: event.eventType })}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(event.createdAt).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {data && data.total > offset + limit && (
        <Button variant="outline" onClick={() => setOffset(o => o + limit)}>
          {t('common.loadMore')}
        </Button>
      )}
    </div>
  )
}

export default HistoryPage
