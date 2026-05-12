import { AdminShell } from '@/components/admin-shell/admin-shell'
import { findNavItem } from '@/components/admin-shell/admin-nav-config'
import { getSectionComponent } from '@/components/admin-sections/registry'
import { createFileRoute, notFound } from '@tanstack/react-router'

export const Route = createFileRoute('/admin/$section')({
  component: AdminSectionPage,
})

function AdminSectionPage() {
  const { section } = Route.useParams()
  const item = findNavItem(section)
  const Component = getSectionComponent(section)

  if (!item || !Component) {
    throw notFound()
  }

  return (
    <AdminShell currentSlug={section} currentLabelKey={item.labelKey}>
      <Component />
    </AdminShell>
  )
}
