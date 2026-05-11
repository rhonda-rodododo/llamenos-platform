import { useTranslation } from 'react-i18next'
import { ReportTypesSection as ReportTypesSectionInner } from '@/components/admin-settings/report-types-section'

export function ReportTypesSection() {
  const { t } = useTranslation()

  return (
    <ReportTypesSectionInner
      expanded={true}
      onToggle={() => {}}
      statusSummary={t('reportTypes.title', { defaultValue: 'Report Types' })}
    />
  )
}
