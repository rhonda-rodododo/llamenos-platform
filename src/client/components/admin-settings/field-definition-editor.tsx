import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Trash2, Plus, GripVertical } from 'lucide-react'

// Minimal shape covering both CustomFieldDefinition and EntityFieldDefinition
export interface EditableField {
  id: string
  name: string
  label: string
  type: string
  required: boolean
  visibleToUsers?: boolean
  editableByUsers?: boolean
  section?: string
  accessLevel?: string
  placeholder?: string
  helpText?: string
  order: number
}

const FIELD_TYPES = [
  'text', 'number', 'select', 'multiselect', 'checkbox', 'textarea', 'date', 'file', 'location',
] as const

interface FieldDefinitionEditorProps {
  fields: EditableField[]
  onChange: (fields: EditableField[]) => void
  /** Whether to show the section and accessLevel properties (entity type admin only) */
  showEntityOptions?: boolean
}

export function FieldDefinitionEditor({ fields, onChange, showEntityOptions = false }: FieldDefinitionEditorProps) {
  const { t } = useTranslation()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Partial<EditableField> | null>(null)

  function startAdd() {
    setDraft({
      type: 'text',
      required: false,
      visibleToUsers: true,
      editableByUsers: true,
      order: fields.length,
    })
    setEditingId(null)
  }

  function startEdit(field: EditableField) {
    setDraft({ ...field })
    setEditingId(field.id)
  }

  function commitDraft() {
    if (!draft?.label?.trim() || !draft?.name?.trim()) return
    if (editingId) {
      onChange(fields.map(f => f.id === editingId ? { ...f, ...draft } as EditableField : f))
    } else {
      onChange([...fields, { ...draft, id: crypto.randomUUID(), order: fields.length } as EditableField])
    }
    setDraft(null)
    setEditingId(null)
  }

  function deleteField(id: string) {
    onChange(fields.filter(f => f.id !== id))
  }

  return (
    <div className="space-y-2" data-testid="field-definition-editor">
      {fields
        .slice()
        .sort((a, b) => a.order - b.order)
        .map(field => (
          <div
            key={field.id}
            className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
          >
            <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="flex-1 font-medium">{field.label}</span>
            <span className="text-xs text-muted-foreground capitalize">{field.type}</span>
            {field.required && (
              <span className="text-xs text-destructive">
                {t('cms.required', { defaultValue: 'Required' })}
              </span>
            )}
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(field)}>
              <Plus className="h-3.5 w-3.5 rotate-45" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteField(field.id)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}

      {draft !== null && (
        <div className="rounded-md border p-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>{t('cms.fieldLabel', { defaultValue: 'Label' })}</Label>
              <Input
                value={draft.label ?? ''}
                onChange={e => setDraft(d => ({ ...d, label: e.target.value }))}
                placeholder={t('cms.fieldLabelPlaceholder', { defaultValue: 'Display label' })}
              />
            </div>
            <div className="space-y-1">
              <Label>{t('cms.fieldName', { defaultValue: 'Field name' })}</Label>
              <Input
                value={draft.name ?? ''}
                onChange={e => setDraft(d => ({ ...d, name: e.target.value.replace(/[^a-zA-Z0-9_]/g, '_') }))}
                placeholder={t('cms.fieldNamePlaceholder', { defaultValue: 'snake_case_name' })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>{t('cms.fieldType', { defaultValue: 'Type' })}</Label>
              <Select value={draft.type ?? 'text'} onValueChange={v => setDraft(d => ({ ...d, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FIELD_TYPES.map(ft => (
                    <SelectItem key={ft} value={ft} className="capitalize">{ft}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {showEntityOptions && (
              <div className="space-y-1">
                <Label>{t('cms.fieldSection', { defaultValue: 'Section' })}</Label>
                <Input
                  value={draft.section ?? ''}
                  onChange={e => setDraft(d => ({ ...d, section: e.target.value }))}
                  placeholder={t('cms.fieldSectionPlaceholder', { defaultValue: 'Optional grouping' })}
                />
              </div>
            )}
          </div>
          <div className="flex items-center gap-4 text-sm">
            <label className="flex items-center gap-2">
              <Switch
                checked={!!draft.required}
                onCheckedChange={v => setDraft(d => ({ ...d, required: v }))}
              />
              {t('cms.required', { defaultValue: 'Required' })}
            </label>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={commitDraft} disabled={!draft.label?.trim() || !draft.name?.trim()}>
              {t('common.save', { defaultValue: 'Save' })}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setDraft(null); setEditingId(null) }}>
              {t('common.cancel', { defaultValue: 'Cancel' })}
            </Button>
          </div>
        </div>
      )}

      {draft === null && (
        <Button variant="outline" size="sm" className="gap-1" onClick={startAdd}
          data-testid="add-field-btn">
          <Plus className="h-3.5 w-3.5" />
          {t('cms.addField', { defaultValue: 'Add Field' })}
        </Button>
      )}
    </div>
  )
}
