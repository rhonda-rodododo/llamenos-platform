import { createFileRoute, Navigate } from '@tanstack/react-router'

export const Route = createFileRoute('/admin/case-management')({
  component: AdminCaseManagementRedirect,
})

function AdminCaseManagementRedirect() {
  return <Navigate to="/admin/health" replace />
}
