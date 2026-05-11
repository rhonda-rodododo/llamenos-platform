import { useTranslation } from 'react-i18next'
import { SectionBody, SectionDescription } from '@/components/admin-shell/section-layout'

export function WebhooksSection() {
  const { t } = useTranslation()

  return (
    <SectionBody>
      <SectionDescription>{t('adminNav.items.webhooks')}</SectionDescription>
      <div className="text-muted-foreground">{t('common.comingSoon')}</div>
    </SectionBody>
  )
}
