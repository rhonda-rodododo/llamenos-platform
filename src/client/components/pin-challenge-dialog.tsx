import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { PinInput } from '@/components/pin-input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ShieldCheck } from 'lucide-react'

interface PinChallengeDialogProps {
  open: boolean
  error: boolean
  /** Lockout message from Rust-side enforcement (e.g. "Locked out. Try again in 30 seconds"). */
  lockoutMessage?: string | null
  onComplete: (pin: string) => Promise<void>
  onCancel: () => void
}

export function PinChallengeDialog({
  open,
  error,
  lockoutMessage,
  onComplete,
  onCancel,
}: PinChallengeDialogProps) {
  const { t } = useTranslation()
  const [pin, setPin] = useState('')
  const [verifying, setVerifying] = useState(false)

  // Reset PIN when dialog opens or after failed attempt
  useEffect(() => {
    if (open) {
      setPin('')
      setVerifying(false)
    }
  }, [open, error])

  async function handlePinComplete(value: string) {
    setVerifying(true)
    await onComplete(value)
    setVerifying(false)
  }

  const isLockedOut = !!lockoutMessage

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onCancel() }}>
      <DialogContent showCloseButton={false} data-testid="pin-challenge-dialog">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <DialogTitle>{t('pinChallenge.title')}</DialogTitle>
          </div>
          <DialogDescription>
            {t('pinChallenge.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <PinInput
            value={pin}
            onChange={setPin}
            onComplete={handlePinComplete}
            disabled={verifying || isLockedOut}
            error={error}
            autoFocus
          />

          {lockoutMessage && (
            <p role="alert" className="mt-3 text-center text-sm text-destructive" data-testid="pin-challenge-lockout">
              {lockoutMessage}
            </p>
          )}

          {error && !lockoutMessage && (
            <p role="alert" className="mt-3 text-center text-sm text-destructive" data-testid="pin-challenge-error">
              {t('pinChallenge.wrongPin')}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={verifying}>
            {t('common.cancel')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
