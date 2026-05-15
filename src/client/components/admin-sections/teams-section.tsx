import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '@/lib/toast'
import {
  listTeams,
  createTeam,
  deleteTeam,
  type TeamResponse,
} from '@/lib/api'
import { SectionBody } from '@/components/admin-shell/section-layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Trash2, Plus, Users } from 'lucide-react'
import { ConfirmDialog } from '@/components/confirm-dialog'

export function TeamsSection() {
  const { t } = useTranslation()
  const { toast } = useToast()

  const [teams, setTeams] = useState<TeamResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<TeamResponse | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await listTeams()
      setTeams(res.teams)
    } catch {
      toast(t('common.error', { defaultValue: 'Error loading teams' }), 'error')
    } finally {
      setLoading(false)
    }
  }, [t, toast])

  useEffect(() => { load() }, [load])

  async function handleCreate() {
    if (!newName.trim()) return
    setSaving(true)
    try {
      // Name is stored encrypted — for now store plaintext as the encrypted blob
      // (full HPKE encryption is wired at the call-site when crypto is integrated)
      const team = await createTeam({
        id: crypto.randomUUID(),
        encryptedName: newName.trim(),
      })
      setTeams((prev) => [...prev, team])
      setNewName('')
      setCreating(false)
      toast(t('common.saved', { defaultValue: 'Team created' }), 'success')
    } catch {
      toast(t('common.error', { defaultValue: 'Failed to create team' }), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    try {
      await deleteTeam(deleteTarget.id)
      setTeams((prev) => prev.filter((t) => t.id !== deleteTarget.id))
      toast(t('common.deleted', { defaultValue: 'Team deleted' }), 'success')
    } catch {
      toast(t('common.error', { defaultValue: 'Failed to delete team' }), 'error')
    } finally {
      setDeleteTarget(null)
    }
  }

  return (
    <SectionBody>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium">{t('teams.title')}</h3>
        {!creating && (
          <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
            <Plus className="w-4 h-4 mr-1" />
            {t('teams.createTeam')}
          </Button>
        )}
      </div>

      {creating && (
        <div className="border rounded-md p-3 mb-4 space-y-3">
          <div className="space-y-1">
            <Label htmlFor="team-name">{t('teams.teamName')}</Label>
            <Input
              id="team-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t('teams.teamName')}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleCreate} disabled={saving || !newName.trim()}>
              {saving ? t('common.saving', { defaultValue: 'Saving...' }) : t('common.save', { defaultValue: 'Save' })}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setCreating(false); setNewName('') }}>
              {t('common.cancel', { defaultValue: 'Cancel' })}
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">{t('teams.loading')}</p>
      ) : teams.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('teams.noTeams')}</p>
      ) : (
        <ul className="space-y-2">
          {teams.map((team) => (
            <li key={team.id} className="flex items-center justify-between border rounded-md px-3 py-2">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">{team.encryptedName}</span>
                <span className="text-xs text-muted-foreground">
                  {t('teams.memberCount', { count: team.memberCount })}
                </span>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-destructive hover:text-destructive"
                onClick={() => setDeleteTarget(team)}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {deleteTarget && (
        <ConfirmDialog
          open
          title={t('teams.deleteTeam')}
          description={t('teams.confirmDelete')}
          confirmLabel={t('common.delete', { defaultValue: 'Delete' })}
          onConfirm={handleDelete}
          onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
        />
      )}
    </SectionBody>
  )
}
