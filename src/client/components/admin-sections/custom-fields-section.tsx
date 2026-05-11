import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '@/lib/toast'
import { getCustomFields, type CustomFieldDefinition } from '@/lib/api'
import { CustomFieldsSection as CustomFieldsSectionInner } from '@/components/admin-settings/custom-fields-section'

export function CustomFieldsSection() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [fields, setFields] = useState<CustomFieldDefinition[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getCustomFields()
      .then(r => setFields(r.fields))
      .catch(() => toast(t('common.error'), 'error'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="text-muted-foreground">{t('common.loading')}</div>

  const statusSummary = fields.length > 0
    ? `${fields.length} ${t('settings.fields', { defaultValue: 'fields' })}`
    : t('common.none', { defaultValue: 'None' })

  return (
    <CustomFieldsSectionInner
      fields={fields}
      onChange={setFields}
      expanded={true}
      onToggle={() => {}}
      statusSummary={statusSummary}
    />
  )
}
