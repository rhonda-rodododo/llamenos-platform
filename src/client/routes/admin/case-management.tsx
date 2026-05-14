import { createFileRoute, useSearch } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/lib/auth'
import { useEffect, useState, useRef, useCallback } from 'react'
import {
  getCaseManagementEnabled,
  setCaseManagementEnabled,
} from '@/lib/api'
import { useToast } from '@/lib/toast'
import { Briefcase } from 'lucide-react'
import { usePersistedExpanded } from '@/components/settings-section'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { SettingsSection } from '@/components/settings-section'
import { CaseManagementSection } from '@/components/admin-settings/case-management-section'
import { TemplateBrowser } from '@/components/admin-settings/template-browser'

export const Route = createFileRoute('/admin/case-management')({
  component: CaseManagementPage,
  validateSearch: (search: Record<string, unknown>) => ({
    section: (search.section as string) || undefined,
  }),
})

function CaseManagementPage() {
  const { t } = useTranslation()
  const { section } = useSearch({ from: '/admin/case-management' })
  const { isAdmin } = useAuth()
  const { toast } = useToast()
  const [cmsEnabled, setCmsEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState(false)

  // Refresh key to reload entity types after template apply
  const [entityRefreshKey, setEntityRefreshKey] = useState(0)

  const { expanded, toggleSection } = usePersistedExpanded(
    'settings-expanded:/admin/case-management',
    ['cms-toggle'],
    section || undefined,
  )
  const scrolledRef = useRef(false)

  useEffect(() => {
    if (!isAdmin) return
    getCaseManagementEnabled()
      .then(({ enabled }) => setCmsEnabled(enabled))
      .catch(() => toast(t('common.error'), 'error'))
      .finally(() => setLoading(false))
  }, [isAdmin, toast, t])

  useEffect(() => {
    if (!loading && section && !scrolledRef.current) {
      scrolledRef.current = true
      requestAnimationFrame(() => {
        document.getElementById(section)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    }
  }, [loading, section])

  async function handleToggleCms(enabled: boolean) {
    setToggling(true)
    try {
      const result = await setCaseManagementEnabled(enabled)
      setCmsEnabled(result.enabled)
      toast(
        result.enabled ? t('caseManagement.enabled') : t('caseManagement.disabled'),
        'success',
      )
    } catch {
      toast(t('common.error'), 'error')
    } finally {
      setToggling(false)
    }
  }

  const handleTemplateApplied = useCallback(() => {
    setEntityRefreshKey(prev => prev + 1)
  }, [])

  // Entity types status summary
  const entityTypesSummary = cmsEnabled
    ? t('caseManagement.entityTypes')
    : t('common.disabled', { defaultValue: 'Disabled' })

  const templatesSummary = t('caseManagement.templates')

  if (!isAdmin) return <div className="text-muted-foreground">{t('common.error')}</div>
  if (loading) return <div className="text-muted-foreground">{t('common.loading')}</div>

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Briefcase className="h-6 w-6 text-primary" />
        <h1 data-testid="page-title" className="text-xl font-bold sm:text-2xl">
          {t('caseManagement.settingsTitle')}
        </h1>
      </div>
      <p className="text-sm text-muted-foreground">
        {t('caseManagement.settingsDescription')}
      </p>

      {/* Section 1: CMS Toggle */}
      <SettingsSection
        id="cms-toggle"
        title={t('caseManagement.toggleTitle')}
        description={t('caseManagement.toggleDescription')}
        icon={<Briefcase className="h-5 w-5 text-muted-foreground" />}
        expanded={expanded.has('cms-toggle')}
        onToggle={(open) => toggleSection('cms-toggle', open)}
        basePath="/admin/case-management"
        statusSummary={cmsEnabled ? t('common.enabled', { defaultValue: 'Enabled' }) : t('common.disabled', { defaultValue: 'Disabled' })}
      >
        <div className="flex items-center gap-3">
          <Switch
            data-testid="cms-enable-toggle"
            checked={cmsEnabled}
            disabled={toggling}
            onCheckedChange={handleToggleCms}
          />
          <Label className="text-sm">{t('caseManagement.enableToggle')}</Label>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {t('caseManagement.enableDescription')}
        </p>
      </SettingsSection>

      {/* Section 2: Entity Types (only visible when CMS is enabled) */}
      {cmsEnabled && (
        <CaseManagementSection
          key={entityRefreshKey}
          expanded={expanded.has('entity-types')}
          onToggle={(open) => toggleSection('entity-types', open)}
          statusSummary={entityTypesSummary}
        />
      )}

      {/* Section 3: Templates (only visible when CMS is enabled) */}
      {cmsEnabled && (
        <TemplateBrowser
          expanded={expanded.has('templates')}
          onToggle={(open) => toggleSection('templates', open)}
          statusSummary={templatesSummary}
          onTemplateApplied={handleTemplateApplied}
        />
      )}
    </div>
  )
}
