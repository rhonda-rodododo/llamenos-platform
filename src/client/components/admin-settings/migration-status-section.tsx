import { useTranslation } from 'react-i18next'
import { useEffect, useState } from 'react'
import { SettingsSection } from '@/components/settings-section'
import { Badge } from '@/components/ui/badge'
import { Database } from 'lucide-react'
import { getMigrationStatus } from '@/lib/api'

interface MigrationHistoryEntry {
  version: number
  name: string
  status: 'applied' | 'pending'
  appliedAt?: string
}

interface NamespaceStatus {
  namespace: string
  currentVersion: number
  latestVersion: number
  pending: number
  history: MigrationHistoryEntry[]
  lastRun: string | null
  error?: string
}

interface Props {
  expanded: boolean
  onToggle: (open: boolean) => void
  statusSummary?: string
}

export function MigrationStatusSection({ expanded, onToggle, statusSummary }: Props) {
  const { t } = useTranslation()
  const [namespaces, setNamespaces] = useState<NamespaceStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!expanded) return
    setLoading(true)
    getMigrationStatus()
      .then((data) => {
        setNamespaces(data.namespaces)
        setError(null)
      })
      .catch(() => setError(t('common.error')))
      .finally(() => setLoading(false))
  }, [expanded, t])

  const totalPending = namespaces.reduce((sum, ns) => sum + (ns.pending || 0), 0)

  return (
    <SettingsSection
      id="migrations"
      title={t('migrations.title')}
      description={t('migrations.description')}
      icon={<Database className="h-5 w-5 text-muted-foreground" />}
      expanded={expanded}
      onToggle={onToggle}
      basePath="/admin/settings"
      statusSummary={statusSummary}
    >
      {loading ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : (
        <div className="space-y-4">
          {totalPending > 0 && (
            <div className="rounded-lg border border-yellow-500/20 bg-yellow-50 p-3 dark:bg-yellow-950/20">
              <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                {t('migrations.pendingWarning', { count: totalPending })}
              </p>
            </div>
          )}

          <div className="space-y-3">
            {namespaces.map((ns) => (
              <div key={ns.namespace} className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">{ns.namespace}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      v{ns.currentVersion}/{ns.latestVersion}
                    </span>
                    {ns.error ? (
                      <Badge variant="destructive">{t('common.error')}</Badge>
                    ) : ns.pending > 0 ? (
                      <Badge variant="secondary">{ns.pending} {t('migrations.pending')}</Badge>
                    ) : (
                      <Badge variant="outline" className="text-green-700 dark:text-green-400">
                        {t('migrations.upToDate')}
                      </Badge>
                    )}
                  </div>
                </div>
                {ns.lastRun && (
                  <p className="text-xs text-muted-foreground">
                    {t('migrations.lastRun')}: {new Date(ns.lastRun).toLocaleString()}
                  </p>
                )}
                {ns.history && ns.history.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {ns.history.map((entry) => (
                      <div key={entry.version} className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">
                          v{entry.version}: {entry.name}
                        </span>
                        <span className={entry.status === 'applied' ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400'}>
                          {entry.status === 'applied' ? t('migrations.applied') : t('migrations.pending')}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </SettingsSection>
  )
}
