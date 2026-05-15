import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '@/lib/toast'
import { listErasureRequests, type ErasureRequest } from '@/lib/api'
import { ErasureQueueSection as ErasureQueueSectionInner } from '@/components/admin-settings/erasure-queue-section'

export function ErasureQueueSection() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [requests, setRequests] = useState<ErasureRequest[]>([])
  const [loading, setLoading] = useState(true)

  function loadRequests() {
    setLoading(true)
    listErasureRequests()
      .then(({ requests }) => setRequests(requests))
      .catch(() => toast(t('common.error'), 'error'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadRequests() }, [])

  if (loading) return <div className="text-muted-foreground">{t('common.loading')}</div>

  const pendingCount = requests.filter(r => r.status === 'pending').length
  const statusSummary = pendingCount > 0
    ? t('erasure.admin.pendingCount', { count: pendingCount })
    : t('erasure.admin.noPending')

  return (
    <ErasureQueueSectionInner
      requests={requests}
      onRefresh={loadRequests}
      expanded={true}
      onToggle={() => {}}
      statusSummary={statusSummary}
    />
  )
}
