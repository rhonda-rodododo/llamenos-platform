import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Lock, Pencil, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { RoleDefinition } from '@protocol/schemas/settings'

interface RoleListProps {
  roles: RoleDefinition[]
  editingId: string | null
  onEdit: (role: RoleDefinition) => void
  onDelete: (role: RoleDefinition) => void
}

export function RoleList({ roles, editingId, onEdit, onDelete }: RoleListProps) {
  const { t } = useTranslation()

  const sorted = [...roles].sort((a, b) => {
    if (a.isSystem && !b.isSystem) return -1
    if (!a.isSystem && b.isSystem) return 1
    if (a.isDefault && !b.isDefault) return -1
    if (!a.isDefault && b.isDefault) return 1
    return (a.name ?? a.slug).localeCompare(b.name ?? b.slug)
  })

  return (
    <div className="space-y-2">
      {sorted.map((role) => (
        <div
          key={role.id}
          data-testid={`role-item-${role.slug}`}
          className={cn(
            'flex items-center justify-between p-3 rounded-md border',
            editingId === role.id && 'border-primary/30 bg-primary/5',
          )}
        >
          <div className="flex items-center gap-2 min-w-0">
            <div className="truncate">
              <span className="font-medium text-sm">{role.name ?? role.slug}</span>
              {role.description && (
                <p className="text-xs text-muted-foreground truncate">{role.description}</p>
              )}
            </div>
            {role.isSystem && (
              <Badge variant="outline" className="gap-1 shrink-0">
                <Lock className="h-3 w-3" /> {t('roles.system', { defaultValue: 'System' })}
              </Badge>
            )}
            {role.isDefault && !role.isSystem && (
              <Badge variant="secondary" className="shrink-0">{t('roles.default', { defaultValue: 'Default' })}</Badge>
            )}
            <Badge variant="outline" className="shrink-0 text-xs">
              {role.permissions.length === 1 && role.permissions[0] === '*'
                ? t('roles.allPermissions', { defaultValue: 'All permissions' })
                : t('roles.permissionCount', { count: role.permissions.length, defaultValue: '{{count}} permissions' })}
            </Badge>
            {'assignedUserCount' in role && role.assignedUserCount !== undefined && (
              <Badge variant="outline" className="shrink-0 text-xs">
                {t('roles.assignedUsers', { count: role.assignedUserCount, defaultValue: '{{count}} users' })}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {!role.isSystem && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  data-testid={`role-edit-${role.slug}`}
                  onClick={() => onEdit(role)}
                  disabled={editingId !== null}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  data-testid={`role-delete-${role.slug}`}
                  onClick={() => onDelete(role)}
                  disabled={editingId !== null || role.isDefault}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
