import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/utils'
import { Link, useRouterState } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { adminNavConfig } from './admin-nav-config'
import type { AdminNavGroup } from './admin-nav-config.types'
import { canSeeItem, getVisibleGroups } from './admin-nav-visibility'

interface Props {
  onNavigate?: () => void
}

export function AdminSidebar({ onNavigate }: Props) {
  const { t } = useTranslation()
  const auth = useAuth()
  const { location } = useRouterState()
  const activeSlug = location.pathname.replace(/^\/admin\/?/, '') || ''
  const authCtx = { roles: auth.roles, hasPermission: auth.hasPermission }

  const visibleGroups = getVisibleGroups(adminNavConfig.groups, authCtx)
  const thisHubGroups = visibleGroups.filter((g) => g.scope === 'this-hub')
  const platformGroups = visibleGroups.filter((g) => g.scope === 'platform')

  function renderGroup(group: AdminNavGroup) {
    return (
      <div key={group.groupSlug} className="space-y-0.5">
        <div
          data-testid={`admin-sidebar-group-${group.groupSlug}`}
          className="px-3 pt-5 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-sidebar-foreground/50"
        >
          {t(group.labelKey)}
        </div>
        {group.items.filter((item) => canSeeItem(item, authCtx)).map((item) => {
          const active = activeSlug === item.slug
          return (
            <Link
              key={item.slug}
              to="/admin/$section"
              params={{ section: item.slug }}
              data-testid={item.testid}
              onClick={onNavigate}
              className={cn(
                'relative block rounded-md px-3 py-1.5 text-[13px] leading-6 transition-colors',
                active
                  ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground before:absolute before:inset-y-1 before:left-0 before:w-[3px] before:rounded-r before:bg-sidebar-primary'
                  : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground'
              )}
            >
              {t(item.labelKey)}
            </Link>
          )
        })}
      </div>
    )
  }

  return (
    <nav
      data-testid="admin-sidebar"
      className="flex h-full flex-col gap-1 overflow-y-auto bg-sidebar px-3 py-5 text-sidebar-foreground"
    >
      {thisHubGroups.length > 0 && (
        <div data-testid="admin-sidebar-scope-this-hub" className="space-y-0.5">
          <div className="px-3 pb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-sidebar-foreground/40">
            {t('adminNav.scopes.thisHub')}
          </div>
          {thisHubGroups.map(renderGroup)}
        </div>
      )}
      {platformGroups.length > 0 && (
        <div
          data-testid="admin-sidebar-scope-platform"
          className="mt-6 space-y-0.5 border-t border-sidebar-border/60 pt-4"
        >
          <div className="px-3 pb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-sidebar-foreground/40">
            {t('adminNav.scopes.platform')}
          </div>
          {platformGroups.map(renderGroup)}
        </div>
      )}
    </nav>
  )
}
