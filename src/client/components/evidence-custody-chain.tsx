import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '@/lib/toast'
import { getEvidenceCustody, type CustodyEntry } from '@/lib/api'
import { formatTimestamp } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Loader2, Shield, ShieldCheck, ShieldAlert, Lock } from 'lucide-react'

interface EvidenceCustodyChainProps {
  evidenceId: string
}

export function EvidenceCustodyChain({ evidenceId }: EvidenceCustodyChainProps) {
  const { t } = useTranslation()
  const { toast } = useToast()

  const [entries, setEntries] = useState<CustodyEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    getEvidenceCustody(evidenceId)
      .then(({ custodyChain }) => setEntries(custodyChain))
      .catch(() => toast(t('cms.custodyLoadError'), 'error'))
      .finally(() => setLoading(false))
  }, [evidenceId, toast, t])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        {t('common.loading')}
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        {t('cms.custodyEmpty')}
      </p>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-3">
        <ShieldCheck className="h-4 w-4 text-green-600 dark:text-green-400" />
        <span className="text-sm font-medium">{t('cms.custodyChain')}</span>
        <Badge variant="secondary" className="text-xs">
          {entries.length} {t('cms.custodyEntries')}
        </Badge>
      </div>

      <ol className="relative border-l border-muted-foreground/20 ml-3 space-y-4">
        {entries.map((entry, idx) => (
          <li key={entry.id} className="ml-4">
            <div className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border border-background bg-muted-foreground/40" />
            <div className="rounded-md border p-3 text-sm">
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-1.5">
                  <CustodyActionIcon action={entry.action} />
                  <span className="font-medium capitalize">{entry.action}</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  #{idx + 1}
                </span>
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Lock className="h-3 w-3" />
                <span className="font-mono truncate max-w-48" title={entry.actorPubkey}>
                  {entry.actorPubkey.slice(0, 16)}…
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {formatTimestamp(entry.timestamp)}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}

function CustodyActionIcon({ action }: { action: string }) {
  switch (action) {
    case 'upload':
    case 'create':
      return <Shield className="h-3.5 w-3.5 text-blue-500" />
    case 'verify':
      return <ShieldCheck className="h-3.5 w-3.5 text-green-500" />
    case 'tampered':
    case 'integrity_failure':
      return <ShieldAlert className="h-3.5 w-3.5 text-red-500" />
    default:
      return <Lock className="h-3.5 w-3.5 text-muted-foreground" />
  }
}
