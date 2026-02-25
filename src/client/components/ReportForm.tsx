import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/lib/auth'
import { useToast } from '@/lib/toast'
import { createReport, getReportCategories } from '@/lib/api'
import { encryptForPublicKey } from '@/lib/crypto'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Lock, Loader2, Send } from 'lucide-react'

interface ReportFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (reportId: string) => void
}

export function ReportForm({ open, onOpenChange, onCreated }: ReportFormProps) {
  const { t } = useTranslation()
  const { hasNsec, publicKey, adminDecryptionPubkey } = useAuth()
  const { toast } = useToast()

  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('')
  const [body, setBody] = useState('')
  const [categories, setCategories] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    getReportCategories()
      .then(({ categories: cats }) => setCategories(cats))
      .catch(() => setCategories([]))
  }, [open])

  const resetForm = useCallback(() => {
    setTitle('')
    setCategory('')
    setBody('')
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

    setSubmitting(true)

    try {
      const recipientPubkey = adminDecryptionPubkey || publicKey

      // Encrypt body for the reporter
      const bodyEncrypted = encryptForPublicKey(body.trim(), publicKey)
      // Encrypt body for the admin
      const bodyEncryptedAdmin = encryptForPublicKey(body.trim(), recipientPubkey)

      const report = await createReport({
        title: title.trim(),
        category: category || undefined,
        encryptedContent: bodyEncrypted.encryptedContent,
        ephemeralPubkey: bodyEncrypted.ephemeralPubkey,
        encryptedContentAdmin: bodyEncryptedAdmin.encryptedContent,
        ephemeralPubkeyAdmin: bodyEncryptedAdmin.ephemeralPubkey,
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
  }, [title, body, category, hasNsec, publicKey, adminDecryptionPubkey, toast, t, resetForm, onOpenChange, onCreated])

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
