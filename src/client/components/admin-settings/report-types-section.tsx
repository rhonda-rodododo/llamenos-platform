import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '@/lib/toast'
import {
  getReportTypesAdmin,
  createReportType,
  updateReportType,
  archiveReportType,
} from '@/lib/api'
import type { ReportType, CustomFieldDefinition } from '@shared/types'
import { MAX_REPORT_TYPES, MAX_CUSTOM_FIELDS } from '@shared/types'
import { SettingsSection } from '@/components/settings-section'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  FileText, Plus, Save, Trash2, Archive, Star,
  ChevronDown, ChevronUp,
} from 'lucide-react'

interface Props {
  expanded: boolean
  onToggle: (open: boolean) => void
  statusSummary?: string
}

export function ReportTypesSection({ expanded, onToggle, statusSummary }: Props) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [reportTypes, setReportTypes] = useState<ReportType[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Partial<ReportType> | null>(null)
  const [saving, setSaving] = useState(false)

  const loadTypes = useCallback(() => {
    getReportTypesAdmin()
      .then(({ reportTypes: types }) => setReportTypes(types))
      .catch(() => toast(t('common.error'), 'error'))
      .finally(() => setLoading(false))
  }, [toast, t])

  useEffect(() => {
    if (expanded) loadTypes()
  }, [expanded, loadTypes])

  const handleCreate = useCallback(async () => {
    if (!editing?.name?.trim()) return
    setSaving(true)
    try {
      const created = await createReportType({
        name: editing.name!.trim(),
        description: editing.description?.trim(),
        icon: editing.icon?.trim() || undefined,
        fields: editing.fields || [],
        isDefault: editing.isDefault,
      })
      setReportTypes(prev => [...prev, created])
      setEditing(null)
      toast(t('reportTypes.created'), 'success')
    } catch {
      toast(t('reportTypes.createError'), 'error')
    } finally {
      setSaving(false)
    }
  }, [editing, toast, t])

  const handleUpdate = useCallback(async () => {
    if (!editing?.id || !editing?.name?.trim()) return
    setSaving(true)
    try {
      const updated = await updateReportType(editing.id, {
        name: editing.name!.trim(),
        description: editing.description?.trim(),
        icon: editing.icon?.trim() || undefined,
        fields: editing.fields || [],
        isDefault: editing.isDefault,
      })
      setReportTypes(prev => prev.map(rt =>
        rt.id === updated.id ? updated : (updated.isDefault ? { ...rt, isDefault: false } : rt)
      ))
      setEditing(null)
      toast(t('reportTypes.updated'), 'success')
    } catch {
      toast(t('reportTypes.updateError'), 'error')
    } finally {
      setSaving(false)
    }
  }, [editing, toast, t])

  const handleSave = useCallback(() => {
    if (editing?.id) {
      handleUpdate()
    } else {
      handleCreate()
    }
  }, [editing, handleCreate, handleUpdate])

  const handleArchive = useCallback(async (id: string) => {
    if (!confirm(t('reportTypes.archiveConfirm'))) return
    try {
      await archiveReportType(id)
      loadTypes()
      toast(t('reportTypes.archiveSuccess'), 'success')
    } catch {
      toast(t('reportTypes.archiveError'), 'error')
    }
  }, [toast, t, loadTypes])

  const activeTypes = reportTypes.filter(rt => !rt.isArchived)
  const archivedTypes = reportTypes.filter(rt => rt.isArchived)

  return (
    <SettingsSection
      id="report-types"
      title={t('reportTypes.title')}
      description={t('reportTypes.description')}
      icon={<FileText className="h-5 w-5 text-muted-foreground" />}
      expanded={expanded}
      onToggle={onToggle}
      basePath="/admin/settings"
      statusSummary={statusSummary}
    >
      {loading ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : (
        <>
          {/* Active report types list */}
          {activeTypes.length === 0 && !editing ? (
            <p className="text-sm text-muted-foreground">{t('reports.noTypes')}</p>
          ) : (
            <div className="space-y-2">
              {activeTypes.map(rt => (
                <div
                  key={rt.id}
                  data-testid="report-type-row"
                  className="flex items-center gap-3 rounded-lg border border-border px-4 py-3"
                >
                  <div className="flex-1 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{rt.name}</p>
                      {rt.isDefault && (
                        <Badge variant="secondary" className="text-[10px] gap-1">
                          <Star className="h-2.5 w-2.5" />
                          {t('reportTypes.default')}
                        </Badge>
                      )}
                    </div>
                    {rt.description && (
                      <p className="text-xs text-muted-foreground">{rt.description}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      {rt.icon && (
                        <Badge variant="outline" className="text-[10px]">{rt.icon}</Badge>
                      )}
                      <Badge variant="outline" className="text-[10px]">
                        {rt.fields.length} {t('settings.fields', { defaultValue: 'fields' })}
                      </Badge>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setEditing({ ...rt })}>
                    {t('common.edit')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    data-testid="report-type-archive-btn"
                    onClick={() => handleArchive(rt.id)}
                    disabled={activeTypes.length <= 1}
                  >
                    <Archive className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Archived types (collapsed) */}
          {archivedTypes.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {t('reportTypes.archived')} ({archivedTypes.length})
              </p>
              {archivedTypes.map(rt => (
                <div
                  key={rt.id}
                  className="flex items-center gap-3 rounded-lg border border-border/50 bg-muted/30 px-4 py-2 opacity-60"
                >
                  <div className="flex-1">
                    <p className="text-sm">{rt.name}</p>
                  </div>
                  <Badge variant="outline" className="text-[10px]">{t('reportTypes.archived')}</Badge>
                </div>
              ))}
            </div>
          )}

          {/* Add/Edit form */}
          {editing ? (
            <div className="space-y-4 rounded-lg border border-primary/30 bg-primary/5 p-4 mt-4">
              <h4 className="text-sm font-medium">
                {editing.id ? t('reportTypes.editType') : t('reportTypes.addType')}
              </h4>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="rt-name">{t('reportTypes.name')}</Label>
                  <Input
                    id="rt-name"
                    data-testid="report-type-name-input"
                    value={editing.name || ''}
                    onChange={e => setEditing(prev => ({ ...prev!, name: e.target.value }))}
                    placeholder={t('reportTypes.namePlaceholder')}
                    maxLength={100}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="rt-icon">{t('reportTypes.icon')}</Label>
                  <Input
                    id="rt-icon"
                    data-testid="report-type-icon-input"
                    value={editing.icon || ''}
                    onChange={e => setEditing(prev => ({ ...prev!, icon: e.target.value }))}
                    placeholder={t('reportTypes.iconPlaceholder')}
                    maxLength={50}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="rt-description">{t('reportTypes.typeDescription')}</Label>
                <Textarea
                  id="rt-description"
                  data-testid="report-type-description-input"
                  value={editing.description || ''}
                  onChange={e => setEditing(prev => ({ ...prev!, description: e.target.value }))}
                  placeholder={t('reportTypes.descriptionPlaceholder')}
                  rows={2}
                  className="resize-y"
                />
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  checked={editing.isDefault ?? false}
                  onCheckedChange={checked => setEditing(prev => ({ ...prev!, isDefault: checked }))}
                />
                <Label className="text-sm">{t('reportTypes.default')}</Label>
                <p className="text-xs text-muted-foreground ml-2">{t('reportTypes.defaultHelp')}</p>
              </div>

              {/* Fields editor inline */}
              <ReportTypeFieldsEditor
                fields={editing.fields || []}
                onChange={fields => setEditing(prev => ({ ...prev!, fields }))}
              />

              <div className="flex gap-2">
                <Button
                  data-testid="report-type-save-btn"
                  disabled={saving || !editing.name?.trim()}
                  onClick={handleSave}
                >
                  <Save className="h-4 w-4" />
                  {saving ? t('common.loading') : t('common.save')}
                </Button>
                <Button variant="outline" onClick={() => setEditing(null)}>
                  {t('common.cancel')}
                </Button>
              </div>
            </div>
          ) : (
            activeTypes.length < MAX_REPORT_TYPES && (
              <Button
                data-testid="report-type-add-btn"
                variant="outline"
                className="mt-4"
                onClick={() => setEditing({
                  fields: [],
                  isDefault: false,
                })}
              >
                <Plus className="h-4 w-4" />
                {t('reportTypes.addType')}
              </Button>
            )
          )}

          {activeTypes.length >= MAX_REPORT_TYPES && (
            <p className="text-xs text-muted-foreground mt-2">{t('reportTypes.maxTypes')}</p>
          )}
        </>
      )}
    </SettingsSection>
  )
}

/** Inline field editor for a report type's custom fields */
function ReportTypeFieldsEditor({ fields, onChange }: {
  fields: CustomFieldDefinition[]
  onChange: (fields: CustomFieldDefinition[]) => void
}) {
  const { t } = useTranslation()
  const [editingField, setEditingField] = useState<Partial<CustomFieldDefinition> | null>(null)

  function handleAddField() {
    setEditingField({
      type: 'text',
      required: false,
      visibleToUsers: true,
      editableByUsers: true,
      context: 'reports',
    })
  }

  function handleSaveField() {
    if (!editingField?.label?.trim() || !editingField?.name?.trim()) return

    let next: CustomFieldDefinition[]
    if (editingField.id) {
      next = fields.map(f =>
        f.id === editingField.id ? { ...f, ...editingField } as CustomFieldDefinition : f
      )
    } else {
      const newField: CustomFieldDefinition = {
        id: crypto.randomUUID(),
        name: editingField.name!,
        label: editingField.label!,
        type: editingField.type || 'text',
        required: editingField.required ?? false,
        options: editingField.options,
        validation: editingField.validation,
        visibleToUsers: editingField.visibleToUsers ?? true,
        editableByUsers: editingField.editableByUsers ?? true,
        context: 'reports',
        order: fields.length,
        createdAt: new Date().toISOString(),
      }
      next = [...fields, newField]
    }
    next.forEach((f, i) => f.order = i)
    onChange(next)
    setEditingField(null)
  }

  function handleDeleteField(id: string) {
    const next = fields.filter(f => f.id !== id)
    next.forEach((f, i) => f.order = i)
    onChange(next)
  }

  function handleReorder(index: number, direction: -1 | 1) {
    const next = [...fields]
    const swapIdx = index + direction
    ;[next[index], next[swapIdx]] = [next[swapIdx], next[index]]
    next.forEach((f, i) => f.order = i)
    onChange(next)
  }

  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <h5 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {t('reportTypes.fields')}
      </h5>

      {fields.length === 0 && !editingField ? (
        <p className="text-xs text-muted-foreground">{t('reportTypes.noFields')}</p>
      ) : (
        <div className="space-y-1.5">
          {fields.map((field, index) => (
            <div key={field.id} className="flex items-center gap-2 rounded border border-border/50 px-3 py-2 text-sm">
              <div className="flex flex-col gap-0.5">
                <Button variant="ghost" size="icon-xs" disabled={index === 0} onClick={() => handleReorder(index, -1)}>
                  <ChevronUp className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="icon-xs" disabled={index === fields.length - 1} onClick={() => handleReorder(index, 1)}>
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </div>
              <div className="flex-1 space-y-0.5">
                <p className="font-medium text-xs">{field.label}</p>
                <div className="flex gap-1">
                  <Badge variant="outline" className="text-[9px]">{field.type}</Badge>
                  {field.required && <Badge variant="secondary" className="text-[9px]">{t('customFields.required')}</Badge>}
                </div>
              </div>
              <Button variant="ghost" size="icon-xs" onClick={() => setEditingField({ ...field })}>
                <FileText className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="icon-xs" onClick={() => handleDeleteField(field.id)}>
                <Trash2 className="h-3 w-3 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {editingField ? (
        <div className="space-y-3 rounded border border-primary/20 bg-background p-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">{t('customFields.fieldLabel')}</Label>
              <Input
                size={1}
                value={editingField.label || ''}
                onChange={e => {
                  const label = e.target.value
                  const autoName = !editingField.id
                  setEditingField(prev => ({
                    ...prev!,
                    label,
                    ...(autoName ? { name: label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 50) } : {}),
                  }))
                }}
                placeholder="e.g. Location"
                className="text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t('customFields.fieldType')}</Label>
              <select
                value={editingField.type || 'text'}
                onChange={e => setEditingField(prev => ({ ...prev!, type: e.target.value as CustomFieldDefinition['type'] }))}
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="text">{t('customFields.types.text')}</option>
                <option value="number">{t('customFields.types.number')}</option>
                <option value="select">{t('customFields.types.select')}</option>
                <option value="checkbox">{t('customFields.types.checkbox')}</option>
                <option value="textarea">{t('customFields.types.textarea')}</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Switch
              checked={editingField.required ?? false}
              onCheckedChange={checked => setEditingField(prev => ({ ...prev!, required: checked }))}
            />
            <Label className="text-xs">{t('customFields.required')}</Label>
          </div>

          {editingField.type === 'select' && (
            <div className="space-y-1.5">
              <Label className="text-xs">{t('customFields.options')}</Label>
              {(editingField.options || []).map((opt, i) => (
                <div key={i} className="flex gap-1">
                  <Input
                    size={1}
                    value={opt}
                    onChange={e => {
                      const next = [...(editingField.options || [])]
                      next[i] = e.target.value
                      setEditingField(prev => ({ ...prev!, options: next }))
                    }}
                    className="text-xs"
                  />
                  <Button variant="ghost" size="icon-xs" onClick={() => {
                    setEditingField(prev => ({ ...prev!, options: prev!.options!.filter((_, j) => j !== i) }))
                  }}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => {
                setEditingField(prev => ({ ...prev!, options: [...(prev!.options || []), ''] }))
              }}>
                <Plus className="h-3 w-3" />
                {t('customFields.addOption')}
              </Button>
            </div>
          )}

          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={!editingField.label?.trim()}
              onClick={handleSaveField}
            >
              <Save className="h-3 w-3" />
              {t('common.save')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setEditingField(null)}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      ) : (
        fields.length < MAX_CUSTOM_FIELDS && (
          <Button variant="outline" size="sm" onClick={handleAddField}>
            <Plus className="h-3 w-3" />
            {t('customFields.addField')}
          </Button>
        )
      )}
    </div>
  )
}
