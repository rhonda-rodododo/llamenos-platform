import { createFileRoute, Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/lib/auth'
import { useEffect, useState, useMemo } from 'react'
import {
  listVolunteers,
  listAuditLog,
  listShifts,
  updateVolunteer,
  type Volunteer,
  type AuditLogEntry,
  type Shift,
} from '@/lib/api'
import { useToast } from '@/lib/toast'
import {
  ArrowLeft,
  ScrollText,
  Clock,
  Shield,
  ShieldCheck,
  Coffee,
  ChevronLeft,
  ChevronRight,
  User,
  Phone,
  Eye,
  EyeOff,
  MessageSquare,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { LANGUAGES } from '@shared/languages'

const MESSAGING_CHANNELS = ['sms', 'whatsapp', 'signal', 'rcs', 'web'] as const

export const Route = createFileRoute('/volunteers_/$pubkey')({
  component: VolunteerProfilePage,
})

const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const

function VolunteerProfilePage() {
  const { t } = useTranslation()
  const { isAdmin } = useAuth()
  const { pubkey } = Route.useParams()
  const { toast } = useToast()
  const [volunteer, setVolunteer] = useState<Volunteer | null>(null)
  const [shifts, setShifts] = useState<Shift[]>([])
  const [auditEntries, setAuditEntries] = useState<AuditLogEntry[]>([])
  const [auditTotal, setAuditTotal] = useState(0)
  const [auditPage, setAuditPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [auditLoading, setAuditLoading] = useState(true)
  const [showPhone, setShowPhone] = useState(false)
  const [savingChannels, setSavingChannels] = useState(false)
  const auditLimit = 20

  // Load volunteer + shifts
  useEffect(() => {
    Promise.all([
      listVolunteers(),
      listShifts(),
    ]).then(([volRes, shiftRes]) => {
      const vol = volRes.volunteers.find(v => v.pubkey === pubkey) || null
      setVolunteer(vol)
      setShifts(shiftRes.shifts)
    }).catch(() => {})
      .finally(() => setLoading(false))
  }, [pubkey])

  // Load audit entries for this volunteer
  useEffect(() => {
    setAuditLoading(true)
    listAuditLog({ page: auditPage, limit: auditLimit, actorPubkey: pubkey })
      .then(r => { setAuditEntries(r.entries); setAuditTotal(r.total) })
      .catch(() => {})
      .finally(() => setAuditLoading(false))
  }, [pubkey, auditPage])

  const assignedShifts = useMemo(
    () => shifts.filter(s => s.volunteerPubkeys.includes(pubkey)),
    [shifts, pubkey],
  )

  if (!isAdmin) {
    return <div className="text-muted-foreground">Access denied</div>
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-6 w-48 animate-pulse rounded bg-muted" />
        <div className="h-40 animate-pulse rounded-lg bg-muted" />
        <div className="h-60 animate-pulse rounded-lg bg-muted" />
      </div>
    )
  }

  if (!volunteer) {
    return (
      <div className="space-y-4">
        <Link to="/volunteers" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          {t('nav.volunteers')}
        </Link>
        <div className="py-8 text-center text-muted-foreground">
          {t('common.noData')}
        </div>
      </div>
    )
  }

  const auditTotalPages = Math.ceil(auditTotal / auditLimit)

  function maskedPhone(phone: string) {
    if (!phone || phone.length < 6) return phone
    return phone.slice(0, 3) + '\u2022'.repeat(phone.length - 5) + phone.slice(-2)
  }

  const langMap = new Map(LANGUAGES.map(l => [l.code, l]))

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link to="/volunteers" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        {t('nav.volunteers')}
      </Link>

      {/* Volunteer Info Card */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xl font-semibold text-primary">
              {volunteer.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 space-y-3">
              <div>
                <h1 className="text-xl font-bold">{volunteer.name}</h1>
                <code className="text-xs text-muted-foreground">{volunteer.pubkey}</code>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant={volunteer.roles.includes('role-super-admin') || volunteer.roles.includes('role-hub-admin') ? 'default' : 'secondary'}>
                  {volunteer.roles.includes('role-super-admin') || volunteer.roles.includes('role-hub-admin') ? (
                    <><ShieldCheck className="h-3 w-3" /> {t('volunteers.roleAdmin')}</>
                  ) : (
                    <><Shield className="h-3 w-3" /> {t('volunteers.roleVolunteer')}</>
                  )}
                </Badge>
                <Badge variant="outline" className={
                  volunteer.active
                    ? 'border-green-500/50 text-green-700 dark:text-green-400'
                    : 'border-red-500/50 text-red-700 dark:text-red-400'
                }>
                  {volunteer.active ? t('volunteers.active') : t('volunteers.inactive')}
                </Badge>
                {volunteer.onBreak && (
                  <Badge variant="outline" className="border-yellow-500/50 text-yellow-700 dark:text-yellow-400">
                    <Coffee className="h-3 w-3" />
                    {t('dashboard.onBreak')}
                  </Badge>
                )}
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5" />
                  <span className="font-mono text-xs">
                    {showPhone ? volunteer.phone : maskedPhone(volunteer.phone)}
                  </span>
                  <button onClick={() => setShowPhone(!showPhone)} className="text-muted-foreground hover:text-foreground">
                    {showPhone ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  </button>
                </span>
                <span className="flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5" />
                  {t('volunteerProfile.joined')} {new Date(volunteer.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Shift Assignments */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4 text-muted-foreground" />
            {t('volunteerProfile.assignedShifts')}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {assignedShifts.length === 0 ? (
            <div className="px-6 pb-6 text-sm text-muted-foreground">
              {t('volunteerProfile.noShifts')}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {assignedShifts.map(shift => (
                <div key={shift.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
                  <span className="text-sm font-medium">{shift.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {shift.startTime} – {shift.endTime}
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {shift.days.sort((a, b) => a - b).map(d => (
                      <Badge key={d} variant="outline" className="text-[10px]">
                        {t(`shifts.days.${DAY_KEYS[d]}`)}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Messaging Channels Configuration */}
      <MessagingChannelsCard
        volunteer={volunteer}
        saving={savingChannels}
        onSave={async (channels, enabled) => {
          setSavingChannels(true)
          try {
            const res = await updateVolunteer(pubkey, {
              supportedMessagingChannels: channels,
              messagingEnabled: enabled,
            })
            setVolunteer(res.volunteer)
            toast(t('volunteerProfile.channelsSaved'), 'success')
          } catch {
            toast(t('common.error'), 'error')
          } finally {
            setSavingChannels(false)
          }
        }}
      />

      {/* Activity / Audit Log */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ScrollText className="h-4 w-4 text-muted-foreground" />
            {t('volunteerProfile.activity')}
            {auditTotal > 0 && (
              <span className="text-xs font-normal text-muted-foreground">({auditTotal})</span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {auditLoading ? (
            <div className="divide-y divide-border">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-6 py-3">
                  <div className="h-4 w-28 animate-pulse rounded bg-muted" />
                  <div className="h-5 w-20 animate-pulse rounded-full bg-muted" />
                  <div className="h-4 w-40 animate-pulse rounded bg-muted" />
                </div>
              ))}
            </div>
          ) : auditEntries.length === 0 ? (
            <div className="px-6 pb-6 text-sm text-muted-foreground">
              {t('volunteerProfile.noActivity')}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {auditEntries.map(entry => (
                <div key={entry.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 sm:px-6">
                  <span className="w-full text-xs text-muted-foreground whitespace-nowrap sm:w-32 sm:shrink-0">
                    {new Date(entry.createdAt).toLocaleString()}
                  </span>
                  <Badge variant="secondary" className="text-[11px]">
                    {t(`auditLog.events.${entry.event}`, { defaultValue: entry.event })}
                  </Badge>
                  <span className="flex-1 truncate text-xs text-muted-foreground">
                    {Object.entries(entry.details || {})
                      .filter(([k]) => !['ip', 'ua', 'country'].includes(k))
                      .map(([k, v]) => `${k}: ${v}`)
                      .join(', ') || '—'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>

        {auditTotalPages > 1 && (
          <div className="flex items-center justify-center gap-2 border-t border-border py-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAuditPage(p => Math.max(1, p - 1))}
              disabled={auditPage === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs text-muted-foreground">{auditPage} / {auditTotalPages}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAuditPage(p => Math.min(auditTotalPages, p + 1))}
              disabled={auditPage === auditTotalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </Card>
    </div>
  )
}

function MessagingChannelsCard({
  volunteer,
  saving,
  onSave,
}: {
  volunteer: Volunteer
  saving: boolean
  onSave: (channels: string[], enabled: boolean) => Promise<void>
}) {
  const { t } = useTranslation()
  const [enabled, setEnabled] = useState(volunteer.messagingEnabled !== false)
  const [channels, setChannels] = useState<string[]>(
    volunteer.supportedMessagingChannels || []
  )
  const [dirty, setDirty] = useState(false)

  const channelLabels: Record<string, string> = {
    sms: t('volunteerProfile.channelSms'),
    whatsapp: t('volunteerProfile.channelWhatsapp'),
    signal: t('volunteerProfile.channelSignal'),
    rcs: t('volunteerProfile.channelRcs'),
    web: t('volunteerProfile.channelWeb'),
  }

  function toggleChannel(ch: string) {
    setChannels(prev => {
      const next = prev.includes(ch)
        ? prev.filter(c => c !== ch)
        : [...prev, ch]
      setDirty(true)
      return next
    })
  }

  function handleEnabledChange(checked: boolean) {
    setEnabled(checked)
    setDirty(true)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          {t('volunteerProfile.messagingChannels')}
        </CardTitle>
        <CardDescription>
          {t('volunteerProfile.messagingChannelsDescription')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Messaging Enabled Toggle */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="messaging-enabled">{t('volunteerProfile.messagingEnabled')}</Label>
            <p className="text-xs text-muted-foreground">
              {t('volunteerProfile.messagingEnabledDescription')}
            </p>
          </div>
          <Switch
            id="messaging-enabled"
            checked={enabled}
            onCheckedChange={handleEnabledChange}
          />
        </div>

        {/* Channel Selection */}
        {enabled && (
          <div className="space-y-3">
            <Label>{t('volunteerProfile.selectChannels')}</Label>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {MESSAGING_CHANNELS.map(ch => (
                <label
                  key={ch}
                  className="flex cursor-pointer items-center gap-2 rounded-md border border-border p-3 hover:bg-muted/50"
                >
                  <Checkbox
                    checked={channels.length === 0 || channels.includes(ch)}
                    onCheckedChange={() => toggleChannel(ch)}
                  />
                  <span className="text-sm">{channelLabels[ch]}</span>
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {channels.length === 0
                ? t('volunteerProfile.allChannels')
                : `${channels.length} ${channels.length === 1 ? 'channel' : 'channels'} selected`}
            </p>
          </div>
        )}

        {/* Save Button */}
        {dirty && (
          <Button
            onClick={() => onSave(channels, enabled)}
            disabled={saving}
          >
            {saving ? t('common.loading') : t('common.save')}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
