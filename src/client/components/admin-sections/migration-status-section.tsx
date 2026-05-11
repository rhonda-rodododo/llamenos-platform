import { useTranslation } from 'react-i18next'
import { MigrationStatusSection as MigrationStatusSectionInner } from '@/components/admin-settings/migration-status-section'

export function MigrationStatusSection() {
  const { t } = useTranslation()

  return (
    <MigrationStatusSectionInner
      expanded={true}
      onToggle={() => {}}
    />
  )
}
