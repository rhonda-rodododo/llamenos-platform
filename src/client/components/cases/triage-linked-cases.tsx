import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { getLinkedCasesForReport } from '@/lib/api'
import { formatRelativeTime } from '@/lib/format'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Link2, Loader2, FolderOpen } from 'lucide-react'

interface TriageLinkedCasesProps {
  reportId: string
  /** Incremented when a new case is created, triggering a refetch */
  refreshKey: number
}

interface LinkedCase {
  caseId: string
  reportId: string
  linkedAt: string
  linkedBy: string
}

/**
 * Displays cases already linked to a report.
 * Used in the triage queue bottom-right zone.
 */
export function TriageLinkedCases({ reportId, refreshKey }: TriageLinkedCasesProps) {
  const { t } = useTranslation()
  const [cases, setCases] = useState<LinkedCase[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getLinkedCasesForReport(reportId)
      .then(({ records }) => {
        if (!cancelled) setCases(records)
      })
      .catch(() => {
        if (!cancelled) setCases([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [reportId, refreshKey])

  if (loading) {
    return (
      <div data-testid="triage-linked-cases" className="flex items-center justify-center py-6">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (cases.length === 0) {
    return (
      <div data-testid="triage-linked-cases" className="flex flex-col items-center py-6 text-muted-foreground">
        <FolderOpen className="h-6 w-6 mb-1.5 text-muted-foreground/40" />
        <p className="text-xs">{t('triage.noCasesLinked', { defaultValue: 'No cases linked to this report yet.' })}</p>
      </div>
    )
  }

  return (
    <div data-testid="triage-linked-cases" className="space-y-2">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold">
        <Link2 className="h-4 w-4" />
        {t('triage.linkedCases', { defaultValue: 'Linked Cases' })}
        <Badge variant="secondary" className="text-[10px]">{cases.length}</Badge>
      </h3>
      {cases.map((link) => (
        <Card key={link.caseId} data-testid="triage-linked-case-card">
          <CardContent className="flex items-center gap-3 py-2.5">
            <FolderOpen className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-mono truncate">{link.caseId.slice(0, 12)}...</p>
              <p className="text-xs text-muted-foreground">
                {t('triage.linkedAt', {
                  defaultValue: 'Linked {{time}}',
                  time: formatRelativeTime(link.linkedAt, t),
                })}
              </p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
