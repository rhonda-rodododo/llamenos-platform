import { adminNavConfig } from '@/components/admin-shell/admin-nav-config'
import { getFirstAccessibleSlug } from '@/components/admin-shell/admin-nav-visibility'
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

    const slug = getFirstAccessibleSlug(adminNavConfig.groups, {
      roles: auth.roles,
      hasPermission: auth.hasPermission,
    })

    if (slug) {
      void navigate({
        to: '/admin/$section',
        params: { section: slug },
        replace: true,
      })
    }
  }, [auth.isLoading, auth.roles, auth.hasPermission, navigate])

  return null
}
