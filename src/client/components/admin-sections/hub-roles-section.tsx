import { useTranslation } from 'react-i18next'
import { RolesSection as RolesSectionInner } from '@/components/admin-settings/roles-section'

export function HubRolesSection() {
  const { t } = useTranslation()

  return (
    <RolesSectionInner
      expanded={true}
      onToggle={() => {}}
      statusSummary={t('roles.description', { defaultValue: 'Define roles and assign permissions to control access across your hotline.' })}
    />
  )
}
