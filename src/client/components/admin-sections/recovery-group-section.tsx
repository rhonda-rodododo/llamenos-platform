import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '@/lib/toast'
import {
  getRecoveryGroup,
  getRecoveryGroupCandidates,
  getActiveHub,
  type RecoveryGroupInfo,
  type RecoveryGroupCandidate,
} from '@/lib/api'
import { RecoveryGroupSettingsSection } from '@/components/admin-settings/recovery-group-section'

export function RecoveryGroupSection() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const hubId = getActiveHub()
  const [group, setGroup] = useState<RecoveryGroupInfo | null>(null)
  const [candidates, setCandidates] = useState<RecoveryGroupCandidate[]>([])
  const [loading, setLoading] = useState(true)

  async function loadData() {
    if (!hubId) return
    setLoading(true)
    try {
      const [groupData, candidatesData] = await Promise.all([
        getRecoveryGroup(hubId),
        getRecoveryGroupCandidates(hubId),
      ])
      setGroup(groupData)
      setCandidates(candidatesData)
    } catch {
      toast(t('common.error'), 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [hubId])

  if (loading) {
    return <div className="p-4 text-sm text-muted-foreground">{t('common.loading')}</div>
  }

  if (!hubId) {
    return <div className="p-4 text-sm text-muted-foreground">{t('common.error')}</div>
  }

  return (
    <RecoveryGroupSettingsSection
      hubId={hubId}
      group={group}
      shareHolderCandidates={candidates}
      onGroupChanged={loadData}
    />
  )
}
