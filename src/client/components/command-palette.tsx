import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/lib/auth'
import { useTheme } from '@/lib/theme'
import { useNoteSheet } from '@/lib/note-sheet-context'
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
} from '@/components/ui/command'
import { triggerShortcutsDialog } from '@/components/keyboard-shortcuts-dialog'
import {
  LayoutDashboard,
  StickyNote,
  Clock,
  Users,
  ShieldBan,
  PhoneIncoming,
  ScrollText,
  Settings,
  LogOut,
  Coffee,
  Sun,
  Moon,
  Monitor,
  Plus,
  Search,
  Keyboard,
  HelpCircle,
} from 'lucide-react'

let openCommandPalette: (() => void) | null = null

export function triggerCommandPalette() {
  openCommandPalette?.()
}

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const { t } = useTranslation()
  const { isAdmin, signOut, onBreak, toggleBreak } = useAuth()
  const { setTheme } = useTheme()
  const noteSheet = useNoteSheet()
  const navigate = useNavigate()

  const isMac = typeof navigator !== 'undefined' && navigator.platform?.includes('Mac')
  const mod = isMac ? '⌘' : 'Ctrl'

  useEffect(() => {
    openCommandPalette = () => setOpen(true)
    return () => { openCommandPalette = null }
  }, [])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(prev => !prev)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  function runCommand(fn: () => void) {
    setOpen(false)
    fn()
  }

  return (
    <>
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title={t('commandPalette.label')}
        description={t('commandPalette.placeholder')}
      >
        <CommandInput
          placeholder={t('commandPalette.placeholder')}
          value={searchQuery}
          onValueChange={setSearchQuery}
        />
        <CommandList>
          <CommandEmpty>{t('commandPalette.noResults')}</CommandEmpty>

          {/* Search shortcuts — shown when user types a query */}
          {searchQuery.trim().length > 1 && (
            <CommandGroup heading={t('common.search')}>
              <CommandItem onSelect={() => runCommand(() => navigate({ to: '/notes', search: { page: 1, callId: '', search: searchQuery.trim() } }))}>
                <Search className="h-4 w-4" />
                {t('commandPalette.searchNotes', { query: searchQuery.trim() })}
              </CommandItem>
              {isAdmin && (
                <CommandItem onSelect={() => runCommand(() => navigate({ to: '/calls', search: { page: 1, q: searchQuery.trim(), dateFrom: '', dateTo: '' } }))}>
                  <Search className="h-4 w-4" />
                  {t('commandPalette.searchCalls', { query: searchQuery.trim() })}
                </CommandItem>
              )}
            </CommandGroup>
          )}

          {/* Navigation */}
          <CommandGroup heading={t('commandPalette.navigation')}>
            <CommandItem onSelect={() => runCommand(() => navigate({ to: '/' }))}>
              <LayoutDashboard className="h-4 w-4" />
              {t('nav.dashboard')}
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => navigate({ to: '/notes', search: { page: 1, callId: '', search: '' } }))}>
              <StickyNote className="h-4 w-4" />
              {t('nav.notes')}
              <CommandShortcut>{mod}+Shift+F</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => navigate({ to: '/settings', search: { section: '' } }))}>
              <Settings className="h-4 w-4" />
              {t('nav.settings')}
            </CommandItem>
            {isAdmin && (
              <>
                <CommandItem onSelect={() => runCommand(() => navigate({ to: '/admin/settings', search: { section: '' } }))}>
                  <Settings className="h-4 w-4" />
                  {t('nav.hubSettings', { defaultValue: 'Hub Settings' })}
                </CommandItem>
                <CommandItem onSelect={() => runCommand(() => navigate({ to: '/shifts' }))}>
                  <Clock className="h-4 w-4" />
                  {t('nav.shifts')}
                </CommandItem>
                <CommandItem onSelect={() => runCommand(() => navigate({ to: '/volunteers' }))}>
                  <Users className="h-4 w-4" />
                  {t('nav.volunteers')}
                </CommandItem>
                <CommandItem onSelect={() => runCommand(() => navigate({ to: '/bans' }))}>
                  <ShieldBan className="h-4 w-4" />
                  {t('nav.banList')}
                </CommandItem>
                <CommandItem onSelect={() => runCommand(() => navigate({ to: '/calls', search: { page: 1, q: '', dateFrom: '', dateTo: '' } }))}>
                  <PhoneIncoming className="h-4 w-4" />
                  {t('nav.callHistory')}
                </CommandItem>
                <CommandItem onSelect={() => runCommand(() => navigate({ to: '/audit' }))}>
                  <ScrollText className="h-4 w-4" />
                  {t('nav.auditLog')}
                </CommandItem>
              </>
            )}
          </CommandGroup>

          {/* Actions */}
          <CommandGroup heading={t('commandPalette.actions')}>
            <CommandItem onSelect={() => runCommand(() => noteSheet.openNewNote())}>
              <Plus className="h-4 w-4" />
              {t('notes.newNote')}
              <CommandShortcut>Alt+N</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => toggleBreak())}>
              <Coffee className="h-4 w-4" />
              {onBreak ? t('dashboard.endBreak') : t('dashboard.goOnBreak')}
              <CommandShortcut>{mod}+Shift+B</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => navigate({ to: '/help' }))}>
              <HelpCircle className="h-4 w-4" />
              {t('nav.help', { defaultValue: 'Help' })}
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => triggerShortcutsDialog())}>
              <Keyboard className="h-4 w-4" />
              {t('shortcuts.title')}
              <CommandShortcut>?</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => { signOut(); navigate({ to: '/login' }) })}>
              <LogOut className="h-4 w-4" />
              {t('common.logout')}
            </CommandItem>
          </CommandGroup>

          {/* Theme */}
          <CommandGroup heading={t('commandPalette.theme')}>
            <CommandItem onSelect={() => runCommand(() => setTheme('system'))}>
              <Monitor className="h-4 w-4" />
              {t('a11y.themeSystem')}
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => setTheme('light'))}>
              <Sun className="h-4 w-4" />
              {t('a11y.themeLight')}
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => setTheme('dark'))}>
              <Moon className="h-4 w-4" />
              {t('a11y.themeDark')}
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  )
}
