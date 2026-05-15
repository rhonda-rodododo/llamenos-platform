import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Progress } from '@/components/ui/progress'
import { useRelaySubscription } from '@/lib/relay/hooks'
import { KIND_BLAST_PROGRESS } from '@shared/event-kinds'
import { getBlastStats } from '@/lib/api'
import type { BlastStats } from '@/lib/api'
import { useConfig } from '@/lib/config'

interface BlastProgressBarProps {
  blastId: string
  /** Initial stats (from parent, may be undefined for live-only mode) */
  initialStats?: BlastStats
}

export function BlastProgressBar({ blastId, initialStats }: BlastProgressBarProps) {
  const { t } = useTranslation()
  const { currentHubId } = useConfig()
  const [stats, setStats] = useState<BlastStats | null>(initialStats ?? null)
  const blastIdRef = useRef(blastId)
  blastIdRef.current = blastId

  // Fetch initial stats if not provided
  useEffect(() => {
    if (!initialStats) {
      getBlastStats(blastId).then(s => setStats(s)).catch(() => {/* ignore */})
    }
  }, [blastId, initialStats])

  // Subscribe to live blast:progress WS events
  useRelaySubscription(
    currentHubId,
    [KIND_BLAST_PROGRESS],
    (_kind, content) => {
      const ev = content as { blastId?: string; stats?: BlastStats }
      if (ev.blastId === blastIdRef.current && ev.stats) {
        setStats(ev.stats)
      }
    },
  )

  if (!stats) return null

  const { totalRecipients, delivered, failed, sent, optedOut } = stats
  const total = totalRecipients
  const pending = total - delivered - failed - sent - optedOut
  const deliveredPct = total > 0 ? Math.round(((delivered + sent) / total) * 100) : 0
  const failedPct = total > 0 ? Math.round((failed / total) * 100) : 0

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{t('blasts.progressTitle')}</span>
        <span>{deliveredPct}%</span>
      </div>
      <Progress value={deliveredPct} className="h-2" />
      <div className="flex gap-4 text-xs text-muted-foreground">
        <span className="text-green-600 dark:text-green-400">
          {t('blasts.progressDelivered')}: {delivered + sent}
        </span>
        <span className="text-yellow-600 dark:text-yellow-400">
          {t('blasts.progressPending')}: {pending}
        </span>
        {failed > 0 && (
          <span className="text-red-500">
            {t('blasts.progressFailed')}: {failed}
          </span>
        )}
        {failedPct > 0 && (
          <span className="text-muted-foreground">({failedPct}% {t('blasts.progressFailed').toLowerCase()})</span>
        )}
      </div>
    </div>
  )
}
