import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/lib/auth'
import { useNoteSheet } from '@/lib/note-sheet-context'
import { useDraft } from '@/lib/use-draft'
import { encryptNoteV2 } from '@/lib/crypto'

import { createNote, updateNote, getCallHistory, getCustomFields, type CallRecord, type CustomFieldDefinition } from '@/lib/api'
import { useToast } from '@/lib/toast'
import type { NotePayload } from '@shared/types'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Lock, Save, Clock } from 'lucide-react'

export function NoteSheet() {
  const { t } = useTranslation()
  const { hasNsec, publicKey, isAdmin, adminPubkey } = useAuth()
  const { isOpen, mode, editNoteId, initialCallId, initialText, initialFields, close, onSaved } = useNoteSheet()
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)
  const [recentCalls, setRecentCalls] = useState<CallRecord[]>([])
  const [customFields, setCustomFields] = useState<CustomFieldDefinition[]>([])
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})

  const draftKey = mode === 'edit' && editNoteId ? `edit:${editNoteId}` : 'new'
  const draft = useDraft(draftKey)

  // Seed draft from initial values when sheet opens
  useEffect(() => {
    if (!isOpen) return
    if (mode === 'edit' && initialText && !draft.text) {
      draft.setText(initialText)
    }
    if (initialCallId && !draft.callId) {
      draft.setCallId(initialCallId)
    }
    // Seed custom field values from initial (edit mode)
    if (mode === 'edit' && initialFields) {
      for (const [key, val] of Object.entries(initialFields)) {
        if (draft.fields[key] === undefined) {
          draft.setFieldValue(key, val)
        }
      }
    }
  }, [isOpen, mode, initialText, initialCallId])

  // Load custom fields and recent calls
  useEffect(() => {
    if (!isOpen) return
    getCustomFields().then(r => setCustomFields(r.fields)).catch(() => {})
    if (isAdmin) {
      getCallHistory({ limit: 20 }).then(r => setRecentCalls(r.calls)).catch(() => {})
    }
  }, [isAdmin, isOpen])

  function validateFields(): boolean {
    const errors: Record<string, string> = {}
    for (const field of customFields) {
      // Volunteers can only see visible fields
      if (!isAdmin && !field.visibleToVolunteers) continue
      // Read-only fields for volunteers shouldn't be validated
      if (!isAdmin && !field.editableByVolunteers) continue

      const value = draft.fields[field.id]
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
    setValidationErrors(errors)
    return Object.keys(errors).length === 0
  }

  async function handleSave() {
    if (!hasNsec || !publicKey || !draft.text.trim()) return
    if (mode === 'new' && !draft.callId.trim()) return
    if (!validateFields()) return
    setSaving(true)
    try {
      // Build NotePayload with custom field values
      const payload: NotePayload = { text: draft.text }
      const fieldValues = Object.entries(draft.fields).filter(([, v]) => v !== '' && v !== undefined)
      if (fieldValues.length > 0) {
        payload.fields = Object.fromEntries(fieldValues)
      }
      // V2 per-note ephemeral key encryption (forward secrecy)
      const authorPub = publicKey
      const adminPub = adminPubkey || authorPub // fallback to self if admin pubkey not available
      const { encryptedContent, authorEnvelope, adminEnvelope } = encryptNoteV2(payload, authorPub, adminPub)

      if (mode === 'edit' && editNoteId) {
        await updateNote(editNoteId, { encryptedContent, authorEnvelope, adminEnvelope })
      } else {
        await createNote({ callId: draft.callId, encryptedContent, authorEnvelope, adminEnvelope })
      }
      draft.clearDraft()
      close()
      onSaved?.()
    } catch {
      toast(t('common.error'), 'error')
    } finally {
      setSaving(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      handleSave()
    }
  }

  const isMac = typeof navigator !== 'undefined' && navigator.platform?.includes('Mac')
  const modKey = isMac ? '\u2318' : 'Ctrl'

  // Filter fields based on role visibility
  const visibleFields = customFields.filter(f => isAdmin || f.visibleToVolunteers)

  return (
    <Sheet open={isOpen} onOpenChange={open => { if (!open) close() }}>
      <SheetContent side="right" className="sm:max-w-[480px] flex flex-col" onKeyDown={handleKeyDown}>
        <SheetHeader>
          <SheetTitle>
            {mode === 'edit' ? t('notes.editNote') : t('notes.newNote')}
          </SheetTitle>
          <SheetDescription className="flex items-center gap-1">
            <Lock className="h-3 w-3" />
            {t('notes.encryptionNote')}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 px-4 overflow-y-auto">
          {/* Call ID field */}
          <div className="space-y-2">
            <Label htmlFor="sheet-call-id">{t('notes.callId')}</Label>
            {initialCallId && mode === 'new' ? (
              <Badge variant="secondary" className="text-sm">{initialCallId.slice(0, 24)}</Badge>
            ) : recentCalls.length > 0 ? (
              <Select
                value={draft.callId || undefined}
                onValueChange={(v) => {
                  if (v === '__manual') {
                    draft.setCallId('')
                  } else {
                    draft.setCallId(v)
                  }
                }}
              >
                <SelectTrigger id="sheet-call-id">
                  <SelectValue placeholder={t('notes.selectCall')} />
                </SelectTrigger>
                <SelectContent>
                  {recentCalls.map(call => (
                    <SelectItem key={call.id} value={call.id}>
                      {call.callerNumber} — {new Date(call.startedAt).toLocaleString()}
                    </SelectItem>
                  ))}
                  <SelectItem value="__manual">{t('notes.enterManually')}</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <Input
                id="sheet-call-id"
                value={draft.callId}
                onChange={e => draft.setCallId(e.target.value)}
                placeholder={t('notes.callIdPlaceholder')}
                disabled={mode === 'edit'}
              />
            )}
          </div>

          {/* Custom fields */}
          {visibleFields.length > 0 && (
            <div className="space-y-3 rounded-lg border border-border p-3">
              <p className="text-xs font-medium text-muted-foreground">{t('customFields.title')}</p>
              {visibleFields.map(field => {
                const disabled = !isAdmin && !field.editableByVolunteers
                const error = validationErrors[field.id]
                const value = draft.fields[field.id]
                return (
                  <div key={field.id} className="space-y-1.5">
                    <Label htmlFor={`field-${field.id}`} className="flex items-center gap-1.5 text-sm">
                      {field.label}
                      {field.required && <span className="text-destructive">*</span>}
                    </Label>
                    {renderFieldInput(field, value, (v) => draft.setFieldValue(field.id, v), disabled, t)}
                    {error && <p className="text-xs text-destructive">{error}</p>}
                  </div>
                )
              })}
            </div>
          )}

          {/* Note textarea */}
          <div className="space-y-2">
            <Label htmlFor="sheet-note-text">{mode === 'edit' ? t('notes.editNote') : t('notes.newNote')}</Label>
            <textarea
              id="sheet-note-text"
              value={draft.text}
              onChange={e => draft.setText(e.target.value)}
              placeholder={t('notes.notePlaceholder')}
              rows={8}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-y min-h-[120px]"
              autoFocus
            />
          </div>

          {/* Draft indicator */}
          {draft.savedAt && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              {t('notes.draftSaved')} — {new Date(draft.savedAt).toLocaleTimeString()}
            </p>
          )}
        </div>

        <SheetFooter className="border-t border-border">
          <div className="flex items-center gap-2 w-full">
            <Button onClick={handleSave} disabled={saving || !draft.text.trim() || (!draft.callId.trim() && mode === 'new')}>
              <Save className="h-4 w-4" />
              {saving ? t('common.loading') : t('common.save')}
            </Button>
            <Button variant="outline" onClick={close}>
              {t('common.cancel')}
            </Button>
            <span className="ml-auto text-xs text-muted-foreground">
              {modKey}+Enter
            </span>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

function renderFieldInput(
  field: CustomFieldDefinition,
  value: string | number | boolean | undefined,
  onChange: (v: string | number | boolean) => void,
  disabled: boolean,
  t: (key: string) => string,
) {
  const id = `field-${field.id}`
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
