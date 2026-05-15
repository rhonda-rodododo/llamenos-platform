import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '@/lib/toast'
import { listPlatformBans, type PlatformBan } from '@/lib/api'
import { PlatformBansSection as PlatformBansSectionInner } from '@/components/admin-settings/platform-bans-section'

export function PlatformBansSection() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [bans, setBans] = useState<PlatformBan[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  function loadBans() {
    setLoading(true)
    listPlatformBans()
      .then(({ bans, total }) => { setBans(bans); setTotal(total) })
      .catch(() => toast(t('common.error'), 'error'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadBans() }, [])

  if (loading) return <div className="text-muted-foreground">{t('common.loading')}</div>

  return (
    <PlatformBansSectionInner
      bans={bans}
      total={total}
      onRefresh={loadBans}
      expanded={true}
      onToggle={() => {}}
      statusSummary={t('platformBans.totalCount', { count: total })}
    />
  )
}
