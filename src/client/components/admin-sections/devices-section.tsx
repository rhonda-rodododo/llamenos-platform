import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { SectionBody, SectionDescription } from '@/components/admin-shell/section-layout'
import { Smartphone, Monitor, ShieldCheck, ShieldQuestion } from 'lucide-react'
import { useAdminDeviceOverview } from '@/lib/queries/devices'
import { VerifyFingerprintModal } from '@/components/security/verify-fingerprint-modal'

export function DevicesSection() {
  const { t } = useTranslation()
  const { data, isLoading } = useAdminDeviceOverview()
  const [verifyTarget, setVerifyTarget] = useState<{
    deviceId: string
    targetPubkey: string
    deviceName: string
  } | null>(null)

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
                      {device.ed25519Pubkey && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="ml-auto text-xs"
                          onClick={() => setVerifyTarget({
                            deviceId: device.id,
                            targetPubkey: device.ed25519Pubkey!,
                            deviceName: device.deviceName ?? device.platform,
                          })}
                        >
                          {t('admin.devices.verify')}
                        </Button>
                      )}
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
      </div>
    </SectionBody>
  )
}
