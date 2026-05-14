import { useAuth } from '@/lib/auth'
import { Outlet, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/admin')({
  component: AdminRoute,
})

function AdminRoute() {
  const auth = useAuth()

  // Auth loading or unauthenticated: the root layout already handles
  // redirects to /login, so return null to avoid rendering children.
  if (auth.isLoading) return null

  // Non-admin users: show nothing. Root layout redirects non-authed
  // users; authed non-admins are blocked here without a Navigate
  // (which causes infinite transition loops with React 19 + TanStack
  // Router code splitting in production builds).
  if (!auth.isAdmin && !auth.roles.includes('role-super-admin')) return null

  return <Outlet />
}
