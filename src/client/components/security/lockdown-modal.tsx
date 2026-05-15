import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { ShieldAlert, AlertTriangle } from 'lucide-react'
import { performLockdown } from '@/lib/queries/devices'
import { useToast } from '@/lib/toast'

interface LockdownModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function LockdownModal({ open, onOpenChange }: LockdownModalProps) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [step, setStep] = useState<'confirm' | 'progress' | 'done'>('confirm')
  const [result, setResult] = useState<{ sessionsTerminated: number; hubIds: string[] } | null>(null)

  async function performLockdownAction() {
    setStep('progress')
    try {
      const res = await performLockdown()
      setResult(res)
      setStep('done')
    } catch {
      toast(t('common.error'), 'error')
      setStep('confirm')
    }
  }

  function handleClose() {
    setStep('confirm')
    setResult(null)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={(open) => {
      if (!open) handleClose()
    }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <ShieldAlert className="h-5 w-5" />
            {t('security.lockdown.title')}
          </DialogTitle>
          <DialogDescription>
            {step === 'confirm' && t('security.lockdown.description')}
            {step === 'progress' && t('security.lockdown.inProgress')}
            {step === 'done' && result && t('security.lockdown.complete', {
              sessions: result.sessionsTerminated,
              hubs: result.hubIds.length,
            })}
          </DialogDescription>
        </DialogHeader>

        {step === 'confirm' && (
          <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 text-sm">
            <AlertTriangle className="h-4 w-4 mt-0.5 text-destructive shrink-0" />
            <span>{t('security.lockdown.warning')}</span>
          </div>
        )}

        <DialogFooter>
          {step === 'confirm' && (
            <>
              <Button variant="ghost" onClick={handleClose}>
                {t('common.cancel')}
              </Button>
              <Button variant="destructive" onClick={performLockdownAction}>
                {t('security.lockdown.confirm')}
              </Button>
            </>
          )}
          {step === 'done' && (
            <Button onClick={handleClose}>
              {t('common.done')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
