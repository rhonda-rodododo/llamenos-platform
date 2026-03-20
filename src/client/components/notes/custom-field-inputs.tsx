import { useTranslation } from 'react-i18next'
import type { CustomFieldDefinition } from '@shared/types'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'

type FieldValue = string | number | boolean

interface Props {
  fields: CustomFieldDefinition[]
  values: Record<string, FieldValue>
  onChange: (values: Record<string, FieldValue>) => void
  errors?: Record<string, string>
  disabled?: boolean
  idPrefix?: string
}

/**
 * Shared custom field inputs — renders all field types with validation display,
 * disabled state, and proper Switch for checkboxes.
 * Used by NoteSheet, NoteEditForm, ReportForm, and conversation notes.
 */
export function CustomFieldInputs({ fields, values, onChange, errors, disabled, idPrefix = 'cf' }: Props) {
  const { t } = useTranslation()

  if (fields.length === 0) return null

  function update(fieldId: string, value: FieldValue) {
    onChange({ ...values, [fieldId]: value })
  }

  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <p className="text-xs font-medium text-muted-foreground">{t('customFields.title')}</p>
      {fields.map(field => {
        const id = `${idPrefix}-${field.id}`
        const value = values[field.id]
        const error = errors?.[field.id]
        return (
          <div key={field.id} className="space-y-1.5">
            <Label htmlFor={id} className="flex items-center gap-1.5 text-sm">
              {field.label}
              {field.required && <span className="text-destructive">*</span>}
            </Label>
            {renderFieldInput(field, id, value, v => update(field.id, v), disabled, t)}
            {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
          </div>
        )
      })}
    </div>
  )
}

/**
 * Validate custom field values. Returns a map of field ID → error message.
 * Empty map means all valid.
 */
export function validateCustomFields(
  fields: CustomFieldDefinition[],
  values: Record<string, FieldValue>,
  t: (key: string, opts?: Record<string, unknown>) => string,
  opts?: { isAdmin?: boolean },
): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const field of fields) {
    if (!opts?.isAdmin && !field.visibleToUsers) continue
    if (!opts?.isAdmin && !field.editableByUsers) continue

    const value = values[field.id]
    if (field.required && (value === undefined || value === '' || value === false)) {
      errors[field.id] = t('customFields.fieldRequired', { label: field.label })
    }
    if (field.type === 'text' || field.type === 'textarea') {
      const str = (value as string) || ''
      if (field.validation?.minLength && str.length > 0 && str.length < field.validation.minLength) {
        errors[field.id] = t('customFields.tooShort', { min: field.validation.minLength })
      }
      if (field.validation?.maxLength && str.length > field.validation.maxLength) {
        errors[field.id] = t('customFields.tooLong', { max: field.validation.maxLength })
      }
    }
    if (field.type === 'number' && value !== undefined && value !== '') {
      const num = Number(value)
      if (field.validation?.min !== undefined && num < field.validation.min) {
        errors[field.id] = t('customFields.tooLow', { min: field.validation.min })
      }
      if (field.validation?.max !== undefined && num > field.validation.max) {
        errors[field.id] = t('customFields.tooHigh', { max: field.validation.max })
      }
    }
  }
  return errors
}

function renderFieldInput(
  field: CustomFieldDefinition,
  id: string,
  value: FieldValue | undefined,
  onChange: (v: FieldValue) => void,
  disabled: boolean | undefined,
  t: (key: string) => string,
) {
  switch (field.type) {
    case 'text':
      return (
        <Input
          id={id}
          value={(value as string) || ''}
          onChange={e => onChange(e.target.value)}
          disabled={disabled}
          maxLength={field.validation?.maxLength}
        />
      )
    case 'number':
      return (
        <Input
          id={id}
          type="number"
          value={value !== undefined ? String(value) : ''}
          onChange={e => onChange(e.target.value ? Number(e.target.value) : '')}
          disabled={disabled}
          min={field.validation?.min}
          max={field.validation?.max}
        />
      )
    case 'textarea':
      return (
        <textarea
          id={id}
          value={(value as string) || ''}
          onChange={e => onChange(e.target.value)}
          disabled={disabled}
          rows={3}
          maxLength={field.validation?.maxLength}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-y"
        />
      )
    case 'checkbox':
      return (
        <div className="flex items-center gap-2">
          <Switch
            id={id}
            checked={!!value}
            onCheckedChange={onChange}
            disabled={disabled}
          />
        </div>
      )
    case 'select':
      return (
        <Select
          value={(value as string) || undefined}
          onValueChange={onChange}
          disabled={disabled}
        >
          <SelectTrigger id={id}>
            <SelectValue placeholder={t('customFields.selectOption')} />
          </SelectTrigger>
          <SelectContent>
            {field.options?.map(opt => (
              <SelectItem key={opt} value={opt}>{opt}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )
    default:
      return null
  }
}
