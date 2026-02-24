import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/lib/auth'
import { useEffect, useState } from 'react'
import {
  listVolunteers,
  createVolunteer,
  updateVolunteer,
  deleteVolunteer,
  listInvites,
  createInvite,
  revokeInvite,
  listRoles,
  type Volunteer,
  type InviteCode,
  type RoleDefinition,
} from '@/lib/api'
import { generateKeyPair } from '@/lib/crypto'
import { useToast } from '@/lib/toast'
import { UserPlus, Shield, ShieldCheck, Trash2, Key, Copy, Coffee, Eye, EyeOff, Mail, X } from 'lucide-react'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { PinChallengeDialog } from '@/components/pin-challenge-dialog'
import { usePinChallenge } from '@/lib/use-pin-challenge'
import { Button } from '@/components/ui/button'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PhoneInput, isValidE164 } from '@/components/phone-input'

export const Route = createFileRoute('/volunteers')({
  component: VolunteersPage,
})

function maskedPhone(phone: string) {
  if (!phone || phone.length < 6) return phone
  return phone.slice(0, 3) + '\u2022'.repeat(phone.length - 5) + phone.slice(-2)
}

function VolunteersPage() {
  const { t } = useTranslation()
  const { isAdmin } = useAuth()
  const { toast } = useToast()
  const [volunteers, setVolunteers] = useState<Volunteer[]>([])
  const [invites, setInvites] = useState<InviteCode[]>([])
  const [roles, setRoles] = useState<RoleDefinition[]>([])
  const [showAddForm, setShowAddForm] = useState(false)
  const [showInviteForm, setShowInviteForm] = useState(false)
  const [generatedNsec, setGeneratedNsec] = useState<string | null>(null)
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      const [volRes, invRes, rolesRes] = await Promise.all([listVolunteers(), listInvites(), listRoles()])
      setVolunteers(volRes.volunteers)
      setInvites(invRes.invites)
      setRoles(rolesRes.roles)
    } catch {
      toast(t('common.error'), 'error')
    } finally {
      setLoading(false)
    }
  }

  if (!isAdmin) {
    return <div className="text-muted-foreground">Access denied</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <UserPlus className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-bold sm:text-2xl">{t('volunteers.title')}</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { setShowInviteForm(true); setInviteLink(null) }}>
            <Mail className="h-4 w-4" />
            {t('volunteers.inviteVolunteer')}
          </Button>
          <Button data-testid="volunteer-add-btn" onClick={() => { setShowAddForm(true); setGeneratedNsec(null) }}>
            <UserPlus className="h-4 w-4" />
            {t('volunteers.addVolunteer')}
          </Button>
        </div>
      </div>

      {/* Generated key warning */}
      {generatedNsec && (
        <Card className="border-yellow-400/50 bg-yellow-50 dark:border-yellow-600/50 dark:bg-yellow-950/10">
          <CardContent className="space-y-3">
            <div className="flex items-start gap-2">
              <Key className="mt-0.5 h-4 w-4 text-yellow-600 dark:text-yellow-400" />
              <div>
                <p className="text-sm font-medium text-yellow-800 dark:text-yellow-300">{t('volunteers.inviteGenerated')}</p>
                <p className="mt-0.5 text-xs text-yellow-600 dark:text-yellow-400/80">{t('volunteers.secretKeyWarning')}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <code data-testid="volunteer-nsec-code" className="flex-1 break-all rounded-md bg-background px-3 py-2 text-xs">{generatedNsec}</code>
              <Button
                variant="outline"
                size="icon"
                onClick={() => { navigator.clipboard.writeText(generatedNsec); toast(t('common.success'), 'success'); setTimeout(() => navigator.clipboard.writeText('').catch(() => {}), 30000) }}
                aria-label={t('a11y.copyToClipboard')}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
            <Button variant="ghost" size="sm" data-testid="dismiss-nsec" onClick={() => setGeneratedNsec(null)}>
              {t('common.close')}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Invite link display */}
      {inviteLink && (
        <Card className="border-green-400/50 bg-green-50 dark:border-green-600/50 dark:bg-green-950/10">
          <CardContent className="space-y-3">
            <div className="flex items-start gap-2">
              <Mail className="mt-0.5 h-4 w-4 text-green-600 dark:text-green-400" />
              <div>
                <p className="text-sm font-medium text-green-800 dark:text-green-300">{t('volunteers.inviteCreated')}</p>
                <p className="mt-0.5 text-xs text-green-600 dark:text-green-400/80">{t('volunteers.inviteLinkLabel')}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 break-all rounded-md bg-background px-3 py-2 text-xs">{inviteLink}</code>
              <Button
                variant="outline"
                size="icon"
                onClick={() => { navigator.clipboard.writeText(inviteLink); toast(t('common.success'), 'success'); setTimeout(() => navigator.clipboard.writeText('').catch(() => {}), 30000) }}
                aria-label={t('a11y.copyToClipboard')}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
            <Button variant="ghost" size="sm" data-testid="dismiss-invite" onClick={() => setInviteLink(null)}>
              {t('common.close')}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Invite form */}
      {showInviteForm && (
        <InviteForm
          roles={roles}
          onCreated={(invite) => {
            setInvites(prev => [...prev, invite])
            setInviteLink(`${window.location.origin}/onboarding?code=${invite.code}`)
            setShowInviteForm(false)
          }}
          onCancel={() => setShowInviteForm(false)}
        />
      )}

      {/* Add volunteer form */}
      {showAddForm && (
        <AddVolunteerForm
          roles={roles}
          onCreated={(vol, nsec) => {
            setVolunteers(prev => [...prev, vol])
            setGeneratedNsec(nsec)
            setShowAddForm(false)
          }}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      {/* Pending invites */}
      {invites.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Mail className="h-4 w-4 text-muted-foreground" />
              {t('volunteers.pendingInvites')}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {invites.map(invite => (
                <div key={invite.code} className="flex items-center justify-between px-4 py-3 sm:px-6">
                  <div>
                    <p className="text-sm font-medium">{invite.name}</p>
                    <p className="text-xs text-muted-foreground">{maskedPhone(invite.phone)}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      try {
                        await revokeInvite(invite.code)
                        setInvites(prev => prev.filter(i => i.code !== invite.code))
                        toast(t('volunteers.inviteRevoked'), 'success')
                      } catch {
                        toast(t('common.error'), 'error')
                      }
                    }}
                    className="text-destructive hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                    {t('volunteers.revokeInvite')}
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Volunteers list */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="divide-y divide-border">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-6 py-4">
                  <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
                  <div className="h-4 w-32 animate-pulse rounded bg-muted" />
                  <div className="h-4 w-28 animate-pulse rounded bg-muted" />
                  <div className="h-5 w-16 animate-pulse rounded-full bg-muted" />
                  <div className="h-5 w-14 animate-pulse rounded-full bg-muted" />
                  <div className="ml-auto h-4 w-24 animate-pulse rounded bg-muted" />
                </div>
              ))}
            </div>
          ) : volunteers.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">{t('common.noData')}</div>
          ) : (
            <div data-testid="volunteer-list" className="divide-y divide-border">
              {volunteers.map(vol => (
                <VolunteerRow
                  key={vol.pubkey}
                  volunteer={vol}
                  roles={roles}
                  onUpdate={(updated) => {
                    setVolunteers(prev => prev.map(v => v.pubkey === updated.pubkey ? updated : v))
                  }}
                  onDelete={() => {
                    setVolunteers(prev => prev.filter(v => v.pubkey !== vol.pubkey))
                  }}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function InviteForm({ roles, onCreated, onCancel }: {
  roles: RoleDefinition[]
  onCreated: (invite: InviteCode) => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [roleId, setRoleId] = useState('role-volunteer')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isValidE164(phone)) {
      toast(t('volunteers.invalidPhone'), 'error')
      return
    }
    setSaving(true)
    try {
      const res = await createInvite({ name, phone, roleIds: [roleId] })
      onCreated(res.invite)
      toast(t('volunteers.inviteCreated'), 'success')
    } catch {
      toast(t('common.error'), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Mail className="h-4 w-4 text-muted-foreground" />
          {t('volunteers.inviteVolunteer')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="invite-name">{t('volunteers.name')}</Label>
              <Input
                id="invite-name"
                value={name}
                onChange={e => setName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-phone">{t('volunteers.phone')}</Label>
              <PhoneInput
                id="invite-phone"
                value={phone}
                onChange={setPhone}
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="invite-role">{t('volunteers.role')}</Label>
            <Select value={roleId} onValueChange={setRoleId}>
              <SelectTrigger id="invite-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {roles.map(role => (
                  <SelectItem key={role.id} value={role.id}>{role.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={saving}>
              {saving ? t('common.loading') : t('volunteers.createInvite')}
            </Button>
            <Button type="button" variant="outline" onClick={onCancel}>
              {t('common.cancel')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function AddVolunteerForm({ roles, onCreated, onCancel }: {
  roles: RoleDefinition[]
  onCreated: (vol: Volunteer, nsec: string) => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [roleId, setRoleId] = useState('role-volunteer')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isValidE164(phone)) {
      toast(t('volunteers.invalidPhone'), 'error')
      return
    }
    setSaving(true)
    try {
      const keyPair = generateKeyPair()
      const res = await createVolunteer({ name, phone, roleIds: [roleId], pubkey: keyPair.publicKey })
      onCreated(res.volunteer, keyPair.nsec)
      toast(t('volunteers.volunteerAdded'), 'success')
    } catch {
      toast(t('common.error'), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <UserPlus className="h-4 w-4 text-muted-foreground" />
          {t('volunteers.addVolunteer')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="vol-name">{t('volunteers.name')}</Label>
              <Input
                id="vol-name"
                value={name}
                onChange={e => setName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vol-phone">{t('volunteers.phone')}</Label>
              <PhoneInput
                id="vol-phone"
                value={phone}
                onChange={setPhone}
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="vol-role">{t('volunteers.role')}</Label>
            <Select value={roleId} onValueChange={setRoleId}>
              <SelectTrigger id="vol-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {roles.map(role => (
                  <SelectItem key={role.id} value={role.id}>{role.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button data-testid="form-save-btn" type="submit" disabled={saving}>
              {saving ? t('common.loading') : t('common.save')}
            </Button>
            <Button data-testid="form-cancel-btn" type="button" variant="outline" onClick={onCancel}>
              {t('common.cancel')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function VolunteerRow({ volunteer, roles, onUpdate, onDelete }: {
  volunteer: Volunteer
  roles: RoleDefinition[]
  onUpdate: (vol: Volunteer) => void
  onDelete: () => void
}) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showPhone, setShowPhone] = useState(false)
  const pinChallenge = usePinChallenge()

  const primaryRoleId = volunteer.roles[0] || 'role-volunteer'
  const primaryRole = roles.find(r => r.id === primaryRoleId)
  const isAdminRole = primaryRoleId === 'role-super-admin' || primaryRoleId === 'role-hub-admin'

  async function changeRole(newRoleId: string) {
    if (newRoleId === primaryRoleId) return
    try {
      const res = await updateVolunteer(volunteer.pubkey, { roles: [newRoleId] })
      onUpdate(res.volunteer)
    } catch {
      toast(t('common.error'), 'error')
    }
  }

  async function toggleActive() {
    try {
      const res = await updateVolunteer(volunteer.pubkey, { active: !volunteer.active })
      onUpdate(res.volunteer)
    } catch {
      toast(t('common.error'), 'error')
    }
  }

  async function handleDelete() {
    try {
      await deleteVolunteer(volunteer.pubkey)
      onDelete()
    } catch {
      toast(t('common.error'), 'error')
    }
  }

  return (
    <div data-testid={`volunteer-row-${volunteer.pubkey.slice(0, 8)}`} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-6">
      <div className="flex items-center gap-3 sm:gap-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
          {volunteer.name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{volunteer.name} <span className="font-mono text-xs text-muted-foreground">({volunteer.pubkey.slice(0, 8)})</span></p>
          {volunteer.phone && (
            <p className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
              {showPhone ? volunteer.phone : maskedPhone(volunteer.phone)}
              <button
                onClick={async () => {
                  if (showPhone) {
                    setShowPhone(false)
                  } else {
                    const ok = await pinChallenge.requirePin()
                    if (ok) setShowPhone(true)
                  }
                }}
                className="text-muted-foreground hover:text-foreground"
                data-testid="toggle-phone-visibility"
              >
                {showPhone ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              </button>
            </p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
        <Badge variant={isAdminRole ? 'default' : 'secondary'}>
          {isAdminRole && <ShieldCheck className="h-3 w-3" />}
          {primaryRole?.name || primaryRoleId}
          {volunteer.roles.length > 1 && (
            <span className="ml-1 text-xs opacity-70">+{volunteer.roles.length - 1}</span>
          )}
        </Badge>
        <button onClick={toggleActive} aria-pressed={volunteer.active}>
          <Badge variant="outline" className={
            volunteer.active
              ? 'border-green-500/50 text-green-700 dark:text-green-400'
              : 'border-red-500/50 text-red-700 dark:text-red-400'
          }>
            {volunteer.active ? t('volunteers.active') : t('volunteers.inactive')}
          </Badge>
        </button>
        {volunteer.onBreak && (
          <Badge variant="outline" className="border-yellow-500/50 text-yellow-700 dark:text-yellow-400">
            <Coffee className="h-3 w-3" />
            {t('dashboard.onBreak')}
          </Badge>
        )}
        <div className="flex items-center gap-1">
          <Select value={primaryRoleId} onValueChange={changeRole}>
            <SelectTrigger className="h-7 w-auto gap-1 border-none bg-transparent px-2 text-xs shadow-none" aria-label={t('volunteers.changeRole')}>
              <Shield className="h-3 w-3" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {roles.map(role => (
                <SelectItem key={role.id} value={role.id}>{role.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button data-testid="volunteer-delete-btn" variant="ghost" size="icon-xs" onClick={() => setShowDeleteConfirm(true)} className="text-destructive hover:text-destructive" aria-label={t('a11y.deleteItem')}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title={t('volunteers.removeVolunteer')}
        description={`${volunteer.name} (${maskedPhone(volunteer.phone)})`}
        confirmLabel={t('common.delete')}
        onConfirm={handleDelete}
      />
      <PinChallengeDialog
        open={pinChallenge.isOpen}
        attempts={pinChallenge.attempts}
        error={pinChallenge.error}
        onComplete={pinChallenge.handleComplete}
        onCancel={pinChallenge.handleCancel}
      />
    </div>
  )
}
