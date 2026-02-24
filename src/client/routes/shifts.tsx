import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/lib/auth'
import { useEffect, useState } from 'react'
import {
  listShifts,
  createShift,
  updateShift,
  deleteShift,
  listVolunteers,
  getFallbackGroup,
  setFallbackGroup,
  type Shift,
  type Volunteer,
} from '@/lib/api'
import { useToast } from '@/lib/toast'
import { CalendarPlus, Clock, Users, Pencil, Trash2, LifeBuoy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { VolunteerMultiSelect } from '@/components/volunteer-multi-select'

export const Route = createFileRoute('/shifts')({
  component: ShiftsPage,
})

const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const

function ShiftsPage() {
  const { t } = useTranslation()
  const { isAdmin } = useAuth()
  const { toast } = useToast()
  const [shifts, setShifts] = useState<Shift[]>([])
  const [volunteers, setVolunteers] = useState<Volunteer[]>([])
  const [fallback, setFallback] = useState<string[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editingShift, setEditingShift] = useState<Shift | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      listShifts().then(r => setShifts(r.shifts)),
      listVolunteers().then(r => setVolunteers(r.volunteers)),
      getFallbackGroup().then(r => setFallback(r.volunteers)),
    ]).catch(() => toast(t('common.error'), 'error'))
      .finally(() => setLoading(false))
  }, [])

  if (!isAdmin) {
    return <div className="text-muted-foreground">Access denied</div>
  }

  async function handleSaveFallback(selected: string[]) {
    try {
      await setFallbackGroup(selected)
      setFallback(selected)
    } catch {
      toast(t('common.error'), 'error')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Clock className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-bold sm:text-2xl">{t('shifts.title')}</h1>
        </div>
        <Button data-testid="shift-create-btn" onClick={() => { setShowForm(true); setEditingShift(null) }}>
          <CalendarPlus className="h-4 w-4" />
          {t('shifts.createShift')}
        </Button>
      </div>

      {(showForm || editingShift) && (
        <ShiftForm
          shift={editingShift}
          volunteers={volunteers}
          onSave={async (data) => {
            try {
              if (editingShift) {
                const res = await updateShift(editingShift.id, data)
                setShifts(prev => prev.map(s => s.id === editingShift.id ? res.shift : s))
              } else {
                const res = await createShift(data as Omit<Shift, 'id'>)
                setShifts(prev => [...prev, res.shift])
              }
              setShowForm(false)
              setEditingShift(null)
              toast(t('common.success'), 'success')
            } catch {
              toast(t('common.error'), 'error')
            }
          }}
          onCancel={() => { setShowForm(false); setEditingShift(null) }}
        />
      )}

      {/* Shifts list */}
      <div className="space-y-3">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="space-y-2">
                  <div className="h-5 w-40 animate-pulse rounded bg-muted" />
                  <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                  <div className="flex gap-1">
                    {Array.from({ length: 5 }).map((_, j) => (
                      <div key={j} className="h-5 w-12 animate-pulse rounded bg-muted" />
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : shifts.length === 0 ? (
          <Card>
            <CardContent>
              <div className="py-8 text-center text-muted-foreground">
                <Clock className="mx-auto mb-2 h-8 w-8 opacity-40" />
                {t('shifts.noShifts')}
              </div>
            </CardContent>
          </Card>
        ) : (
          shifts.map(shift => (
            <Card key={shift.id} data-testid={`shift-card-${shift.id}`}>
              <CardContent>
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-medium">{shift.name}</h3>
                    <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" />
                      {shift.startTime} - {shift.endTime}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {shift.days.map(d => (
                        <Badge key={d} variant="secondary">
                          {t(`shifts.days.${DAY_KEYS[d]}`)}
                        </Badge>
                      ))}
                    </div>
                    <p data-testid="shift-volunteer-count" className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Users className="h-3 w-3" />
                      {shift.volunteerPubkeys.length} {t('shifts.volunteers').toLowerCase()}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button data-testid="shift-edit-btn" variant="ghost" size="icon-xs" onClick={() => setEditingShift(shift)} aria-label={t('a11y.editItem')}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      data-testid="shift-delete-btn"
                      variant="ghost"
                      size="icon-xs"
                      className="text-destructive hover:text-destructive"
                      aria-label={t('a11y.deleteItem')}
                      onClick={async () => {
                        try {
                          await deleteShift(shift.id)
                          setShifts(prev => prev.filter(s => s.id !== shift.id))
                        } catch {
                          toast(t('common.error'), 'error')
                        }
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Fallback group */}
      <Card data-testid="fallback-group-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <LifeBuoy className="h-4 w-4 text-muted-foreground" />
            {t('shifts.fallbackGroup')}
          </CardTitle>
          <CardDescription>{t('shifts.fallbackDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <VolunteerMultiSelect
            volunteers={volunteers.filter(v => v.active)}
            selected={fallback}
            onSelectionChange={handleSaveFallback}
          />
        </CardContent>
      </Card>
    </div>
  )
}

function ShiftForm({ shift, volunteers, onSave, onCancel }: {
  shift: Shift | null
  volunteers: Volunteer[]
  onSave: (data: Partial<Shift>) => Promise<void>
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const [name, setName] = useState(shift?.name || '')
  const [startTime, setStartTime] = useState(shift?.startTime || '09:00')
  const [endTime, setEndTime] = useState(shift?.endTime || '17:00')
  const [days, setDays] = useState<number[]>(shift?.days || [1, 2, 3, 4, 5])
  const [selectedVolunteers, setSelectedVolunteers] = useState<string[]>(shift?.volunteerPubkeys || [])
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await onSave({ name, startTime, endTime, days, volunteerPubkeys: selectedVolunteers })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarPlus className="h-4 w-4 text-muted-foreground" />
          {shift ? t('shifts.editShift') : t('shifts.createShift')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form data-testid="shift-form" onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="shift-name">{t('shifts.shiftName')}</Label>
            <Input
              id="shift-name"
              data-testid="shift-name-input"
              value={name}
              onChange={e => setName(e.target.value)}
              required
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="start-time">{t('shifts.startTime')}</Label>
              <Input
                id="start-time"
                data-testid="shift-start-time"
                type="time"
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end-time">{t('shifts.endTime')}</Label>
              <Input
                id="end-time"
                data-testid="shift-end-time"
                type="time"
                value={endTime}
                onChange={e => setEndTime(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t('shifts.recurring')}</Label>
            <div className="flex flex-wrap gap-2">
              {DAY_KEYS.map((day, i) => (
                <button
                  key={i}
                  type="button"
                  aria-pressed={days.includes(i)}
                  onClick={() => setDays(prev => prev.includes(i) ? prev.filter(d => d !== i) : [...prev, i])}
                >
                  <Badge variant={days.includes(i) ? 'default' : 'outline'}>
                    {t(`shifts.days.${day}`)}
                  </Badge>
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t('shifts.assignVolunteers')}</Label>
            <VolunteerMultiSelect
              volunteers={volunteers.filter(v => v.active)}
              selected={selectedVolunteers}
              onSelectionChange={setSelectedVolunteers}
              placeholder={t('shifts.searchVolunteers')}
            />
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
