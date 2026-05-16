import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { ShieldCheck, RefreshCw } from 'lucide-react'
import { verifyDevice } from '@/lib/queries/devices'
import { useToast } from '@/lib/toast'
import { deriveSas, getDevicePubkeys } from '@/lib/platform'

interface VerifyFingerprintModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  targetDeviceId: string
  targetPubkey: string
  targetDeviceName: string
}

/**
 * SAS 7-emoji verification ceremony modal.
 * Derives SAS emoji indices from admin pubkey, target pubkey, and a random nonce
 * via Rust HKDF-SHA256 (LABEL_SAS_DERIVE) through Tauri IPC.
 * Both parties compare emojis visually to confirm device authenticity.
 */
export function VerifyFingerprintModal({
  open,
  onOpenChange,
  targetDeviceId,
  targetPubkey,
  targetDeviceName,
}: VerifyFingerprintModalProps) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [sasEmojis, setSasEmojis] = useState<string[] | null>(null)
  const [step, setStep] = useState<'display' | 'confirming' | 'done'>('display')

  useEffect(() => {
    if (!open) return
    generateSas()
  }, [open, targetPubkey])

  async function generateSas() {
    const deviceState = await getDevicePubkeys()
    if (!deviceState) {
      toast(t('common.error'), 'error')
      return
    }

    // Generate 32-byte random nonce
    const nonceBytes = new Uint8Array(32)
    crypto.getRandomValues(nonceBytes)
    const nonceHex = Array.from(nonceBytes).map(b => b.toString(16).padStart(2, '0')).join('')

    const result = await deriveSas(deviceState.signingPubkeyHex, targetPubkey, nonceHex)
    setSasEmojis(result.emojis)
  }

  async function confirmMatch() {
    setStep('confirming')
    try {
      const signedAuditEntry = JSON.stringify({
        type: 'device_fingerprint_verified',
        targetDeviceId,
        targetPubkey,
        timestamp: new Date().toISOString(),
      })

      await verifyDevice(targetDeviceId, signedAuditEntry)
      setStep('done')
    } catch {
      toast(t('common.error'), 'error')
      setStep('display')
    }
  }

  function handleClose() {
    setStep('display')
    setSasEmojis(null)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={(open) => {
      if (!open) handleClose()
    }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            {t('admin.devices.verifyTitle', { name: targetDeviceName })}
          </DialogTitle>
          <DialogDescription>
            {t('admin.devices.verifyDescription')}
          </DialogDescription>
        </DialogHeader>

        {step === 'display' && sasEmojis && (
          <div className="space-y-4">
            <div className="flex justify-center gap-3 text-3xl py-4">
              {sasEmojis.map((emoji, i) => (
                <span key={i} role="img" aria-label={`sas-emoji-${i}`}>
                  {emoji}
                </span>
              ))}
            </div>
            <p className="text-sm text-muted-foreground text-center">
              {t('admin.devices.verifyInstruction')}
            </p>
          </div>
        )}

        {step === 'done' && (
          <div className="flex flex-col items-center gap-2 py-4">
            <ShieldCheck className="h-8 w-8 text-green-500" />
            <p className="text-sm font-medium">{t('admin.devices.verifySuccess')}</p>
          </div>
        )}

        <DialogFooter>
          {step === 'display' && (
            <>
              <Button variant="ghost" onClick={generateSas}>
                <RefreshCw className="h-4 w-4 mr-1" />
                {t('admin.devices.newNonce')}
              </Button>
              <Button variant="ghost" onClick={handleClose}>
                {t('admin.devices.noMatch')}
              </Button>
              <Button onClick={confirmMatch}>
                {t('admin.devices.match')}
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
