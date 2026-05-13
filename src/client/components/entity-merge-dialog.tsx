import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '@/lib/toast'
import { mergeEntities, type CaseRecord } from '@/lib/api'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, GitMerge } from 'lucide-react'

interface EntityMergeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  primaryRecord: CaseRecord
  onMerged: () => void
}

export function EntityMergeDialog({
  open,
  onOpenChange,
  primaryRecord,
  onMerged,
}: EntityMergeDialogProps) {
  const { t } = useTranslation()
  const { toast } = useToast()

  const [secondaryId, setSecondaryId] = useState('')
  const [merging, setMerging] = useState(false)

  const handleMerge = async () => {
    if (!secondaryId.trim()) return
    setMerging(true)
    try {
      await mergeEntities({ primaryId: primaryRecord.id, secondaryId: secondaryId.trim() })
      toast(t('cms.mergeEntitySuccess'))
      onMerged()
      onOpenChange(false)
    } catch {
      toast(t('cms.mergeEntityError'), 'error')
    } finally {
      setMerging(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('cms.mergeEntity')}</DialogTitle>
          <DialogDescription>{t('cms.mergeEntityDesc')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-1">
              {t('cms.mergePrimary')}
            </p>
            <div className="rounded border p-2 text-sm font-mono">
              {primaryRecord.id}
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-muted-foreground mb-1">
              {t('cms.mergeSecondaryId')}
            </p>
            <Input
              placeholder={t('cms.mergeSecondaryIdPlaceholder')}
              value={secondaryId}
              onChange={(e) => setSecondaryId(e.target.value)}
            />
          </div>

          <p className="text-xs text-amber-600 dark:text-amber-400">
            {t('cms.mergeEntityWarning')}
          </p>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleMerge}
              disabled={!secondaryId.trim() || merging}
            >
              {merging ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <GitMerge className="mr-2 h-4 w-4" />
              )}
              {t('cms.mergeConfirm')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
