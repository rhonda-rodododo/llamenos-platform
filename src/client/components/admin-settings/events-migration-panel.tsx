import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '@/lib/toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { AlertTriangle, Loader2 } from 'lucide-react'

export function EventsMigrationPanel() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [status, setStatus] = useState<'idle' | 'checking' | 'needed' | 'migrating' | 'done'>('checking')
  const [count, setCount] = useState(0)
  const [migrated, setMigrated] = useState(0)

  useEffect(() => {
    fetch('/api/admin/events/migration-status')
      .then(r => r.json() as Promise<{ pendingCount: number }>)
      .then((data) => {
        if (data.pendingCount > 0) {
          setCount(data.pendingCount)
          setStatus('needed')
        } else {
          setStatus('done')
        }
      })
      .catch(() => setStatus('idle'))
  }, [])

  const runMigration = async () => {
    setStatus('migrating')
    setMigrated(0)
    try {
      const res = await fetch('/api/admin/events/migrate', { method: 'POST' })
      const data = await res.json() as { migrated: number }
      setMigrated(data.migrated)
      setStatus('done')
      toast(t('admin.eventsMigrationComplete', { defaultValue: 'Events migration complete' }), 'success')
    } catch {
      setStatus('needed')
      toast(t('admin.eventsMigrationError', { defaultValue: 'Migration failed' }), 'error')
    }
  }

  if (status === 'done' || status === 'idle') return null

  return (
    <Card data-testid="events-migration-panel" className="border-amber-500/30 bg-amber-50/10">
      <CardContent className="py-4 space-y-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <h3 className="font-medium text-sm">
            {t('admin.eventsMigrationTitle', { defaultValue: 'Legacy Events Migration' })}
          </h3>
        </div>
        {status === 'needed' && (
          <>
            <p className="text-xs text-muted-foreground">
              {t('admin.eventsMigrationDesc', {
                defaultValue: '{{count}} events need migration to the entity record system.',
                count,
              })}
            </p>
            <Button size="sm" onClick={runMigration} data-testid="run-migration-btn">
              {t('admin.eventsMigrateBtn', { defaultValue: 'Migrate Events' })}
            </Button>
          </>
        )}
        {status === 'migrating' && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            {t('admin.eventsMigratingProgress', {
              defaultValue: 'Migrating... {{migrated}} of {{count}}',
              migrated,
              count,
            })}
          </div>
        )}
        {status === 'checking' && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            {t('admin.checkingMigration', { defaultValue: 'Checking migration status...' })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
