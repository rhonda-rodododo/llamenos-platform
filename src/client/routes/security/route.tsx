import { Outlet, Link, useMatchRoute, createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { Smartphone, Key, Shield, History } from 'lucide-react'

const tabs = [
  { path: '/security', labelKey: 'security.tabs.devices', icon: Smartphone },
  { path: '/security/sessions', labelKey: 'security.tabs.sessions', icon: Key },
  { path: '/security/passkeys', labelKey: 'security.tabs.passkeys', icon: Shield },
  { path: '/security/history', labelKey: 'security.tabs.history', icon: History },
] as const

export const Route = createFileRoute('/security')({
  component: SecurityLayout,
})

function SecurityLayout() {
  const { t } = useTranslation()
  const matchRoute = useMatchRoute()

  return (
    <div className="flex flex-col h-full">
      <div className="border-b px-4">
        <nav className="flex gap-1" role="tablist">
          {tabs.map(({ path, labelKey, icon: Icon }) => {
            const isActive = matchRoute({ to: path, fuzzy: path === '/security' ? undefined : true })
            return (
              <Link
                key={path}
                to={path}
                role="tab"
                aria-selected={!!isActive}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 text-sm font-medium border-b-2 transition-colors',
                  isActive
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="h-4 w-4" />
                {t(labelKey)}
              </Link>
            )
          })}
        </nav>
      </div>
      <div className="flex-1 overflow-auto p-4">
        <Outlet />
      </div>
    </div>
  )
}
