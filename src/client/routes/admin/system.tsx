import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useEffect, useState, useCallback } from 'react'
import { fetchSystemHealth, type SystemHealth, type ServiceStatus } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Server,
  Layers,
  PhoneIncoming,
  Database,
  Archive,
  Users,
  RefreshCw,
} from 'lucide-react'

export const Route = createFileRoute('/admin/system')({
  component: SystemHealthPage,
})

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours < 24) return `${hours}h ${minutes}m`
  const days = Math.floor(hours / 24)
  return `${days}d ${hours % 24}h`
}

function statusColor(status: 'ok' | 'degraded' | 'down' | string): string {
  switch (status) {
    case 'ok': return 'bg-green-500'
    case 'degraded': return 'bg-yellow-500'
    case 'down': return 'bg-red-500'
    default: return 'bg-gray-400'
  }
}

function StatusIndicator({ status }: { status: string }) {
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${statusColor(status)}`} />
}

function StatusRow({ label, value, status }: { label: string; value: string; status?: string }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        {status && <StatusIndicator status={status} />}
        <span className="text-sm font-medium">{value}</span>
      </div>
    </div>
  )
}

function StatusCard({ title, icon, testId, children }: {
  title: string
  icon: React.ReactNode
  testId: string
  children: React.ReactNode
}) {
  return (
    <Card data-testid={testId}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="divide-y divide-border">
          {children}
        </div>
      </CardContent>
    </Card>
  )
}

function SystemHealthPage() {
  const { t } = useTranslation()
  const [health, setHealth] = useState<SystemHealth | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  const refresh = useCallback(async () => {
    try {
      const data = await fetchSystemHealth()
      setHealth(data)
      setLastRefresh(new Date())
    } catch {
      // Keep stale data on failure
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, 30_000)
    return () => clearInterval(interval)
  }, [refresh])

  if (loading && !health) {
    return (
      <div className="flex h-64 items-center justify-center">
        <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('admin.system.title')}</h1>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          {lastRefresh && (
            <span data-testid="last-refresh">
              {t('admin.system.lastRefresh')}: {lastRefresh.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={refresh}
            className="rounded-md p-1.5 hover:bg-accent"
            aria-label="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Server Status */}
        <StatusCard
          title={t('admin.system.server')}
          icon={<Server className="h-4 w-4" />}
          testId="system-card-server"
        >
          <StatusRow
            label={t('admin.system.status')}
            value={health?.server.status ?? 'unknown'}
            status={health?.server.status}
          />
          <StatusRow
            label={t('admin.system.uptime')}
            value={health ? formatUptime(health.server.uptime) : '-'}
          />
          <StatusRow
            label={t('admin.system.version')}
            value={health?.server.version ?? '-'}
          />
        </StatusCard>

        {/* Services */}
        <StatusCard
          title={t('admin.system.services')}
          icon={<Layers className="h-4 w-4" />}
          testId="system-card-services"
        >
          {health?.services.map((svc: ServiceStatus) => (
            <StatusRow
              key={svc.name}
              label={svc.name}
              value={svc.status}
              status={svc.status}
            />
          ))}
          {(!health?.services || health.services.length === 0) && (
            <StatusRow label="Services" value="No data" />
          )}
        </StatusCard>

        {/* Calls */}
        <StatusCard
          title={t('admin.system.calls')}
          icon={<PhoneIncoming className="h-4 w-4" />}
          testId="system-card-calls"
        >
          <StatusRow
            label={t('admin.system.callsToday')}
            value={String(health?.calls.today ?? 0)}
          />
          <StatusRow
            label={t('admin.system.activeCalls')}
            value={String(health?.calls.active ?? 0)}
          />
          <StatusRow
            label={t('admin.system.avgResponse')}
            value={health ? `${health.calls.avgResponseSeconds}s` : '-'}
          />
          <StatusRow
            label={t('admin.system.missedCalls')}
            value={String(health?.calls.missed ?? 0)}
          />
        </StatusCard>

        {/* Storage */}
        <StatusCard
          title={t('admin.system.storage')}
          icon={<Database className="h-4 w-4" />}
          testId="system-card-storage"
        >
          <StatusRow
            label={t('admin.system.dbSize')}
            value={health?.storage.dbSize ?? '-'}
          />
          <StatusRow
            label={t('admin.system.blobStorage')}
            value={health?.storage.blobStorage ?? '-'}
          />
        </StatusCard>

        {/* Backup */}
        <StatusCard
          title={t('admin.system.backup')}
          icon={<Archive className="h-4 w-4" />}
          testId="system-card-backup"
        >
          <StatusRow
            label={t('admin.system.lastBackup')}
            value={health?.backup.lastBackup ?? t('common.none')}
          />
          <StatusRow
            label={t('admin.system.backupSize')}
            value={health?.backup.backupSize ?? '-'}
          />
          <StatusRow
            label={t('admin.system.lastVerify')}
            value={health?.backup.lastVerify ?? t('common.none')}
          />
        </StatusCard>

        {/* Volunteers */}
        <StatusCard
          title={t('admin.system.users')}
          icon={<Users className="h-4 w-4" />}
          testId="system-card-volunteers"
        >
          <StatusRow
            label={t('admin.system.totalActive')}
            value={String(health?.volunteers.totalActive ?? 0)}
          />
          <StatusRow
            label={t('admin.system.onlineNow')}
            value={String(health?.volunteers.onlineNow ?? 0)}
          />
          <StatusRow
            label={t('admin.system.onShift')}
            value={String(health?.volunteers.onShift ?? 0)}
          />
          <StatusRow
            label={t('admin.system.shiftCoverage')}
            value={`${health?.volunteers.shiftCoverage ?? 0}%`}
          />
        </StatusCard>
      </div>
    </div>
  )
}
