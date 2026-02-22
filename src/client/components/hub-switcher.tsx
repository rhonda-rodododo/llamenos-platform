import { useConfig } from '@/lib/config'
import { useTranslation } from 'react-i18next'
import { Building2, ChevronDown } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'

export function HubSwitcher() {
  const { t } = useTranslation()
  const { hubs, currentHubId, setCurrentHubId, isMultiHub } = useConfig()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Don't show for single-hub deployments
  if (!isMultiHub) return null

  const currentHub = hubs.find(h => h.id === currentHubId)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div ref={ref} className="relative px-3 py-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 rounded-md border border-sidebar-border bg-sidebar-accent/50 px-3 py-2 text-left text-sm transition-colors hover:bg-sidebar-accent"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={t('hubs.switchHub', { defaultValue: 'Switch hub' })}
      >
        <Building2 className="h-4 w-4 shrink-0 text-primary" />
        <span className="flex-1 truncate font-medium text-sidebar-foreground">
          {currentHub?.name || t('hubs.selectHub', { defaultValue: 'Select hub' })}
        </span>
        <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-3 right-3 top-full z-50 mt-1 rounded-md border border-sidebar-border bg-sidebar shadow-lg">
          {hubs.map(hub => (
            <button
              key={hub.id}
              onClick={() => {
                setCurrentHubId(hub.id)
                setOpen(false)
              }}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-sidebar-accent ${
                hub.id === currentHubId ? 'bg-primary/10 text-primary font-medium' : 'text-sidebar-foreground'
              }`}
              role="option"
              aria-selected={hub.id === currentHubId}
            >
              <Building2 className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{hub.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
