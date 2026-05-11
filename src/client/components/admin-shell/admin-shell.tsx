import { Button } from '@/components/ui/button'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Menu } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AdminSidebar } from './admin-sidebar'

interface Props {
  currentSlug?: string
  currentLabelKey?: string
  children: ReactNode
}

export function AdminShell({ currentSlug, currentLabelKey, children }: Props) {
  const { t } = useTranslation()
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div data-testid="admin-shell" className="flex min-h-screen bg-background">
      {&#8203;}<aside className="hidden w-64 shrink-0 border-r border-sidebar-border lg:block">
        <AdminSidebar />
      </aside>

      {&#8203;}<Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          id="admin-sidebar-drawer"
          data-testid="admin-sidebar-drawer"
          aria-label={t('adminNav.openMenu')}
          className="w-72 border-r border-sidebar-border bg-sidebar p-0"
          showCloseButton={false}
        >
          <AdminSidebar onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      {&#8203;}<main className="flex-1 min-w-0">
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border/60 bg-background/90 px-4 py-3 backdrop-blur-md supports-[backdrop-filter]:bg-background/75 lg:px-8">
          <Button
            variant="ghost"
            size="icon"
            data-testid="admin-sidebar-toggle"
            className="-ml-1.5 lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label={t('adminNav.openMenu')}
            aria-expanded={mobileOpen}
            aria-controls="admin-sidebar-drawer"
          >
            <Menu className="h-5 w-5" />
          </Button>
          {currentLabelKey && (
            <h1
              data-testid="admin-section-heading"
              className="text-[15px] font-semibold tracking-tight text-foreground lg:text-lg"
            >
              {t(currentLabelKey)}
            </h1>
          )}
        </header>
        <div
          data-testid="admin-section"
          data-section={currentSlug ?? ''}
          className="px-4 py-8 lg:px-10 lg:py-10"
        >
          {children}
        </div>
      </main>
    </div>
  )
}
