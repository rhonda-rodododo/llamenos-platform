import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '@/lib/toast'
import { useQuery } from '@tanstack/react-query'
import { listUsers, type User } from '@/lib/api'
import {
  useTeams,
  useCreateTeam,
  useDeleteTeam,
  useTeamMembers,
  useAddTeamMembers,
  useRemoveTeamMember,
  useTeamContacts,
  useAssignTeamContacts,
  useUnassignTeamContact,
  type DecryptedTeam,
} from '@/lib/queries/teams'
import { SectionBody } from '@/components/admin-shell/section-layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { UserMultiSelect } from '@/components/user-multi-select'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Trash2, Plus, Users, ChevronDown, ChevronRight, UserPlus, X } from 'lucide-react'

// ---------------------------------------------------------------------------
// Team members panel
// ---------------------------------------------------------------------------

function TeamMembersPanel({ teamId, hubUsers }: { teamId: string; hubUsers: User[] }) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [addingMembers, setAddingMembers] = useState(false)
  const [selectedPubkeys, setSelectedPubkeys] = useState<string[]>([])

  const { data: members = [] } = useTeamMembers(teamId)
  const addMembers = useAddTeamMembers()
  const removeMember = useRemoveTeamMember()

  const currentPubkeys = new Set(members.map(m => m.userPubkey))
  const eligibleUsers = hubUsers.filter(u => !currentPubkeys.has(u.pubkey))

  async function handleAdd() {
    if (selectedPubkeys.length === 0) return
    try {
      await addMembers.mutateAsync({ teamId, pubkeys: selectedPubkeys })
      setSelectedPubkeys([])
      setAddingMembers(false)
      toast(t('teams.membersAdded', { defaultValue: 'Members added' }), 'success')
    } catch {
      toast(t('common.error', { defaultValue: 'Failed to add members' }), 'error')
    }
  }

  async function handleRemove(userPubkey: string) {
    try {
      await removeMember.mutateAsync({ teamId, userPubkey })
      toast(t('teams.memberRemoved', { defaultValue: 'Member removed' }), 'success')
    } catch {
      toast(t('common.error', { defaultValue: 'Failed to remove member' }), 'error')
    }
  }

  return (
    <div className="mt-3 pl-4 border-l-2 border-border space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          {t('teams.members', { defaultValue: 'Members' })} ({members.length})
        </span>
        {!addingMembers && (
          <Button size="sm" variant="ghost" className="h-6 text-xs gap-1" onClick={() => setAddingMembers(true)}>
            <UserPlus className="w-3 h-3" />
            {t('teams.addMembers', { defaultValue: 'Add Members' })}
          </Button>
        )}
      </div>

      {addingMembers && (
        <div className="space-y-2 py-2">
          <UserMultiSelect
            users={eligibleUsers}
            selected={selectedPubkeys}
            onSelectionChange={setSelectedPubkeys}
            placeholder={t('teams.selectMembers', { defaultValue: 'Select members...' })}
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAdd} disabled={addMembers.isPending || selectedPubkeys.length === 0}>
              {t('common.add', { defaultValue: 'Add' })}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setAddingMembers(false); setSelectedPubkeys([]) }}>
              {t('common.cancel', { defaultValue: 'Cancel' })}
            </Button>
          </div>
        </div>
      )}

      {members.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t('teams.noMembers', { defaultValue: 'No members yet' })}</p>
      ) : (
        <ul className="space-y-1">
          {members.map(m => {
            const user = hubUsers.find(u => u.pubkey === m.userPubkey)
            return (
              <li key={m.userPubkey} className="flex items-center justify-between text-xs">
                <span className="truncate text-muted-foreground">
                  {user?.name ?? m.userPubkey.slice(0, 12) + '...'}
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-5 w-5 text-muted-foreground hover:text-destructive"
                  onClick={() => handleRemove(m.userPubkey)}
                  disabled={removeMember.isPending}
                >
                  <X className="w-3 h-3" />
                </Button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Team contacts panel
// ---------------------------------------------------------------------------

function TeamContactsPanel({ teamId }: { teamId: string }) {
  const { t } = useTranslation()
  const { toast } = useToast()

  const { data: assignments = [] } = useTeamContacts(teamId)
  const unassign = useUnassignTeamContact()
  const assign = useAssignTeamContacts()
  const [newContactId, setNewContactId] = useState('')

  async function handleAssign() {
    const id = newContactId.trim()
    if (!id) return
    try {
      await assign.mutateAsync({ teamId, contactIds: [id] })
      setNewContactId('')
      toast(t('teams.contactAssigned', { defaultValue: 'Contact assigned' }), 'success')
    } catch {
      toast(t('common.error', { defaultValue: 'Failed to assign contact' }), 'error')
    }
  }

  async function handleUnassign(contactId: string) {
    try {
      await unassign.mutateAsync({ teamId, contactId })
      toast(t('teams.contactUnassigned', { defaultValue: 'Contact removed' }), 'success')
    } catch {
      toast(t('common.error', { defaultValue: 'Failed to remove contact' }), 'error')
    }
  }

  return (
    <div className="mt-2 pl-4 border-l-2 border-border space-y-2">
      <span className="text-xs font-medium text-muted-foreground">
        {t('teams.contacts', { defaultValue: 'Contacts' })} ({assignments.length})
      </span>
      <div className="flex gap-2">
        <Input
          value={newContactId}
          onChange={e => setNewContactId(e.target.value)}
          placeholder={t('teams.contactId', { defaultValue: 'Contact ID...' })}
          className="h-7 text-xs"
          onKeyDown={e => e.key === 'Enter' && handleAssign()}
        />
        <Button size="sm" className="h-7" onClick={handleAssign} disabled={assign.isPending || !newContactId.trim()}>
          {t('common.add', { defaultValue: 'Add' })}
        </Button>
      </div>
      {assignments.length > 0 && (
        <ul className="space-y-1">
          {assignments.map(a => (
            <li key={a.contactId} className="flex items-center justify-between text-xs">
              <span className="font-mono text-muted-foreground">{a.contactId.slice(0, 12)}...</span>
              <Button
                size="icon"
                variant="ghost"
                className="h-5 w-5 text-muted-foreground hover:text-destructive"
                onClick={() => handleUnassign(a.contactId)}
              >
                <X className="w-3 h-3" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Teams section main component
// ---------------------------------------------------------------------------

export function TeamsSection() {
  const { t } = useTranslation()
  const { toast } = useToast()

  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DecryptedTeam | null>(null)

  const { data: teams = [], isLoading } = useTeams()
  const { data: usersData } = useQuery({ queryKey: ['users'], queryFn: listUsers })
  const hubUsers: User[] = usersData?.users ?? []

  const createTeam = useCreateTeam()
  const deleteTeam = useDeleteTeam()

  async function handleCreate() {
    if (!newName.trim()) return
    try {
      await createTeam.mutateAsync({ name: newName.trim() })
      setNewName('')
      setCreating(false)
      toast(t('common.saved', { defaultValue: 'Team created' }), 'success')
    } catch {
      toast(t('common.error', { defaultValue: 'Failed to create team' }), 'error')
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    try {
      await deleteTeam.mutateAsync(deleteTarget.id)
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
              onChange={e => setNewName(e.target.value)}
              placeholder={t('teams.teamName')}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
            />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleCreate} disabled={createTeam.isPending || !newName.trim()}>
              {createTeam.isPending ? t('common.saving', { defaultValue: 'Saving...' }) : t('common.save', { defaultValue: 'Save' })}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setCreating(false); setNewName('') }}>
              {t('common.cancel', { defaultValue: 'Cancel' })}
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">{t('teams.loading')}</p>
      ) : teams.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('teams.noTeams')}</p>
      ) : (
        <ul className="space-y-2">
          {teams.map((team) => {
            const isExpanded = expandedId === team.id
            return (
              <li key={team.id} className="border rounded-md px-3 py-2">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    className="flex items-center gap-2 flex-1 text-left"
                    onClick={() => setExpandedId(isExpanded ? null : team.id)}
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                    )}
                    <Users className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="text-sm font-medium">{team.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {t('teams.memberCount', { count: team.memberCount })}
                    </span>
                    {team.contactCount > 0 && (
                      <Badge variant="secondary" className="text-[10px]">
                        {t('teams.contactCount', { count: team.contactCount, defaultValue: '{{count}} contacts' })}
                      </Badge>
                    )}
                  </button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive hover:text-destructive shrink-0"
                    onClick={() => setDeleteTarget(team)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>

                {isExpanded && (
                  <div className="mt-2 space-y-3">
                    <TeamMembersPanel teamId={team.id} hubUsers={hubUsers} />
                    <TeamContactsPanel teamId={team.id} />
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {deleteTarget && (
        <ConfirmDialog
          open
          title={t('teams.deleteTeam')}
          description={t('teams.confirmDelete', {
            defaultValue: 'Delete this team? This will remove all member assignments.',
          })}
          confirmLabel={t('common.delete', { defaultValue: 'Delete' })}
          onConfirm={handleDelete}
          onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
        />
      )}
    </SectionBody>
  )
}
