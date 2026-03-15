import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '@/lib/toast'
import {
  listTemplates,
  applyTemplate,
  type TemplateSummary,
} from '@/lib/api'
import { SettingsSection } from '@/components/settings-section'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { LayoutTemplate, Check, Loader2, HelpCircle } from 'lucide-react'

interface Props {
  expanded: boolean
  onToggle: (open: boolean) => void
  statusSummary?: string
  onTemplateApplied?: () => void
}

export function TemplateBrowser({ expanded, onToggle, statusSummary, onTemplateApplied }: Props) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [templates, setTemplates] = useState<TemplateSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [applying, setApplying] = useState<string | null>(null)
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set())

  const loadTemplates = useCallback(() => {
    listTemplates()
      .then(({ templates: t, appliedTemplateIds }) => {
        setTemplates(t)
        if (appliedTemplateIds?.length) {
          setAppliedIds(prev => new Set([...prev, ...appliedTemplateIds]))
        }
      })
      .catch(() => toast(t('common.error'), 'error'))
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast])

  useEffect(() => {
    if (expanded) loadTemplates()
  }, [expanded, loadTemplates])

  const handleApply = useCallback(async (templateId: string) => {
    setApplying(templateId)
    try {
      const result = await applyTemplate(templateId)
      if (result.applied) {
        setAppliedIds(prev => new Set([...prev, templateId]))
        toast(t('caseManagement.applySuccess', { count: result.entityTypes }), 'success')
        onTemplateApplied?.()
      }
    } catch {
      toast(t('caseManagement.applyError'), 'error')
    } finally {
      setApplying(null)
    }
  }, [toast, t, onTemplateApplied])

  return (
    <SettingsSection
      id="templates"
      title={t('caseManagement.templateBrowserTitle')}
      description={t('caseManagement.templateBrowserDescription')}
      icon={<LayoutTemplate className="h-5 w-5 text-muted-foreground" />}
      expanded={expanded}
      onToggle={onToggle}
      basePath="/admin/case-management"
      statusSummary={statusSummary}
    >
      {/* Help text */}
      <div className="flex items-start gap-2 rounded-md border border-border/50 bg-muted/30 px-3 py-2.5 mb-3">
        <HelpCircle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground">
          {t('caseManagement.help.templates_howto', { defaultValue: 'Browse available templates below. Applying a template creates case types and fields automatically. You can customize everything after applying.' })}
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">{t('caseManagement.loadingTemplates')}</p>
      ) : templates.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('caseManagement.noTemplates')}</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map(tmpl => (
            <TemplateCard
              key={tmpl.id}
              template={tmpl}
              isApplied={appliedIds.has(tmpl.id)}
              isApplying={applying === tmpl.id}
              onApply={() => handleApply(tmpl.id)}
            />
          ))}
        </div>
      )}
    </SettingsSection>
  )
}

function TemplateCard({
  template,
  isApplied,
  isApplying,
  onApply,
}: {
  template: TemplateSummary
  isApplied: boolean
  isApplying: boolean
  onApply: () => void
}) {
  const { t } = useTranslation()

  return (
    <div
      data-testid="template-card"
      className="relative flex flex-col gap-3 rounded-lg border border-border bg-card p-4 transition-shadow hover:shadow-md"
    >
      {/* Applied badge */}
      {isApplied && (
        <Badge
          data-testid="template-applied-badge"
          variant="secondary"
          className="absolute right-3 top-3 gap-1"
        >
          <Check className="h-3 w-3" />
          {t('caseManagement.alreadyApplied')}
        </Badge>
      )}

      {/* Header */}
      <div className="flex items-start gap-2">
        {template.icon && <span className="text-xl">{template.icon}</span>}
        <div className="flex-1">
          <h4 className="text-sm font-semibold">{template.name}</h4>
          <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{template.description}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="flex flex-wrap gap-1.5">
        <Badge data-testid="template-entity-count" variant="outline" className="text-[10px]">
          {t('caseManagement.entityTypesInTemplate', { count: template.entityTypeCount })}
        </Badge>
        <Badge data-testid="template-field-count" variant="outline" className="text-[10px]">
          {t('caseManagement.fieldsInTemplate', { count: template.totalFieldCount })}
        </Badge>
        {template.suggestedRoleCount > 0 && (
          <Badge variant="outline" className="text-[10px]">
            {t('caseManagement.rolesInTemplate', { count: template.suggestedRoleCount })}
          </Badge>
        )}
        {template.version && (
          <Badge variant="outline" className="text-[10px] font-mono">
            {t('caseManagement.templateVersion', { version: template.version })}
          </Badge>
        )}
      </div>

      {/* Tags */}
      {template.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {template.tags.map(tag => (
            <Badge key={tag} variant="secondary" className="text-[9px]">
              {tag}
            </Badge>
          ))}
        </div>
      )}

      {/* Action */}
      <div className="mt-auto pt-1">
        {template.comingSoon ? (
          <p className="text-xs italic text-muted-foreground">{t('caseManagement.templateComingSoon')}</p>
        ) : (
          <Button
            data-testid="template-apply-btn"
            variant="outline"
            size="sm"
            className="w-full"
            disabled={isApplied || isApplying}
            onClick={onApply}
          >
            {isApplying ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                {t('common.loading')}
              </>
            ) : isApplied ? (
              <>
                <Check className="h-3 w-3" />
                {t('caseManagement.alreadyApplied')}
              </>
            ) : (
              t('caseManagement.applyTemplate')
            )}
          </Button>
        )}
      </div>
    </div>
  )
}
