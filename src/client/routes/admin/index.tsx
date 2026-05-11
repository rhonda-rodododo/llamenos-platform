import { adminNavConfig } from '@/components/admin-shell/admin-nav-config'
import { useAuth } from '@/lib/auth'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'

export const Route = createFileRoute('/admin/')({
  component: AdminIndex,
})

function AdminIndex() {
  const navigate = useNavigate()
  const auth = useAuth()

  useEffect(() => {
    if (auth.isLoading) return

    const canSee = (requiredPermissions: string[], requiredRole?: string): boolean => {
      if (requiredRole && !auth.roles.includes(requiredRole)) return false
      if (requiredPermissions.length === 0) return true
      return requiredPermissions.every((p) => auth.hasPermission(p))
    }

    for (const group of adminNavConfig.groups) {
      if (group.scope === 'platform' && !auth.roles.includes('role-super-admin')) continue
      for (const item of group.items) {
        if (canSee(item.requiredPermissions, item.requiredRole)) {
          void navigate({
            to: '/admin/$section',
            params: { section: item.slug },
            replace: true,
          })
          return
        }
      }
    }
  }, [auth.isLoading, auth.roles, auth.hasPermission, navigate])

  return null
}
