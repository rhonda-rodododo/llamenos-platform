import { useTranslation } from 'react-i18next'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'

interface Role {
  id: string
  name: string
  description: string | null
  permissions: string[]
  isSystem: boolean
}

interface UserRoleAssignmentProps {
  selectedRoleIds: string[]
  onChange: (roleIds: string[]) => void
  roles: Role[]
  loading?: boolean
  disabled?: boolean
}

export function UserRoleAssignment({
  selectedRoleIds,
  onChange,
  roles,
  loading = false,
  disabled = false,
}: UserRoleAssignmentProps) {
  const { t } = useTranslation()

  if (loading) return <div className="animate-pulse text-sm">{t('common.loading')}</div>

  const selectedSet = new Set(selectedRoleIds)

  function toggleRole(roleId: string) {
    if (selectedSet.has(roleId)) {
      onChange(selectedRoleIds.filter(id => id !== roleId))
    } else {
      onChange([...selectedRoleIds, roleId])
    }
  }

  const sorted = [...roles].sort((a, b) => {
    if (a.isSystem !== b.isSystem) return a.isSystem ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  return (
    <div className="space-y-2">
      {sorted.map((role) => (
        <div
          key={role.id}
          className="flex items-start gap-3 p-2 rounded-md hover:bg-muted/50"
        >
          <Checkbox
            id={`role-${role.id}`}
            checked={selectedSet.has(role.id)}
            onCheckedChange={() => toggleRole(role.id)}
            disabled={disabled}
          />
          <div className="flex-1">
            <Label htmlFor={`role-${role.id}`} className="text-sm font-medium cursor-pointer">
              {role.name}
            </Label>
            {role.description && (
              <p className="text-xs text-muted-foreground">{role.description}</p>
            )}
            <Badge variant="outline" className="text-xs mt-1">
              {role.permissions.length === 1 && role.permissions[0] === '*'
                ? t('roles.allPermissions')
                : t('roles.permissionCount', { count: role.permissions.length })}
            </Badge>
          </div>
        </div>
      ))}
    </div>
  )
}
