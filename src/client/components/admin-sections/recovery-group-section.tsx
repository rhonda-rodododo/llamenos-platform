import { useTranslation } from 'react-i18next'
import { SectionBody, SectionDescription } from '@/components/admin-shell/section-layout'

export function RecoveryGroupSection() {
  const { t } = useTranslation()

  return (
    <SectionBody>
      <SectionDescription>{t('adminNav.items.recoveryGroup')}</SectionDescription>
      <div className="text-muted-foreground">{t('common.comingSoon')}</div>
    </SectionBody>
  )
}
