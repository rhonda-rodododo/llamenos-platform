import { createFileRoute, Navigate } from '@tanstack/react-router'

export const Route = createFileRoute('/admin/hubs')({
  component: AdminHubsRedirect,
})

function AdminHubsRedirect() {
  return <Navigate to="/admin/hubs" replace />
}
