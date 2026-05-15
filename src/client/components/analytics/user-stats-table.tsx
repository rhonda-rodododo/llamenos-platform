import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChevronUp, ChevronDown } from 'lucide-react'
import type { UserStatsResponse } from '@protocol/schemas/analytics'

interface UserStatsTableProps {
  data?: UserStatsResponse['users']
  loading: boolean
}

type SortKey = 'callsAnswered' | 'avgDurationSeconds' | 'notesCreated'

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

export function UserStatsTable({ data, loading }: UserStatsTableProps) {
  const { t } = useTranslation()
  const [sortKey, setSortKey] = useState<SortKey>('callsAnswered')
  const [sortAsc, setSortAsc] = useState(false)

  if (!loading && (!data || data.length === 0)) {
    return (
      <Card>
        <CardHeader><CardTitle>{t('analytics.users.title')}</CardTitle></CardHeader>
        <CardContent><p className="text-muted-foreground">{t('analytics.users.noData')}</p></CardContent>
      </Card>
    )
  }

  const sorted = [...(data ?? [])].sort((a, b) => {
    const diff = a[sortKey] - b[sortKey]
    return sortAsc ? diff : -diff
  })

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(!sortAsc)
    else { setSortKey(key); setSortAsc(false) }
  }

  const SortIcon = ({ col }: { col: SortKey }) =>
    sortKey === col
      ? sortAsc ? <ChevronUp className="inline h-3 w-3" /> : <ChevronDown className="inline h-3 w-3" />
      : null

  return (
    <Card data-testid="user-stats-table">
      <CardHeader><CardTitle>{t('analytics.users.title')}</CardTitle></CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-32 animate-pulse rounded bg-muted" />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="pb-2 pr-4">{t('analytics.users.name')}</th>
                <th className="cursor-pointer pb-2 pr-4" onClick={() => toggleSort('callsAnswered')}>
                  {t('analytics.users.callsAnswered')} <SortIcon col="callsAnswered" />
                </th>
                <th className="cursor-pointer pb-2 pr-4" onClick={() => toggleSort('avgDurationSeconds')}>
                  {t('analytics.users.avgDuration')} <SortIcon col="avgDurationSeconds" />
                </th>
                <th className="cursor-pointer pb-2" onClick={() => toggleSort('notesCreated')}>
                  {t('analytics.users.notesCreated')} <SortIcon col="notesCreated" />
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((user) => (
                <tr key={user.pubkey} className="border-b last:border-0">
                  <td className="py-2 pr-4">{user.displayName ?? user.pubkey.slice(0, 12)}</td>
                  <td className="py-2 pr-4 font-medium">{user.callsAnswered}</td>
                  <td className="py-2 pr-4">{formatDuration(user.avgDurationSeconds)}</td>
                  <td className="py-2">{user.notesCreated}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  )
}
