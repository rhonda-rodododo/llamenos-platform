import { useAuth } from '@/lib/auth'
import { Navigate, Outlet, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/admin')({
  component: AdminRoute,
})

function AdminRoute() {
  const auth = useAuth()

  if (auth.isLoading) return null
  if (!auth.isAdmin && !auth.roles.includes('role-super-admin')) {
    return <Navigate to="/" />
  }

  return <Outlet />
}
