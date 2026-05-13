import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { LockdownModal } from '@/components/security/lockdown-modal'
import { LogOut, ShieldAlert, Smartphone, Monitor } from 'lucide-react'
import { useSessions, terminateSession, terminateOtherSessions } from '@/lib/queries/devices'

export const Route = createFileRoute('/security/sessions')({
  component: SessionsPage,
})

function SessionsPage() {
  const { t } = useTranslation()
  const { data: sessions, isLoading, refetch } = useSessions()
  const [showLockdown, setShowLockdown] = useState(false)
  const [showTerminateAll, setShowTerminateAll] = useState(false)
  const [_terminateLoading, setTerminateLoading] = useState(false)

  if (isLoading) return <div className="animate-pulse">{t('common.loading')}</div>

  const otherSessions = sessions?.filter(s => !s.isCurrent) ?? []

  async function handleTerminateAll() {
    setTerminateLoading(true)
    try {
      await terminateOtherSessions()
      setShowTerminateAll(false)
      refetch()
    } finally {
      setTerminateLoading(false)
    }
  }

  async function handleTerminate(sessionId: string) {
    await terminateSession(sessionId)
    refetch()
  }

  return (
    <div className="space-y-4" data-testid="security-sessions">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t('security.sessions.title')}</h2>
        <div className="flex gap-2">
          {otherSessions.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowTerminateAll(true)}
            >
              <LogOut className="h-4 w-4 mr-1" />
              {t('security.sessions.endOthers')}
            </Button>
          )}
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setShowLockdown(true)}
          >
            <ShieldAlert className="h-4 w-4 mr-1" />
            {t('security.sessions.lockdown')}
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {sessions?.map((session) => {
          const Icon = session.platform === 'ios' || session.platform === 'android'
            ? Smartphone : Monitor

          return (
            <div
              key={session.id}
              className="flex items-center gap-3 p-3 rounded-md border"
              data-testid={`session-${session.id}`}
            >
              <Icon className="h-5 w-5 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    {session.platform ?? t('security.sessions.unknown')}
                  </span>
                  {session.isCurrent && (
                    <Badge variant="secondary" className="text-xs">
                      {t('security.sessions.current')}
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {t('security.sessions.created')} {new Date(session.createdAt).toLocaleString()}
                  {' '}&middot;{' '}
                  {t('security.sessions.expires')} {new Date(session.expiresAt).toLocaleString()}
                </div>
              </div>
              {!session.isCurrent && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleTerminate(session.id)}
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              )}
            </div>
          )
        })}
      </div>

      <ConfirmDialog
        open={showTerminateAll}
        onOpenChange={setShowTerminateAll}
        title={t('security.sessions.endOthersTitle')}
        description={t('security.sessions.endOthersDescription', { count: otherSessions.length })}
        confirmLabel={t('security.sessions.endOthersConfirm')}
        variant="destructive"
        onConfirm={handleTerminateAll}
      />

      <LockdownModal open={showLockdown} onOpenChange={setShowLockdown} />
    </div>
  )
}

export default SessionsPage
