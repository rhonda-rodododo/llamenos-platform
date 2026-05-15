import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '@/lib/toast'
import {
  listEntityTemplates,
  applyEntityTemplate,
  type EntityTemplate,
} from '@/lib/api'
import { SettingsSection } from '@/components/settings-section'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, LayoutTemplate, Plus, Check } from 'lucide-react'

interface Props {
  expanded: boolean
  onToggle: (open: boolean) => void
  statusSummary?: string
}

export function EntityTemplatesSection({ expanded, onToggle, statusSummary }: Props) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [templates, setTemplates] = useState<EntityTemplate[]>([])
  const [appliedIds, setAppliedIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [applying, setApplying] = useState<string | null>(null)

  const loadTemplates = useCallback(() => {
    setLoading(true)
    listEntityTemplates()
      .then(({ templates: tlist, appliedTemplateIds }) => {
        setTemplates(tlist)
        setAppliedIds(appliedTemplateIds ?? [])
      })
      .catch(() => toast(t('common.error'), 'error'))
      .finally(() => setLoading(false))
  }, [toast, t])

  useEffect(() => {
    if (expanded) loadTemplates()
  }, [expanded, loadTemplates])

  const handleApply = useCallback(async (templateId: string) => {
    setApplying(templateId)
    try {
      const result = await applyEntityTemplate(templateId)
      if (result.applied) {
        setAppliedIds(prev => [...prev, templateId])
        toast(t('entityTemplates.applySuccess', { defaultValue: 'Template applied successfully' }), 'success')
      } else {
        toast(t('entityTemplates.applyError', { defaultValue: 'Failed to apply template' }), 'error')
      }
    } catch {
      toast(t('entityTemplates.applyError', { defaultValue: 'Failed to apply template' }), 'error')
    } finally {
      setApplying(null)
    }
  }, [toast, t])

  return (
    <SettingsSection
      id="entity-templates"
      title={t('entityTemplates.title', { defaultValue: 'Entity Templates' })}
      description={t('entityTemplates.description', { defaultValue: 'Pre-configured entity types for common use cases.' })}
      icon={<LayoutTemplate className="h-5 w-5 text-muted-foreground" />}
      expanded={expanded}
      onToggle={onToggle}
      basePath="/admin/settings"
      statusSummary={statusSummary}
    >
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('common.loading')}
        </div>
      ) : templates.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t('entityTemplates.noTemplates', { defaultValue: 'No templates available.' })}
        </p>
      ) : (
        <div className="space-y-2">
          {templates.map(template => {
            const isApplied = appliedIds.includes(template.id)
            return (
              <div
                key={template.id}
                data-testid="entity-template-row"
                className="flex items-center gap-3 rounded-lg border border-border px-4 py-3"
              >
                <div className="flex-1 space-y-0.5">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{template.label}</p>
                    {template.isBuiltin && (
                      <Badge variant="secondary" className="text-[10px]">
                        {t('entityTemplates.builtinBadge', { defaultValue: 'Built-in' })}
                      </Badge>
                    )}
                    {isApplied && (
                      <Badge variant="outline" className="text-[10px] gap-1">
                        <Check className="h-2.5 w-2.5" />
                        {t('entityTemplates.applied', { defaultValue: 'Applied' })}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{template.description}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-[10px]">
                      {template.category}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {template.fields.length} {t('caseManagement.fields')}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {template.statuses.length} {t('caseManagement.statuses')}
                    </Badge>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant={isApplied ? 'outline' : 'default'}
                  disabled={isApplied || applying === template.id}
                  onClick={() => handleApply(template.id)}
                  data-testid={`apply-template-${template.id}`}
                >
                  {applying === template.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : isApplied ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <Plus className="h-3.5 w-3.5" />
                  )}
                  {isApplied
                    ? t('entityTemplates.applied', { defaultValue: 'Applied' })
                    : t('entityTemplates.applyBtn', { defaultValue: 'Enable for this hub' })}
                </Button>
              </div>
            )
          })}
        </div>
      )}
    </SettingsSection>
  )
}
