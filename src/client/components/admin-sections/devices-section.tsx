import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { SectionBody, SectionDescription } from '@/components/admin-shell/section-layout'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Smartphone, Monitor, ShieldCheck, ShieldQuestion, Loader2 } from 'lucide-react'
import { useAdminDeviceOverview } from '@/lib/queries/devices'
import { VerifyFingerprintModal } from '@/components/security/verify-fingerprint-modal'
import { remoteWipeDevice } from '@/lib/api'
import { useToast } from '@/lib/toast'

export function DevicesSection() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const { data, isLoading, refetch } = useAdminDeviceOverview()
  const [verifyTarget, setVerifyTarget] = useState<{
    deviceId: string
    targetPubkey: string
    deviceName: string
  } | null>(null)
  const [wipeTarget, setWipeTarget] = useState<{
    userPubkey: string
    devicePubkey: string
    deviceName: string
  } | null>(null)
  const [wiping, setWiping] = useState(false)

  async function handleConfirmWipe() {
    if (!wipeTarget) return
    setWiping(true)
    try {
      await remoteWipeDevice(wipeTarget.userPubkey, wipeTarget.devicePubkey)
      toast(t('erasure.admin.wipeSuccess'), 'success')
      setWipeTarget(null)
      refetch()
    } catch {
      toast(t('common.error'), 'error')
    } finally {
      setWiping(false)
    }
  }

  if (isLoading) return <div className="animate-pulse">{t('common.loading')}</div>

  return (
    <SectionBody>
      <SectionDescription>{t('adminNav.items.devices')}</SectionDescription>
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">{t('admin.devices.title')}</h3>

        <div className="space-y-3">
          {data?.entries.map((entry) => (
            <div key={entry.userPubkey} className="border rounded-md p-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-medium text-sm">{entry.displayName ?? entry.userPubkey.slice(0, 16)}</span>
                  <Badge variant="outline" className="ml-2 text-xs">
                    {entry.deviceCount} {t('admin.devices.devices')}
                  </Badge>
                </div>
                <Badge variant={entry.verified ? 'default' : 'secondary'} className="gap-1">
                  {entry.verified ? <ShieldCheck className="h-3 w-3" /> : <ShieldQuestion className="h-3 w-3" />}
                  {entry.verified ? t('admin.devices.verified') : t('admin.devices.unverified')}
                </Badge>
              </div>

              <div className="mt-2 space-y-1">
                {entry.devices.map((device) => {
                  const Icon = device.platform === 'ios' || device.platform === 'android'
                    ? Smartphone : Monitor
                  return (
                    <div key={device.id} className="flex items-center gap-2 text-sm pl-2">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <span>{device.deviceName ?? device.platform}</span>
                      {device.deviceModel && (
                        <span className="text-xs text-muted-foreground">{device.deviceModel}</span>
                      )}
                      <div className="ml-auto flex gap-1">
                        {device.ed25519Pubkey && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-xs"
                            onClick={() => setVerifyTarget({
                              deviceId: device.id,
                              targetPubkey: device.ed25519Pubkey!,
                              deviceName: device.deviceName ?? device.platform,
                            })}
                          >
                            {t('admin.devices.verify')}
                          </Button>
                        )}
                        {device.ed25519Pubkey && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-xs text-destructive hover:text-destructive"
                            data-testid={`wipe-device-${device.id}`}
                            onClick={() => setWipeTarget({
                              userPubkey: entry.userPubkey,
                              devicePubkey: device.ed25519Pubkey!,
                              deviceName: device.deviceName ?? device.platform,
                            })}
                          >
                            {t('erasure.admin.remoteWipe')}
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {verifyTarget && (
          <VerifyFingerprintModal
            open={!!verifyTarget}
            onOpenChange={() => setVerifyTarget(null)}
            targetDeviceId={verifyTarget.deviceId}
            targetPubkey={verifyTarget.targetPubkey}
            targetDeviceName={verifyTarget.deviceName}
          />
        )}

        <Dialog open={!!wipeTarget} onOpenChange={() => setWipeTarget(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('erasure.admin.wipeDialogTitle')}</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              {t('erasure.admin.wipeDialogWarning')}
            </p>
            {wipeTarget && (
              <p className="text-sm font-medium">{wipeTarget.deviceName}</p>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setWipeTarget(null)}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="destructive"
                data-testid="wipe-confirm-btn"
                onClick={handleConfirmWipe}
                disabled={wiping}
              >
                {wiping && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('erasure.admin.confirmWipe')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </SectionBody>
  )
}
