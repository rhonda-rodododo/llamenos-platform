import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/lib/auth'
import { useToast } from '@/lib/toast'
import { createReport, getReportCategories, getCustomFields } from '@/lib/api'
import type { CustomFieldDefinition } from '@shared/types'
import { fieldMatchesContext } from '@shared/types'
import { encryptMessage } from '@/lib/platform'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Lock, Loader2, Send } from 'lucide-react'
import { CustomFieldInputs, validateCustomFields } from '@/components/notes/custom-field-inputs'

interface ReportFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (reportId: string) => void
}

export function ReportForm({ open, onOpenChange, onCreated }: ReportFormProps) {
  const { t } = useTranslation()
  const { hasNsec, publicKey, isAdmin, adminDecryptionPubkey } = useAuth()
  const { toast } = useToast()

  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('')
  const [body, setBody] = useState('')
  const [categories, setCategories] = useState<string[]>([])
  const [customFields, setCustomFields] = useState<CustomFieldDefinition[]>([])
  const [fieldValues, setFieldValues] = useState<Record<string, string | number | boolean>>({})
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  // Filter fields for report context
  const reportFields = customFields
    .filter(f => fieldMatchesContext(f, 'reports'))
    .filter(f => isAdmin || f.visibleToVolunteers)

  useEffect(() => {
    if (!open) return
    getReportCategories()
      .then(({ categories: cats }) => setCategories(cats))
      .catch(() => setCategories([]))
    getCustomFields()
      .then(r => setCustomFields(r.fields))
      .catch(() => setCustomFields([]))
  }, [open])

  const resetForm = useCallback(() => {
    setTitle('')
    setCategory('')
    setBody('')
    setFieldValues({})
    setValidationErrors({})
  }, [])

  const handleSubmit = useCallback(async () => {
    if (!title.trim() || !body.trim()) {
      toast(t('reports.fillRequired', { defaultValue: 'Please fill in the required fields' }), 'error')
      return
    }

    if (!hasNsec || !publicKey) {
      toast(t('reports.noKeyPair', { defaultValue: 'Encryption key not available' }), 'error')
      return
    }

    // Validate custom fields
    const errors = validateCustomFields(reportFields, fieldValues, t, { isAdmin })
    setValidationErrors(errors)
    if (Object.keys(errors).length > 0) return

    setSubmitting(true)

    try {
      // Build reader list: reporter + admin decryption key
      const readerPubkeys = [publicKey]
      if (adminDecryptionPubkey && adminDecryptionPubkey !== publicKey) {
        readerPubkeys.push(adminDecryptionPubkey)
      }

      // Encrypt body with custom field values as structured payload
      const nonEmptyFields = Object.entries(fieldValues).filter(([, v]) => v !== '' && v !== undefined)
      const payload = nonEmptyFields.length > 0
        ? JSON.stringify({ text: body.trim(), fields: Object.fromEntries(nonEmptyFields) })
        : body.trim()

      const encrypted = await encryptMessage(payload, readerPubkeys)

      const report = await createReport({
        title: title.trim(),
        category: category || undefined,
        encryptedContent: encrypted.encryptedContent,
        readerEnvelopes: encrypted.readerEnvelopes,
      })

      toast(t('reports.created', { defaultValue: 'Report submitted' }), 'success')
      resetForm()
      onOpenChange(false)
      onCreated(report.id)
    } catch {
      toast(t('reports.createError', { defaultValue: 'Failed to submit report' }), 'error')
    } finally {
      setSubmitting(false)
    }
  }, [title, body, category, fieldValues, reportFields, hasNsec, publicKey, isAdmin, adminDecryptionPubkey, toast, t, resetForm, onOpenChange, onCreated])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{t('reports.newReport', { defaultValue: 'New Report' })}</SheetTitle>
          <SheetDescription>
            <span className="flex items-center gap-1.5">
              <Lock className="h-3 w-3" />
              {t('reports.encryptedNote', { defaultValue: 'Your report is encrypted end-to-end' })}
            </span>
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4 px-4">
          <div className="space-y-2">
            <Label htmlFor="report-title">
              {t('reports.titleLabel', { defaultValue: 'Title' })} *
            </Label>
            <Input
              id="report-title"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={t('reports.titlePlaceholder', { defaultValue: 'Brief description of the report' })}
              disabled={submitting}
              maxLength={200}
            />
          </div>

          {categories.length > 0 && (
            <div className="space-y-2">
              <Label>{t('reports.categoryLabel', { defaultValue: 'Category' })}</Label>
              <Select value={category} onValueChange={setCategory} disabled={submitting}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t('reports.selectCategory', { defaultValue: 'Select a category' })} />
                </SelectTrigger>
                <SelectContent>
                  {categories.map(cat => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="report-body">
              {t('reports.bodyLabel', { defaultValue: 'Details' })} *
            </Label>
            <Textarea
              id="report-body"
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder={t('reports.bodyPlaceholder', { defaultValue: 'Describe the situation in detail...' })}
              disabled={submitting}
              rows={6}
              className="resize-y"
            />
          </div>

          {/* Custom fields for reports */}
          <CustomFieldInputs
            fields={reportFields}
            values={fieldValues}
            onChange={setFieldValues}
            errors={validationErrors}
            disabled={submitting}
            idPrefix="report"
          />

          <div className="flex justify-end pt-2">
            <Button onClick={handleSubmit} disabled={submitting || !title.trim() || !body.trim()}>
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {t('reports.submit', { defaultValue: 'Submit Report' })}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
