import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Smartphone, Monitor, Pencil, Trash2, Copy, Check } from 'lucide-react'
import { useDevices, renameDevice, revokeDevice } from '@/lib/queries/devices'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/security/')({
  component: DevicesPage,
})

function DevicesPage() {
  const { t } = useTranslation()
  const { data: devices, isLoading, refetch } = useDevices()
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [revokeTarget, setRevokeTarget] = useState<{ id: string; name: string } | null>(null)
  const [revokeLoading, setRevokeLoading] = useState(false)
  const [renameLoading, setRenameLoading] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  if (isLoading) return <div className="animate-pulse">{t('common.loading')}</div>

  function startRename(deviceId: string, currentName: string) {
    setRenamingId(deviceId)
    setRenameValue(currentName)
  }

  async function submitRename(deviceId: string) {
    setRenameLoading(true)
    try {
      await renameDevice(deviceId, renameValue)
      setRenamingId(null)
      refetch()
    } finally {
      setRenameLoading(false)
    }
  }

  async function confirmRevoke() {
    if (!revokeTarget) return
    setRevokeLoading(true)
    try {
      await revokeDevice(revokeTarget.id)
      setRevokeTarget(null)
      refetch()
    } finally {
      setRevokeLoading(false)
    }
  }

  function copyFingerprint(pubkey: string, deviceId: string) {
    navigator.clipboard.writeText(pubkey)
    setCopiedId(deviceId)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const platformIcon = (platform: string) =>
    platform === 'ios' || platform === 'android' ? Smartphone : Monitor

  return (
    <div className="space-y-4" data-testid="security-devices">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t('security.devices.title')}</h2>
        <Badge variant="outline">
          {devices?.length ?? 0} {t('security.devices.limit')}
        </Badge>
      </div>

      <div className="space-y-3">
        {devices?.map((device) => {
          const Icon = platformIcon(device.platform)
          const isRenaming = renamingId === device.id
          const fingerprint = device.ed25519Pubkey
            ? device.ed25519Pubkey.slice(0, 16) + '...' + device.ed25519Pubkey.slice(-8)
            : null

          return (
            <div
              key={device.id}
              className={cn(
                'flex items-start gap-3 p-3 rounded-md border',
                device.isCurrent && 'border-primary/30 bg-primary/5',
              )}
              data-testid={`device-${device.id}`}
            >
              <Icon className="h-5 w-5 mt-0.5 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {isRenaming ? (
                    <div className="flex gap-1">
                      <Input
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && submitRename(device.id)}
                        className="h-7 text-sm"
                        autoFocus
                      />
                      <Button size="sm" variant="ghost" onClick={() => submitRename(device.id)} disabled={renameLoading}>
                        <Check className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <span className="font-medium text-sm truncate">
                        {device.deviceName ?? device.platform}
                      </span>
                      {device.isCurrent && (
                        <Badge variant="secondary" className="text-xs">{t('security.devices.current')}</Badge>
                      )}
                    </>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {device.deviceModel && <span>{device.deviceModel}</span>}
                  {device.osVersion && <span> {device.osVersion}</span>}
                  {device.lastSeenAt && (
                    <span> &middot; {t('security.devices.lastSeen')} {new Date(device.lastSeenAt).toLocaleDateString()}</span>
                  )}
                </div>
                {fingerprint && (
                  <button
                    type="button"
                    className="flex items-center gap-1 text-xs text-muted-foreground mt-1 font-mono hover:text-foreground"
                    onClick={() => copyFingerprint(device.ed25519Pubkey!, device.id)}
                  >
                    {copiedId === device.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    {fingerprint}
                  </button>
                )}
              </div>
              <div className="flex gap-1 shrink-0">
                {!isRenaming && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => startRename(device.id, device.deviceName ?? '')}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                )}
                {!device.isCurrent && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setRevokeTarget({ id: device.id, name: device.deviceName ?? device.platform })}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <ConfirmDialog
        open={!!revokeTarget}
        onOpenChange={() => !revokeLoading && setRevokeTarget(null)}
        title={t('security.devices.revokeTitle')}
        description={revokeTarget ? t('security.devices.revokeDescription', { name: revokeTarget.name }) : ''}
        confirmLabel={t('security.devices.revokeConfirm')}
        variant="destructive"
        onConfirm={confirmRevoke}
      />
    </div>
  )
}

export default DevicesPage
