import { useTranslation } from 'react-i18next'
import { SectionBody, SectionDescription } from '@/components/admin-shell/section-layout'

export function SystemHealthSection() {
  const { t } = useTranslation()

  return (
    <SectionBody>
      <SectionDescription>{t('adminNav.items.systemHealth')}</SectionDescription>
      <div className="text-muted-foreground">{t('common.comingSoon')}</div>
    </SectionBody>
  )
}
