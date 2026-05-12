import { createFileRoute, Navigate } from '@tanstack/react-router'

export const Route = createFileRoute('/admin/firehose-redirect')({
  component: AdminFirehoseRedirect,
})

function AdminFirehoseRedirect() {
  return <Navigate to="/admin/firehose" replace />
}
