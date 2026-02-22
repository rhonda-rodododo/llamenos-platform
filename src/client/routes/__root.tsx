import { createRootRoute, Outlet, Link, useNavigate, useLocation } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/lib/auth'
import { useConfig, useHasMessaging } from '@/lib/config'
import { useTheme } from '@/lib/theme'
import { useEffect, useState, useCallback, type ReactNode } from 'react'
import { connectWebSocket, disconnectWebSocket } from '@/lib/ws'
import { useCalls, useShiftStatus } from '@/lib/hooks'
import { CommandPalette, triggerCommandPalette } from '@/components/command-palette'
import { KeyboardShortcutsDialog } from '@/components/keyboard-shortcuts-dialog'
import { NoteSheet } from '@/components/note-sheet'
import { useKeyboardShortcuts } from '@/lib/use-keyboard-shortcuts'
import { LanguageSelect } from '@/components/language-select'
import { LogoMark } from '@/components/logo-mark'
import { DemoBanner } from '@/components/demo-banner'
import {
  LayoutDashboard,
  StickyNote,
  Clock,
  Users,
  ShieldBan,
  PhoneIncoming,
  MessageSquare,
  ScrollText,
  Settings,
  LogOut,
  FileText,

  PhoneCall,
  Sun,
  Moon,
  Monitor,
  Menu,
  X,
  Search,
  HelpCircle,
} from 'lucide-react'

export const Route = createRootRoute({
  component: RootLayout,
})

function RootLayout() {
  const { t } = useTranslation()
  const { isAuthenticated, isAdmin, signOut, name, role, isLoading, profileCompleted } = useAuth()
  const { hotlineName, needsBootstrap, isLoading: configLoading } = useConfig()
  const { theme, setTheme } = useTheme()
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    if (isAuthenticated) {
      connectWebSocket()
      return () => disconnectWebSocket()
    }
  }, [isAuthenticated])

  useEffect(() => {
    // Wait for both auth and config to finish loading before redirecting
    if (!isLoading && !configLoading && !isAuthenticated && location.pathname !== '/login' && location.pathname !== '/onboarding' && location.pathname !== '/link-device' && location.pathname !== '/setup') {
      // If no admin exists, redirect to setup wizard (which includes bootstrap)
      if (needsBootstrap) {
        navigate({ to: '/setup' })
      } else {
        navigate({ to: '/login' })
      }
    }
  }, [isLoading, configLoading, isAuthenticated, location.pathname, navigate, needsBootstrap])

  useEffect(() => {
    if (!isLoading && isAuthenticated && (location.pathname === '/login')) {
      navigate({ to: profileCompleted ? '/' : '/profile-setup' })
    }
  }, [isLoading, isAuthenticated, location.pathname, navigate, profileCompleted])

  // Redirect to profile setup if not completed (skip during setup wizard)
  useEffect(() => {
    if (!isLoading && isAuthenticated && !profileCompleted && location.pathname !== '/profile-setup' && location.pathname !== '/login' && location.pathname !== '/setup') {
      navigate({ to: '/profile-setup' })
    }
  }, [isLoading, isAuthenticated, profileCompleted, location.pathname, navigate])

  // Redirect away from profile setup once completed
  useEffect(() => {
    if (!isLoading && isAuthenticated && profileCompleted && location.pathname === '/profile-setup') {
      navigate({ to: '/' })
    }
  }, [isLoading, isAuthenticated, profileCompleted, location.pathname, navigate])

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <LogoMark size="sm" className="animate-pulse" />
          {t('common.loading')}
        </div>
      </div>
    )
  }

  if (!isAuthenticated || !profileCompleted) {
    // Only render Outlet for public routes — prevent protected route components
    // from mounting and making API calls before the redirect effect fires
    const publicPaths = ['/login', '/onboarding', '/profile-setup', '/setup', '/link-device']
    if (!publicPaths.includes(location.pathname)) {
      return (
        <div className="flex h-screen items-center justify-center">
          <div className="flex items-center gap-2 text-muted-foreground">
            <LogoMark size="sm" className="animate-pulse" />
          </div>
        </div>
      )
    }
    return <Outlet />
  }

  return <AuthenticatedLayout />
}

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const

function AuthenticatedLayout() {
  const { t } = useTranslation()
  const { isAdmin, signOut, name, role, sessionExpiring, sessionExpired, renewSession } = useAuth()
  const { hotlineName, hotlineNumber, channels, demoMode } = useConfig()
  const hasMessaging = useHasMessaging()
  const { theme, setTheme } = useTheme()
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { currentCall } = useCalls()
  const { onShift, currentShift, nextShift } = useShiftStatus()
  useKeyboardShortcuts()

  // Close sidebar on navigation
  useEffect(() => {
    setSidebarOpen(false)
  }, [location.pathname])

  return (
    <div className="flex h-screen">
      {/* Skip link */}
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground">
        {t('a11y.skipToContent')}
      </a>

      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <nav className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-sidebar-border bg-sidebar transition-transform md:static md:visible md:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full invisible'}`}>
        <div className="border-b border-sidebar-border px-4 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <LogoMark size="sm" />
              <p className="text-lg font-bold text-sidebar-foreground">{hotlineName}</p>
            </div>
            <button onClick={() => setSidebarOpen(false)} className="md:hidden text-muted-foreground hover:text-foreground" aria-label={t('a11y.closeSidebar')}>
              <X className="h-5 w-5" />
            </button>
          </div>
          {name && (
            <div className="mt-2 space-y-1.5">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-xs font-medium text-primary">
                  {name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-medium text-sidebar-foreground">{name}</p>
                  <p className="text-xs text-muted-foreground capitalize">{role}</p>
                </div>
              </div>
              {/* In-call indicator */}
              {currentCall && (
                <div className="flex items-center gap-1.5 rounded-md bg-blue-500/10 px-2 py-1">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
                  <PhoneCall className="h-3 w-3 text-blue-500" />
                  <span className="text-xs font-medium text-blue-700 dark:text-blue-300">{t('dashboard.onCall')}</span>
                </div>
              )}
              {/* Shift status indicator */}
              {!currentCall && (
                <div className="flex items-center gap-1.5 px-2">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${onShift ? 'bg-green-500' : 'bg-gray-400'}`} />
                  <span className="text-xs text-muted-foreground">
                    {onShift && currentShift
                      ? `${currentShift.name} — ${t('shifts.until')} ${currentShift.endTime}`
                      : nextShift
                        ? `${t('shifts.nextShift')}: ${nextShift.name} ${t('shifts.days.' + DAY_NAMES[nextShift.day])} ${nextShift.startTime}`
                        : t('shifts.noShiftsAssigned')
                    }
                  </span>
                </div>
              )}
              {/* Hotline number */}
              {hotlineNumber && (
                <div className="flex items-center gap-1.5 px-2">
                  <PhoneIncoming className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <span className="font-mono text-xs text-muted-foreground">{hotlineNumber}</span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-3">
          {role === 'reporter' ? (
            <>
              {/* Reporter-specific nav: reports and help */}
              <NavLink to="/reports" icon={<FileText className="h-4 w-4" />}>
                {t('nav.reports', { defaultValue: 'My Reports' })}
              </NavLink>
              <NavLink to="/help" icon={<HelpCircle className="h-4 w-4" />}>
                {t('nav.help', { defaultValue: 'Help' })}
              </NavLink>
            </>
          ) : (
            <>
              <NavLink to="/" icon={<LayoutDashboard className="h-4 w-4" />}>{t('nav.dashboard')}</NavLink>
              <NavLink to="/notes" icon={<StickyNote className="h-4 w-4" />}>{t('nav.notes')}</NavLink>
              {hasMessaging && (
                <NavLink to="/conversations" icon={<MessageSquare className="h-4 w-4" />}>
                  {t('nav.conversations', { defaultValue: 'Conversations' })}
                </NavLink>
              )}
              {(channels?.reports || isAdmin) && (
                <NavLink to="/reports" icon={<FileText className="h-4 w-4" />}>
                  {t('nav.reports', { defaultValue: 'Reports' })}
                </NavLink>
              )}
            </>
          )}

          {isAdmin && (
            <>
              <div className="my-2 border-t border-sidebar-border" />
              <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-primary">
                {t('nav.admin', { defaultValue: 'Admin' })}
              </p>
              <NavLink to="/shifts" icon={<Clock className="h-4 w-4" />}>{t('nav.shifts')}</NavLink>
              <NavLink to="/volunteers" icon={<Users className="h-4 w-4" />}>{t('nav.volunteers')}</NavLink>
              <NavLink to="/bans" icon={<ShieldBan className="h-4 w-4" />}>{t('nav.banList')}</NavLink>
              <NavLink to="/calls" icon={<PhoneIncoming className="h-4 w-4" />}>{t('nav.callHistory')}</NavLink>
              <NavLink to="/audit" icon={<ScrollText className="h-4 w-4" />}>{t('nav.auditLog')}</NavLink>
              <NavLink to="/admin/settings" icon={<Settings className="h-4 w-4" />}>{t('nav.adminSettings')}</NavLink>
            </>
          )}
          <NavLink to="/settings" icon={<Settings className="h-4 w-4" />}>{t('nav.settings')}</NavLink>
          <NavLink to="/help" icon={<HelpCircle className="h-4 w-4" />}>{t('nav.help', { defaultValue: 'Help' })}</NavLink>
        </div>

        <div className="border-t border-sidebar-border p-3 space-y-1">
          <LanguageSelect size="sm" fullWidth />
          <div className="flex items-center gap-2 rounded-md px-3 py-2">
            {theme === 'dark' ? <Moon className="h-4 w-4 text-muted-foreground" /> : theme === 'light' ? <Sun className="h-4 w-4 text-muted-foreground" /> : <Monitor className="h-4 w-4 text-muted-foreground" />}
            <div className="flex gap-0.5">
              {([['system', Monitor], ['light', Sun], ['dark', Moon]] as const).map(([value, Icon]) => (
                <button
                  key={value}
                  onClick={() => setTheme(value)}
                  className={`rounded px-1.5 py-0.5 text-xs transition-colors ${theme === value ? 'bg-primary/20 text-primary font-medium' : 'text-muted-foreground hover:text-foreground'}`}
                  aria-label={t(`a11y.theme${value.charAt(0).toUpperCase() + value.slice(1)}`)}
                >
                  <Icon className="h-3.5 w-3.5" />
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={triggerCommandPalette}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <Search className="h-4 w-4" />
            {t('commandPalette.label')}
            <kbd className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
              {navigator.platform?.includes('Mac') ? '⌘K' : 'Ctrl K'}
            </kbd>
          </button>
          <button
            onClick={() => {
              signOut()
              navigate({ to: '/login' })
            }}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <LogOut className="h-4 w-4" />
            {t('common.logout')}
          </button>
        </div>
      </nav>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {demoMode && <DemoBanner />}

        {/* Mobile top bar */}
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-background px-4 py-3 md:hidden">
          <button onClick={() => setSidebarOpen(true)} aria-label={t('a11y.openMenu')}>
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <LogoMark size="sm" />
            <span className="font-semibold">{hotlineName}</span>
          </div>
        </header>

        <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto bg-background p-4 md:p-6">
          <Outlet />
        </main>
      </div>

      <CommandPalette />
      <KeyboardShortcutsDialog />
      <NoteSheet />

      {/* Session expiring warning */}
      {sessionExpiring && !sessionExpired && (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-lg border border-yellow-500/50 bg-yellow-50 px-4 py-3 shadow-lg dark:bg-yellow-950/90">
          <span className="text-sm font-medium text-yellow-800 dark:text-yellow-200">{t('session.expiringWarning')}</span>
          <button
            onClick={() => renewSession()}
            className="rounded-md bg-yellow-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-yellow-700"
          >
            {t('session.stayLoggedIn')}
          </button>
        </div>
      )}

      {/* Session expired modal */}
      {sessionExpired && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-sm rounded-lg border bg-background p-6 shadow-xl">
            <h2 className="text-lg font-semibold">{t('session.expired')}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{t('session.expiredDescription')}</p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={async () => {
                  try {
                    await renewSession()
                  } catch {
                    // If renewal fails, redirect to login
                    signOut()
                  }
                }}
                className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                {t('session.reconnect')}
              </button>
              <button
                onClick={() => signOut()}
                className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent"
              >
                {t('common.logout')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function NavLink({ to, children, icon }: { to: string; children: ReactNode; icon?: ReactNode }) {
  const location = useLocation()
  const isActive = location.pathname === to || (to === '/' ? false : location.pathname.startsWith(to))

  return (
    <Link
      to={to}
      className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors hover:bg-sidebar-accent ${
        isActive
          ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium border-l-[3px] border-primary pl-[9px]'
          : 'text-sidebar-foreground'
      }`}
    >
      {icon && <span className={isActive ? 'text-primary' : 'text-muted-foreground'}>{icon}</span>}
      {children}
    </Link>
  )
}
