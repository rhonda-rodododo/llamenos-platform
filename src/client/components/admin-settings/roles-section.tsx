import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '@/lib/toast'
import {
  listRoles,
  createRole,
  updateRole,
  deleteRole,
  getPermissionsCatalog,
  type RoleDefinition,
} from '@/lib/api'
import { SettingsSection } from '@/components/settings-section'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  ShieldCheck,
  Lock,
  Pencil,
  Trash2,
  Plus,
  Save,
  X,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  expanded: boolean
  onToggle: (open: boolean) => void
  statusSummary?: string
}

interface PermissionCatalog {
  permissions: Record<string, string>
  byDomain: Record<string, { key: string; label: string }[]>
}

interface RoleFormData {
  name: string
  slug: string
  description: string
  permissions: string[]
}

export function RolesSection({ expanded, onToggle, statusSummary }: Props) {
  const { t } = useTranslation()
  const { toast } = useToast()

  const [roles, setRoles] = useState<RoleDefinition[]>([])
  const [catalog, setCatalog] = useState<PermissionCatalog | null>(null)
  const [loading, setLoading] = useState(true)

  // Editing state: role ID being edited, or 'new' for create mode
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<RoleFormData>({ name: '', slug: '', description: '', permissions: [] })
  const [saving, setSaving] = useState(false)

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<RoleDefinition | null>(null)

  // Expanded permission domains in the editor
  const [expandedDomains, setExpandedDomains] = useState<Set<string>>(new Set())

  const loadData = useCallback(async () => {
    try {
      const [rolesRes, catalogRes] = await Promise.all([
        listRoles(),
        getPermissionsCatalog(),
      ])
      setRoles(rolesRes.roles)
      setCatalog(catalogRes)
    } catch {
      toast(t('common.error', { defaultValue: 'Error' }), 'error')
    } finally {
      setLoading(false)
    }
  }, [t, toast])

  useEffect(() => {
    loadData()
  }, [loadData])

  function startCreate() {
    setEditingId('new')
    setForm({ name: '', slug: '', description: '', permissions: [] })
    setExpandedDomains(new Set())
  }

  function startEdit(role: RoleDefinition) {
    setEditingId(role.id)
    setForm({
      name: role.name,
      slug: role.slug,
      description: role.description,
      permissions: [...role.permissions],
    })
    // Expand domains that have selected permissions
    if (catalog) {
      const domainsWithSelections = new Set<string>()
      for (const [domain, perms] of Object.entries(catalog.byDomain)) {
        if (perms.some(p => role.permissions.includes(p.key))) {
          domainsWithSelections.add(domain)
        }
      }
      setExpandedDomains(domainsWithSelections)
    }
  }

  function cancelEdit() {
    setEditingId(null)
    setForm({ name: '', slug: '', description: '', permissions: [] })
    setExpandedDomains(new Set())
  }

  function togglePermission(key: string) {
    setForm(prev => ({
      ...prev,
      permissions: prev.permissions.includes(key)
        ? prev.permissions.filter(p => p !== key)
        : [...prev.permissions, key],
    }))
  }

  function toggleDomainAll(domain: string) {
    if (!catalog) return
    const domainPerms = catalog.byDomain[domain]
    if (!domainPerms) return
    const domainKeys = domainPerms.map(p => p.key)
    const allSelected = domainKeys.every(k => form.permissions.includes(k))

    setForm(prev => {
      if (allSelected) {
        return { ...prev, permissions: prev.permissions.filter(p => !domainKeys.includes(p)) }
      } else {
        const existing = new Set(prev.permissions)
        domainKeys.forEach(k => existing.add(k))
        return { ...prev, permissions: Array.from(existing) }
      }
    })
  }

  function toggleDomainExpanded(domain: string) {
    setExpandedDomains(prev => {
      const next = new Set(prev)
      if (next.has(domain)) next.delete(domain)
      else next.add(domain)
      return next
    })
  }

  function autoSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50)
  }

  async function handleSave() {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      if (editingId === 'new') {
        const slug = form.slug.trim() || autoSlug(form.name)
        const res = await createRole({
          name: form.name.trim(),
          slug,
          description: form.description.trim(),
          permissions: form.permissions,
        })
        setRoles(prev => [...prev, res.role])
        toast(t('roles.created', { defaultValue: 'Role created' }), 'success')
      } else if (editingId) {
        const res = await updateRole(editingId, {
          name: form.name.trim(),
          description: form.description.trim(),
          permissions: form.permissions,
        })
        setRoles(prev => prev.map(r => r.id === editingId ? res.role : r))
        toast(t('roles.updated', { defaultValue: 'Role updated' }), 'success')
      }
      cancelEdit()
    } catch {
      toast(t('common.error', { defaultValue: 'Error' }), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    try {
      await deleteRole(deleteTarget.id)
      setRoles(prev => prev.filter(r => r.id !== deleteTarget.id))
      toast(t('roles.deleted', { defaultValue: 'Role deleted' }), 'success')
      if (editingId === deleteTarget.id) cancelEdit()
    } catch {
      toast(t('common.error', { defaultValue: 'Error' }), 'error')
    }
  }

  function getDomainSelectionState(domain: string): 'all' | 'some' | 'none' {
    if (!catalog) return 'none'
    const domainPerms = catalog.byDomain[domain]
    if (!domainPerms?.length) return 'none'
    const domainKeys = domainPerms.map(p => p.key)
    const selectedCount = domainKeys.filter(k => form.permissions.includes(k)).length
    if (selectedCount === 0) return 'none'
    if (selectedCount === domainKeys.length) return 'all'
    return 'some'
  }

  function formatDomainName(domain: string): string {
    return domain.charAt(0).toUpperCase() + domain.slice(1).replace(/-/g, ' ')
  }

  const canEdit = (role: RoleDefinition) => !role.isSystem
  const canDelete = (role: RoleDefinition) => !role.isSystem && !role.isDefault

  if (loading) return null

  return (
    <SettingsSection
      id="roles"
      title={t('roles.title', { defaultValue: 'Roles & Permissions' })}
      description={t('roles.description', { defaultValue: 'Define roles and assign permissions to control access across your hotline.' })}
      icon={<ShieldCheck className="h-5 w-5 text-muted-foreground" />}
      expanded={expanded}
      onToggle={onToggle}
      basePath="/admin/settings"
      statusSummary={statusSummary}
    >
      {/* Role list */}
      <div className="space-y-2">
        {roles.map(role => (
          <div
            key={role.id}
            className={cn(
              'flex items-center gap-3 rounded-lg border border-border px-4 py-3 transition-colors',
              editingId === role.id && 'border-primary/30 bg-primary/5'
            )}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium truncate">{role.name}</span>
                {role.isSystem && (
                  <Badge variant="secondary" className="text-[10px] gap-1">
                    <Lock className="h-2.5 w-2.5" />
                    {t('roles.system', { defaultValue: 'System' })}
                  </Badge>
                )}
                {role.isDefault && !role.isSystem && (
                  <Badge variant="outline" className="text-[10px]">
                    {t('roles.default', { defaultValue: 'Default' })}
                  </Badge>
                )}
              </div>
              {role.description && (
                <p className="text-xs text-muted-foreground mt-0.5 truncate">{role.description}</p>
              )}
              <p className="text-xs text-muted-foreground mt-0.5">
                {role.permissions.length} {t('roles.permissionCount', { defaultValue: 'permissions' })}
              </p>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {canEdit(role) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => startEdit(role)}
                  disabled={editingId !== null}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  <span className="sr-only">{t('common.edit', { defaultValue: 'Edit' })}</span>
                </Button>
              )}
              {canDelete(role) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDeleteTarget(role)}
                  disabled={editingId !== null}
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  <span className="sr-only">{t('common.delete', { defaultValue: 'Delete' })}</span>
                </Button>
              )}
              {role.isSystem && (
                <span className="text-xs text-muted-foreground px-2">
                  {t('roles.locked', { defaultValue: 'Locked' })}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Edit / Create form */}
      {editingId !== null && catalog && (
        <div className="space-y-4 rounded-lg border border-primary/30 bg-primary/5 p-4">
          <h4 className="text-sm font-medium">
            {editingId === 'new'
              ? t('roles.createRole', { defaultValue: 'Create Role' })
              : t('roles.editRole', { defaultValue: 'Edit Role' })}
          </h4>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>{t('roles.name', { defaultValue: 'Name' })}</Label>
              <Input
                value={form.name}
                onChange={e => {
                  const name = e.target.value
                  setForm(prev => ({
                    ...prev,
                    name,
                    ...(editingId === 'new' ? { slug: autoSlug(name) } : {}),
                  }))
                }}
                placeholder={t('roles.namePlaceholder', { defaultValue: 'e.g. Team Lead' })}
                maxLength={50}
              />
            </div>
            {editingId === 'new' && (
              <div className="space-y-1">
                <Label>{t('roles.slug', { defaultValue: 'Slug' })}</Label>
                <Input
                  value={form.slug}
                  onChange={e => setForm(prev => ({ ...prev, slug: e.target.value }))}
                  placeholder={t('roles.slugPlaceholder', { defaultValue: 'e.g. team-lead' })}
                  maxLength={50}
                />
              </div>
            )}
          </div>

          <div className="space-y-1">
            <Label>{t('roles.descriptionLabel', { defaultValue: 'Description' })}</Label>
            <Textarea
              value={form.description}
              onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
              placeholder={t('roles.descriptionPlaceholder', { defaultValue: 'Brief description of this role...' })}
              rows={2}
              maxLength={200}
            />
          </div>

          {/* Permissions by domain */}
          <div className="space-y-1">
            <Label>{t('roles.permissions', { defaultValue: 'Permissions' })}</Label>
            <p className="text-xs text-muted-foreground">
              {form.permissions.length} {t('roles.selected', { defaultValue: 'selected' })}
            </p>
          </div>

          <div className="space-y-1">
            {Object.entries(catalog.byDomain).map(([domain, perms]) => {
              const domainState = getDomainSelectionState(domain)
              const isExpanded = expandedDomains.has(domain)

              return (
                <div key={domain} className="rounded-md border border-border">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/50 transition-colors"
                    onClick={() => toggleDomainExpanded(domain)}
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    )}
                    <input
                      type="checkbox"
                      checked={domainState === 'all'}
                      ref={el => {
                        if (el) el.indeterminate = domainState === 'some'
                      }}
                      onChange={(e) => {
                        e.stopPropagation()
                        toggleDomainAll(domain)
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="h-4 w-4 rounded border-input accent-primary shrink-0"
                    />
                    <span className="text-sm font-medium flex-1">{formatDomainName(domain)}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {perms.filter(p => form.permissions.includes(p.key)).length}/{perms.length}
                    </Badge>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-border px-3 py-2 space-y-1">
                      {perms.map(perm => (
                        <label
                          key={perm.key}
                          className="flex items-center gap-2 rounded px-2 py-1 hover:bg-muted/30 cursor-pointer transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={form.permissions.includes(perm.key)}
                            onChange={() => togglePermission(perm.key)}
                            className="h-4 w-4 rounded border-input accent-primary shrink-0"
                          />
                          <span className="text-sm">{perm.label}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div className="flex gap-2">
            <Button
              disabled={saving || !form.name.trim()}
              onClick={handleSave}
            >
              <Save className="h-4 w-4" />
              {saving
                ? t('common.loading', { defaultValue: 'Loading...' })
                : t('common.save', { defaultValue: 'Save' })}
            </Button>
            <Button variant="outline" onClick={cancelEdit}>
              <X className="h-4 w-4" />
              {t('common.cancel', { defaultValue: 'Cancel' })}
            </Button>
          </div>
        </div>
      )}

      {/* Create button (shown when not editing) */}
      {editingId === null && (
        <Button variant="outline" onClick={startCreate}>
          <Plus className="h-4 w-4" />
          {t('roles.createRole', { defaultValue: 'Create Role' })}
        </Button>
      )}

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
        title={t('roles.deleteTitle', { defaultValue: 'Delete Role' })}
        description={
          deleteTarget
            ? t('roles.deleteConfirm', {
                defaultValue: `Are you sure you want to delete "${deleteTarget.name}"? This action cannot be undone. Volunteers assigned this role will lose its permissions.`,
                name: deleteTarget.name,
              })
            : ''
        }
        variant="destructive"
        onConfirm={handleDelete}
      />
    </SettingsSection>
  )
}
